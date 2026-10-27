// electron/wasapi/wasapiWorker.cjs
//
// Runs in a Node worker thread so blocking PCM writes and the FFmpeg decode feed never
// stall the Electron main process. Owns the native WASAPI renderer and the FFmpeg child.
// The worker probes the source format itself with music-metadata, so the renderer only has
// to hand it a local file path or a remote audio URL.
//
// Message protocol (main -> worker):
//   { type: 'init', nativePath, ffmpegPath }
//   { type: 'listDevices' }
//   { type: 'play',   source: { filePath } | { url }, startSec }
//   { type: 'pause' }
//   { type: 'resume', source, startSec }
//   { type: 'seek',   source, startSec }
//   { type: 'stop' }
//   { type: 'close' }
//
// Worker -> main:
//   { type: 'listDevices-result', devices }
//   { type: 'started', positionMs, bitPerfect }
//   { type: 'position', positionMs }
//   { type: 'ended', positionMs }
//   { type: 'fallback', message }
//   { type: 'error', message }

'use strict';

const { parentPort } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

let native = null;
let renderer = null;
let ffmpeg = null;
let ffmpegPath = '';
let positionBaseMs = 0;
let playing = false;
let positionTimer = null;
/** Explicit exclusive output device id ('' = system default). */
let deviceId = '';
/** Temp file backing a downloaded URL source, removed when the source changes or on stop. */
let tempSourcePath = null;
/** The URL `tempSourcePath` was downloaded from, so repeated play/seek reuses it. */
let tempSourceKey = null;
/** Serializes play/resume/seek so two exclusive opens never race for the same endpoint. */
let playbackBusy = false;
let pendingPlayback = null;
/** Bumped per playback; stale FFmpeg children and events are ignored by generation. */
let playbackGeneration = 0;
/** Format+device key of the currently open renderer, so consecutive tracks can reuse the stream
 *  instead of closing and reopening it (a running exclusive stream releases slowly, and the
 *  reopen then races the release with AUDCLNT_E_DEVICE_IN_USE). */
let openFormatKey = null;
/** In-flight URL download, aborted when a newer playback supersedes it. */
let activeDownload = null;
/** Shared debug log file (main process path); best-effort. */
let logPath = null;

const wlog = (message) => {
    if (!logPath) return;
    // Asynchronous so logging never blocks the worker's event loop (which must keep servicing
    // stop/pause/seek).
    fs.appendFile(logPath, `[${new Date().toISOString()}] worker ${message}\n`, () => {});
};

// Turns a bare AUDCLNT HRESULT into a phrase a user can act on.
const AUDCLNT_HINTS = {
    '88890008': 'device does not support this audio format/sample rate',
    '8889000a': 'device is already in use (another exclusive app?)',
    '88890004': 'device was invalidated or unplugged',
    '8889000e': 'exclusive mode is disabled for this device',
    '88890019': 'device buffer size not aligned',
    '88890020': 'invalid device period',
};
const describeAudioError = (message) => {
    const match = /0x([0-9a-f]{8})/i.exec(String(message || ''));
    const hint = match ? AUDCLNT_HINTS[match[1].toLowerCase()] : null;
    return hint ? `${message} [${hint}]` : String(message ?? '');
};

const post = (msg) => {
    try {
        parentPort.postMessage(msg);
    } catch {
        // The port may be closed during teardown.
    }
};

const loadNative = (nativePath) => {
    native = require(nativePath);
};

const killFfmpeg = () => {
    if (ffmpeg) {
        try {
            ffmpeg.kill();
        } catch {
            // Already gone.
        }
        ffmpeg = null;
    }
    ffmpegPaused = false;
};

const cleanupTemp = () => {
    if (tempSourcePath) {
        try {
            fs.rmSync(tempSourcePath, { force: true });
        } catch {
            // Best effort.
        }
        tempSourcePath = null;
        tempSourceKey = null;
    }
};

const stopRenderer = () => {
    if (renderer) {
        try {
            renderer.stop();
        } catch {
            // Not running.
        }
    }
};

const closeRenderer = () => {
    if (renderer) {
        try {
            renderer.close();
        } catch {
            // Ignore teardown failures.
        }
        renderer = null;
    }
    openFormatKey = null;
};

const clearPositionTimer = () => {
    if (positionTimer) {
        clearInterval(positionTimer);
        positionTimer = null;
    }
};

const currentPositionMs = () => {
    if (!renderer) return positionBaseMs;
    try {
        return positionBaseMs + renderer.getPositionMs();
    } catch {
        return positionBaseMs;
    }
};

// Streams a remote audio URL to a temp file so the (network-disabled) FFmpeg build can read it.
const downloadToTemp = async (url) => {
    wlog(`download ${url.slice(0, 200)}`);
    const controller = new AbortController();
    activeDownload = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    let tmp = null;
    try {
        const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
        if (!response.ok || !response.body) {
            throw new Error(`HTTP ${response.status}`);
        }
        let ext = '.audio';
        try {
            ext = path.extname(new URL(url).pathname) || ext;
        } catch {
            // Keep the fallback extension.
        }
        tmp = path.join(
            os.tmpdir(),
            `folia-wasapi-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
        );
        await pipeline(
            Readable.fromWeb(response.body),
            fs.createWriteStream(tmp),
            { signal: controller.signal },
        );
        return tmp;
    } catch (error) {
        if (tmp) {
            try {
                fs.rmSync(tmp, { force: true });
            } catch {
                // Best effort.
            }
        }
        throw error;
    } finally {
        clearTimeout(timer);
        if (activeDownload === controller) activeDownload = null;
    }
};

// Temp files written from renderer-supplied audio bytes, keyed by a stable name so a seek reuses
// the copy instead of re-sending tens of megabytes over IPC.
const bufferCache = new Map();
const MAX_BUFFER_CACHE = 3;

const evictBufferCache = () => {
    while (bufferCache.size > MAX_BUFFER_CACHE) {
        const [key, value] = bufferCache.entries().next().value;
        bufferCache.delete(key);
        try {
            fs.rmSync(value, { force: true });
        } catch {
            // Best effort.
        }
    }
};

const clearBufferCache = () => {
    bufferCache.forEach((value) => {
        try {
            fs.rmSync(value, { force: true });
        } catch {
            // Best effort.
        }
    });
    bufferCache.clear();
};

// Resolves a source descriptor to a local file FFmpeg can read, downloading a URL or spilling
// renderer-provided bytes to a temp file first.
const resolveSource = async (source) => {
    if (!source) throw new Error('unsupported audio source');
    if (source.kind === 'buffer') {
        const cached = bufferCache.get(source.name);
        if (cached && fs.existsSync(cached)) {
            wlog('reuse buffered audio');
            return { path: cached, temp: false, key: `buf:${source.name}` };
        }
        if (!source.bytes) throw new Error('audio buffer missing');
        const buffer = Buffer.from(source.bytes);
        const tmp = path.join(
            os.tmpdir(),
            `folia-wasapi-buf-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.audio`,
        );
        fs.writeFileSync(tmp, buffer);
        bufferCache.set(source.name, tmp);
        evictBufferCache();
        return { path: tmp, temp: false, key: `buf:${source.name}` };
    }
    if (typeof source.filePath === 'string' && source.filePath) {
        return { path: source.filePath, temp: false };
    }
    if (typeof source.url === 'string' && source.url) {
        // Reuse the already-downloaded copy when the same URL plays again (resume / seek), so a
        // seek does not re-download the whole track.
        if (tempSourcePath && tempSourceKey === source.url && fs.existsSync(tempSourcePath)) {
            wlog('reuse downloaded temp file');
            return { path: tempSourcePath, temp: true, key: source.url };
        }
        const tmp = await downloadToTemp(source.url);
        return { path: tmp, temp: true, key: source.url };
    }
    throw new Error('unsupported audio source');
};

const simplifyCodec = (codec) => {
    if (!codec) return 'PCM';
    const lower = String(codec).toLowerCase();
    if (lower.includes('aac') || lower.includes('mp4a')) return 'AAC';
    if (lower.includes('mp3') || lower.includes('layer 3') || lower.includes('mpeg')) return 'MP3';
    if (lower.includes('flac')) return 'FLAC';
    if (lower.includes('alac')) return 'ALAC';
    if (lower.includes('opus')) return 'Opus';
    if (lower.includes('vorbis')) return 'Vorbis';
    if (lower.includes('pcm') || lower.includes('wav') || lower.includes('wave')) return 'WAV';
    return codec;
};

// Probes a local audio file for its native format via music-metadata.
const probeFormat = async (filePath) => {
    const mm = await import('music-metadata');
    const metadata = await mm.parseFile(filePath, { duration: false, skipCovers: true });
    const format = metadata.format || {};
    return {
        sampleRate: Number(format.sampleRate) || 44100,
        channels: Number(format.numberOfChannels) || 2,
        bitsPerSample: Number(format.bitsPerSample) || 16,
        codec: format.codec || format.container || '',
        bitrate: Number(format.bitrate) || 0,
    };
};

// Locates the PCM payload inside a WAV header (searches for the 'data' chunk).
const findWavDataOffset = (buf) => {
    if (buf.length < 12) return -1;
    if (buf.toString('ascii', 0, 4) !== 'RIFF') return -1;
    let i = 12;
    while (i + 8 <= buf.length) {
        const id = buf.toString('ascii', i, i + 4);
        const size = buf.readUInt32LE(i + 4);
        if (id === 'data') return i + 8;
        i += 8 + size + (size & 1);
    }
    return -1;
};

// PCM waiting to be handed to the renderer. Drained asynchronously so the worker's event loop -
// and therefore stop/pause/seek handling - is never blocked by a full renderer ring.
let feedQueue = [];
let feedQueuedBytes = 0;
let feedScheduled = false;
// FFmpeg decodes far faster than real time, so without backpressure it fills this queue with the
// whole track in a second or two. The old cap silently dropped the OLDEST queued PCM - the bytes
// about to be played - which skips the audio forward (a 24-bit track decodes to over the old 64 MiB
// cap and jumped ~a minute; 16-bit stayed under it). Instead, pause FFmpeg's stdout when the queue
// runs ahead and resume it once the ring has drained, so no audio is ever discarded.
const FEED_HIGH_WATER_BYTES = 4 * 1024 * 1024;
const FEED_LOW_WATER_BYTES = 1024 * 1024;
const MAX_FEED_QUEUE_BYTES = 64 * 1024 * 1024;
let ffmpegPaused = false;

const pauseDecodeFeed = () => {
    if (ffmpegPaused) return;
    const stdout = ffmpeg && ffmpeg.stdout;
    if (stdout && !stdout.destroyed) {
        stdout.pause();
        ffmpegPaused = true;
        wlog(`feed backpressure pause queued=${feedQueuedBytes}`);
    }
};

const resumeDecodeFeed = () => {
    if (!ffmpegPaused) return;
    ffmpegPaused = false;
    const stdout = ffmpeg && ffmpeg.stdout;
    if (stdout && !stdout.destroyed) {
        stdout.resume();
    }
};

const clearFeedQueue = () => {
    feedQueue = [];
    feedQueuedBytes = 0;
};

const scheduleDrain = () => {
    if (feedScheduled) return;
    feedScheduled = true;
    setImmediate(drainFeed);
};

const drainFeed = () => {
    feedScheduled = false;
    if (!renderer || !playing) {
        clearFeedQueue();
        return;
    }
    while (feedQueue.length > 0) {
        const head = feedQueue[0];
        const accepted = renderer.writePcm(head);
        if (accepted === 0) break;
        if (accepted < head.length) {
            feedQueue[0] = head.subarray(accepted);
            feedQueuedBytes -= accepted;
            break;
        }
        feedQueue.shift();
        feedQueuedBytes -= head.length;
    }
    if (feedQueuedBytes <= FEED_LOW_WATER_BYTES) {
        resumeDecodeFeed();
    }
    if (feedQueue.length > 0) {
        // Ring still full; try again shortly without blocking.
        setTimeout(scheduleDrain, 15);
    }
};

// Queues a decoded PCM chunk and schedules an async drain.
const feed = (pcm) => {
    if (!renderer || !playing || pcm.length === 0) return;
    if (feedQueue.length === 0) {
        const accepted = renderer.writePcm(pcm);
        if (accepted === pcm.length) {
            return;
        }
        if (accepted > 0) {
            pcm = pcm.subarray(accepted);
        }
    }
    feedQueue.push(pcm);
    feedQueuedBytes += pcm.length;
    // Safety net only; backpressure below keeps the queue around the high-water mark.
    while (feedQueuedBytes > MAX_FEED_QUEUE_BYTES && feedQueue.length > 1) {
        const dropped = feedQueue.shift();
        feedQueuedBytes -= dropped.length;
    }
    if (feedQueuedBytes >= FEED_HIGH_WATER_BYTES) {
        pauseDecodeFeed();
    }
    scheduleDrain();
};

// Maps a source bit depth to the FFmpeg PCM encoder and the exclusive-mode output depth.
//
// 24-bit is rendered into a 32-bit container (24-in-32): many USB DACs only run 32-bit slots and
// misinterpret tightly-packed 3-byte 24-bit frames, which is heard as constant static. FFmpeg's
// pcm_s32le left-justifies the 24-bit sample in 32 bits, so no audio information is lost.
const pickCodec = (bitsPerSample) => {
    if (bitsPerSample <= 16) return { codec: 'pcm_s16le', openBits: 16 };
    return { codec: 'pcm_s32le', openBits: 32 };
};

// Decodes `filePath` to PCM (WAV on stdout) and feeds the renderer in real time.
const startDecode = ({ filePath, sampleRate, channels, startSec, codec, generation }) => {
    const args = [
        '-hide_banner', '-nostdin', '-v', 'error',
        ...(startSec > 0 ? ['-ss', String(startSec)] : []),
        '-i', filePath,
        '-map', '0:a:0', '-vn', '-sn', '-dn',
        '-ac', String(channels),
        '-ar', String(sampleRate),
        '-c:a', codec,
        '-f', 'wav', 'pipe:1',
    ];

    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    ffmpeg = child;

    let header = Buffer.alloc(0);
    let dataStarted = false;

    child.stdout.on('data', (chunk) => {
        // A newer playback has taken over; drop this child's output.
        if (generation !== playbackGeneration) return;
        if (dataStarted) {
            feed(chunk);
            return;
        }
        header = Buffer.concat([header, chunk]);
        const offset = findWavDataOffset(header);
        if (offset >= 0 && header.length >= offset) {
            const pcm = header.subarray(offset);
            dataStarted = true;
            if (pcm.length > 0) feed(pcm);
        }
    });

    child.stderr.on('data', () => {});

    child.once('error', (err) => {
        if (generation !== playbackGeneration) return;
        killFfmpeg();
        // FFmpeg could not run: exclusive playback is impossible, tell the renderer to fall back
        // to the HTML5 (shared-mode) output.
        post({ type: 'fallback', message: describeAudioError(err.message) });
    });

    child.once('close', () => {
        if (ffmpeg === child) ffmpeg = null;
        if (generation !== playbackGeneration) return; // superseded
        if (!playing) return;
        const waitDrain = () => {
            if (generation !== playbackGeneration || !playing) return;
            const buffered = renderer ? renderer.getBufferedBytes() : 0;
            const queued = feedQueue.length > 0 || feedQueuedBytes > 0;
            if (buffered <= 0 && !queued) {
                const endedPosition = currentPositionMs();
                playing = false;
                clearPositionTimer();
                try {
                    if (renderer) wlog(`underruns=${renderer.getUnderrunCount()} events=${renderer.getDiagnostics()}`);
                } catch {
                    // Diagnostics are best effort.
                }
                // Keep the endpoint for the next track to reuse; Stop+Reset clears the buffer.
                stopRenderer();
                post({ type: 'ended', positionMs: endedPosition });
                return;
            }
            setTimeout(waitDrain, 100);
        };
        waitDrain();
    });
};

// Opens the exclusive renderer, retrying briefly while a previous stream is still releasing the
// endpoint (AUDCLNT_E_DEVICE_IN_USE, 0x8889000a).
const openRendererWithRetry = async (targetDeviceId, format, openBits) => {
    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = new native.FoliaWasapi();
        try {
            candidate.openExclusive(targetDeviceId || '', {
                sampleRate: format.sampleRate,
                channels: format.channels,
                bitsPerSample: openBits,
                isFloat: false,
            });
            return candidate;
        } catch (error) {
            lastError = error;
            try {
                candidate.close();
            } catch {
                // Ignore.
            }
            if (!/0x8889000a/i.test(String(error && error.message || ''))) break;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
    throw lastError;
};

const startPlayback = async ({ source, startSec, deviceId: messageDeviceId }, generation) => {
    killFfmpeg();
    clearFeedQueue();
    clearPositionTimer();
    // The renderer is intentionally NOT closed here: the reuse/else branch below decides.

    // Drop the previous download only when the source actually changed (local file, or a new URL).
    const nextUrl = source && typeof source.url === 'string' ? source.url : null;
    if (nextUrl === null || (tempSourceKey && tempSourceKey !== nextUrl)) {
        cleanupTemp();
    }

    wlog(`play startSec=${startSec} source=${JSON.stringify(source).slice(0, 240)}`);
    const resolved = await resolveSource(source);
    if (resolved.temp) {
        tempSourcePath = resolved.path;
        tempSourceKey = resolved.key ?? nextUrl;
    }
    const filePath = resolved.path;

    const format = await probeFormat(filePath);
    // Output the source's native bit depth so exclusive playback stays bit-perfect. Requires an
    // FFmpeg build that carries the matching PCM encoders (see packaging/ffmpeg).
    const isLossy = /mp3|mpeg|aac|vorbis|opus|ogg|wma/i.test(format.codec || '');
    const { codec, openBits } = pickCodec(format.bitsPerSample);
    const bitPerfect = !isLossy && openBits >= (format.bitsPerSample || 16);
    wlog(`format sr=${format.sampleRate} ch=${format.channels} bits=${format.bitsPerSample} codec=${codec} openBits=${openBits} isLossy=${isLossy} bitPerfect=${bitPerfect}`);

    const targetDeviceId = typeof messageDeviceId === 'string' ? messageDeviceId : deviceId;
    const formatKey = `${targetDeviceId || '(default)'}|${format.sampleRate}|${format.channels}|${openBits}`;
    if (renderer && openFormatKey === formatKey) {
        // Same device and format: reuse the already-open exclusive stream. Stop+Reset keeps the
        // endpoint held, so there is no close/reopen race with the previous track.
        wlog('reuse open exclusive stream');
        stopRenderer();
    } else {
        closeRenderer();
        wlog(`openExclusive device=${targetDeviceId || '(default)'}`);
        renderer = await openRendererWithRetry(targetDeviceId, format, openBits);
        openFormatKey = formatKey;
    }
    clearFeedQueue();
    clearPositionTimer();

    positionBaseMs = startSec * 1000;
    playing = true;
    try {
        renderer.clearBuffer();
    } catch {}

    // Pre-buffer PCM before starting the WASAPI exclusive renderer.
    // Starting the audio client on an empty ring buffer causes immediate buffer underruns,
    // which results in buzzing, stuttering, and crackling ("rè").
    startDecode({ filePath, sampleRate: format.sampleRate, channels: format.channels, startSec, codec, generation });

    await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 300);
        const check = () => {
            if (generation !== playbackGeneration) {
                clearTimeout(timeout);
                resolve();
                return;
            }
            // 96 KiB is ~550ms of 44.1k/16bit stereo, or ~180ms of 96k/24bit stereo.
            if (feedQueuedBytes >= 96 * 1024) {
                clearTimeout(timeout);
                resolve();
                return;
            }
            setTimeout(check, 10);
        };
        check();
    });

    if (generation !== playbackGeneration) return;

    // Flush prebuffered audio directly into the renderer ring buffer before starting playback.
    drainFeed();

    renderer.start();
    wlog(`renderer started with prebuffered data (queued=${feedQueuedBytes})`);
    post({
        type: 'started',
        positionMs: positionBaseMs,
        bitPerfect,
        format: {
            sampleRate: format.sampleRate,
            channels: format.channels,
            bitsPerSample: isLossy ? undefined : (format.bitsPerSample || 16),
            codec: simplifyCodec(format.codec),
            bitrate: format.bitrate,
            openBits,
            deviceId: targetDeviceId,
        },
    });

    positionTimer = setInterval(() => {
        if (playing) {
            post({ type: 'position', positionMs: currentPositionMs() });
        }
    }, 250);
};

// Runs playbacks one at a time. Commands that arrive while one is running are coalesced to the
// latest, so rapid play/seek changes never open two exclusive streams at once (DEVICE_IN_USE).
const runPlayback = async (msg) => {
    playbackBusy = true;
    const generation = ++playbackGeneration;
    // A newer playback supersedes anything still in flight: stop the previous stream first.
    playing = false;
    clearPositionTimer();
    killFfmpeg();
    clearFeedQueue();
    stopRenderer();
    try {
        renderer?.clearBuffer();
    } catch {}
    // Abort a download for a superseded track so the new one is not stuck behind it.
    if (activeDownload) {
        try {
            activeDownload.abort();
        } catch {
            // Ignore.
        }
        activeDownload = null;
    }
    try {
        await startPlayback(msg, generation);
    } catch (err) {
        if (generation === playbackGeneration) {
            playing = false;
            cleanupTemp();
            const described = describeAudioError(String(err && err.message || err));
            wlog(`startPlayback failed -> fallback: ${described}`);
            post({ type: 'fallback', message: described });
        }
    } finally {
        playbackBusy = false;
        if (pendingPlayback) {
            const next = pendingPlayback;
            pendingPlayback = null;
            void runPlayback(next);
        }
    }
};

const requestPlayback = (msg) => {
    if (playbackBusy) {
        pendingPlayback = msg;
        return;
    }
    void runPlayback(msg);
};

parentPort.on('message', (msg) => {
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
        case 'init':
            logPath = msg.logPath || null;
            loadNative(msg.nativePath);
            ffmpegPath = msg.ffmpegPath;
            wlog(`init native=${msg.nativePath} ffmpeg=${msg.ffmpegPath}`);
            post({ type: 'init-result', ok: true });
            break;
        case 'listDevices': {
            try {
                const devices = native.enumerateOutputDevices();
                post({ type: 'listDevices-result', devices });
            } catch (err) {
                post({ type: 'error', message: String(err && err.message || err) });
            }
            break;
        }
        case 'setDevice':
            deviceId = typeof msg.deviceId === 'string' ? msg.deviceId : '';
            break;
        case 'play':
        case 'seek':
            requestPlayback(msg);
            break;
        case 'resume': {
            const reqStartSec = typeof msg.startSec === 'number' ? msg.startSec : 0;
            const currentSec = currentPositionMs() / 1000;
            const diff = Math.abs(reqStartSec - currentSec);
            // If the renderer is already in Paused state and the resume position is within 1s of current position,
            // resume instantly without restarting FFmpeg or flushing audio buffers.
            if (renderer && renderer.getState() === 'Paused' && ffmpeg && diff < 1.0) {
                wlog(`instant resume at ${currentPositionMs()}ms (diff=${diff.toFixed(3)}s)`);
                playing = true;
                resumeDecodeFeed();
                drainFeed();
                renderer.start();
                post({ type: 'started', positionMs: currentPositionMs(), bitPerfect: true });
                clearPositionTimer();
                positionTimer = setInterval(() => {
                    if (playing) {
                        post({ type: 'position', positionMs: currentPositionMs() });
                    }
                }, 250);
                break;
            }
            requestPlayback(msg);
            break;
        }
        case 'pause':
            pendingPlayback = null;
            playing = false;
            clearPositionTimer();
            pauseDecodeFeed();
            if (renderer) {
                try {
                    renderer.pause();
                } catch {
                    stopRenderer();
                }
            }
            post({ type: 'paused', positionMs: currentPositionMs() });
            wlog(`renderer paused at position=${currentPositionMs()}`);
            break;
        case 'stop':
            pendingPlayback = null;
            playbackGeneration += 1;
            playing = false;
            killFfmpeg();
            clearFeedQueue();
            clearPositionTimer();
            // Fully close the renderer: stopping alone would keep the exclusive endpoint held, so
            // Chromium could not resume and the next exclusive open would fail with DEVICE_IN_USE.
            closeRenderer();
            cleanupTemp();
            post({ type: 'stopped' });
            break;
        case 'close':
            pendingPlayback = null;
            playbackGeneration += 1;
            playing = false;
            killFfmpeg();
            clearFeedQueue();
            clearPositionTimer();
            closeRenderer();
            cleanupTemp();
            clearBufferCache();
            post({ type: 'closed' });
            break;
        default:
            break;
    }
});
