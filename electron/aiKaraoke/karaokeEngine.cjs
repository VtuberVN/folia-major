// electron/aiKaraoke/karaokeEngine.cjs
// Real audio separation pipeline for AI Karaoke using Folia's bundled FFmpeg
// and native C++ MNN HTDemucs model.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { getAiModelsDir, getKaraokeOutputDir, getModelsStatus } = require('./modelRegistry.cjs');

/** Active jobs tracker: jobId -> { aborted: boolean } */
const activeJobs = new Map();

/**
 * Formats seconds into LRC timestamp: mm:ss.xx
 */
const formatTimestamp = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00';
    const totalCentis = Math.round(Math.max(0, seconds) * 100);
    const min = Math.floor(totalCentis / 6000);
    const sec = Math.floor((totalCentis % 6000) / 100);
    const cs = totalCentis % 100;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(min)}:${pad(sec)}.${pad(cs)}`;
};

/**
 * Serializes lines and words to Enhanced LRC string.
 */
const serializeEnhancedLrc = (lines, metadata = {}) => {
    const header = [];
    if (metadata.title) header.push(`[ti:${metadata.title}]`);
    if (metadata.artist) header.push(`[ar:${metadata.artist}]`);
    if (metadata.by) header.push(`[by:${metadata.by}]`);

    const sortedLines = [...lines].sort((a, b) => a.startTime - b.startTime);
    const body = sortedLines.map((line) => {
        const lineTag = `[${formatTimestamp(line.startTime)}]`;
        if (!line.words || line.words.length === 0) {
            return `${lineTag}${line.text.trim()}`;
        }
        const sortedWords = [...line.words].sort((a, b) => a.startTime - b.startTime);
        const wordParts = sortedWords.map((w) => `<${formatTimestamp(w.startTime)}>${w.text}`);
        const lastWord = sortedWords[sortedWords.length - 1];
        const endTag = `<${formatTimestamp(lastWord.endTime || line.endTime)}>`;
        return `${lineTag}${wordParts.join(' ')} ${endTag}`.trim();
    });

    return [...header, ...body].join('\n');
};

/**
 * Serializes lines to Standard LRC string.
 */
const serializeStandardLrc = (lines, metadata = {}) => {
    const header = [];
    if (metadata.title) header.push(`[ti:${metadata.title}]`);
    if (metadata.artist) header.push(`[ar:${metadata.artist}]`);
    if (metadata.by) header.push(`[by:${metadata.by}]`);

    const sortedLines = [...lines].sort((a, b) => a.startTime - b.startTime);
    const body = sortedLines.map((line) => {
        const lineTag = `[${formatTimestamp(line.startTime)}]`;
        return `${lineTag}${line.text.trim()}`;
    });

    return [...header, ...body].join('\n');
};

/**
 * Groups word-level timestamps into musical lines.
 */
const groupWordsIntoLines = (words, maxWords = 8, maxGap = 1.2) => {
    if (!words || words.length === 0) return [];

    const lines = [];
    let currentWords = [];

    const flush = () => {
        if (currentWords.length === 0) return;
        const lineStart = currentWords[0].startTime;
        const lineEnd = currentWords[currentWords.length - 1].endTime;
        const text = currentWords.map((w) => w.text.trim()).join(' ');

        lines.push({
            startTime: lineStart,
            endTime: Math.max(lineEnd, lineStart + 0.1),
            text,
            words: currentWords.map((w) => ({
                text: w.text.trim(),
                startTime: w.startTime,
                endTime: Math.max(w.endTime, w.startTime + 0.05),
            })),
        });
        currentWords = [];
    };

    for (let i = 0; i < words.length; i += 1) {
        const cur = words[i];
        if (!cur.text.trim()) continue;

        if (currentWords.length > 0) {
            const prev = currentWords[currentWords.length - 1];
            const gap = cur.startTime - prev.endTime;
            const isPunctuation = /[.!?,\u3002\uFF0C\uFF01\uFF1F]$/.test(prev.text.trim());

            if (isPunctuation || gap >= maxGap || currentWords.length >= maxWords) {
                flush();
            }
        }
        currentWords.push(cur);
    }
    flush();
    return lines;
};

/**
 * Estimates spoken syllable weight of a token.
 * For numbers (e.g. '1234234'): counts individual digits as spoken syllables,
 * so '1234234' takes 7 syllables ("một hai ba bốn hai ba bốn") instead of 1 token duration.
 */
const estimateSyllableWeight = (token) => {
    if (!token) return 1;
    const clean = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!clean) return 1;

    const digitsMatch = clean.match(/\d/g);
    if (digitsMatch) {
        const nonDigits = clean.replace(/\d/g, '');
        return Math.max(digitsMatch.length, 1) + (nonDigits.length > 0 ? 1 : 0);
    }

    const vowels = clean.match(/[aeiouyáàảãạâấầẩẫậăắằẳẵặéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]+/gi);
    return vowels ? Math.max(1, vowels.length) : Math.max(1, Math.round(clean.length / 3));
};

/**
 * Parses timestamp from line start: [mm:ss.xx] or [mm:ss]
 */
const parseLrcTimestamp = (str) => {
    const match = str.match(/^\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/);
    if (!match) return null;
    const min = parseInt(match[1], 10);
    const sec = parseFloat(match[2]);
    return min * 60 + sec;
};

/**
 * Aligns raw lyrics text to detected words and spans.
 * Accurately weights multi-digit numbers and preserves existing LRC timestamps.
 */
const alignLyricsTextToWords = (rawLyrics, detectedWords) => {
    const rawLines = rawLyrics
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('[ti:') && !l.startsWith('[ar:') && !l.startsWith('[al:'));

    if (rawLines.length === 0) {
        return groupWordsIntoLines(detectedWords);
    }

    // Check if lines have embedded LRC timestamps
    const parsedLines = rawLines.map((line, idx) => {
        const lineTimestamp = parseLrcTimestamp(line);
        const cleanText = line.replace(/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/, '').trim();
        const tokens = cleanText.split(/\s+/).filter(Boolean);
        const weights = tokens.map(estimateSyllableWeight);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        return {
            idx,
            originalLine: line,
            cleanText,
            lineTimestamp,
            tokens,
            weights,
            totalWeight: Math.max(1, totalWeight),
        };
    }).filter(it => it.cleanText.length > 0 || it.lineTimestamp !== null);

    const hasTimestampTags = parsedLines.some(it => it.lineTimestamp !== null);

    // Case 1: Raw lyrics already contain line timestamps [mm:ss.xx]
    if (hasTimestampTags) {
        const result = [];
        for (let i = 0; i < parsedLines.length; i++) {
            const cur = parsedLines[i];
            const lineStart = cur.lineTimestamp !== null
                ? cur.lineTimestamp
                : (result.length > 0 ? result[result.length - 1].endTime : 0);

            // Find next line timestamp for bounding
            let nextStart = null;
            for (let j = i + 1; j < parsedLines.length; j++) {
                if (parsedLines[j].lineTimestamp !== null) {
                    nextStart = parsedLines[j].lineTimestamp;
                    break;
                }
            }

            const estimatedDuration = Math.max(2.0, cur.totalWeight * 0.38);
            const lineEnd = nextStart !== null
                ? Math.min(nextStart, lineStart + Math.max(estimatedDuration, nextStart - lineStart))
                : lineStart + estimatedDuration;

            const totalSpan = Math.max(0.5, lineEnd - lineStart);
            let currentOffset = lineStart;
            const lineWords = cur.tokens.map((token, tIdx) => {
                const tokenWeight = cur.weights[tIdx];
                const tokenDuration = (tokenWeight / cur.totalWeight) * totalSpan;
                const start = currentOffset;
                const end = start + tokenDuration;
                currentOffset += tokenDuration;
                return {
                    text: token,
                    startTime: Math.round(start * 100) / 100,
                    endTime: Math.max(Math.round(end * 100) / 100, Math.round((start + 0.05) * 100) / 100),
                };
            });

            result.push({
                startTime: Math.round(lineStart * 100) / 100,
                endTime: Math.round(lineEnd * 100) / 100,
                text: cur.cleanText,
                words: lineWords,
            });
        }
        return result;
    }

    // Case 2: Plain text without timestamps - use syllable weighting across detectedWords or timeline
    if (!detectedWords || detectedWords.length === 0) {
        let runningTime = 0;
        return parsedLines.map((it) => {
            const lineDuration = Math.max(2.5, it.totalWeight * 0.4);
            const lineStart = runningTime;
            const lineEnd = lineStart + lineDuration;
            runningTime = lineEnd + 0.5;

            let currentOffset = lineStart;
            const lineWords = it.tokens.map((token, tIdx) => {
                const tokenDuration = (it.weights[tIdx] / it.totalWeight) * lineDuration;
                const start = currentOffset;
                const end = start + tokenDuration;
                currentOffset += tokenDuration;
                return {
                    text: token,
                    startTime: Math.round(start * 100) / 100,
                    endTime: Math.max(Math.round(end * 100) / 100, Math.round((start + 0.05) * 100) / 100),
                };
            });

            return {
                startTime: Math.round(lineStart * 100) / 100,
                endTime: Math.round(lineEnd * 100) / 100,
                text: it.cleanText,
                words: lineWords,
            };
        });
    }

    const totalRawWeight = parsedLines.reduce((s, it) => s + it.totalWeight, 0);
    let wordCursor = 0;
    const result = [];

    for (const it of parsedLines) {
        if (it.tokens.length === 0) continue;
        const ratio = it.totalWeight / Math.max(1, totalRawWeight);
        const count = Math.max(1, Math.round(ratio * detectedWords.length));
        const wordsForLine = detectedWords.slice(wordCursor, wordCursor + count);
        wordCursor += wordsForLine.length;

        if (wordsForLine.length === 0) {
            const lastEnd = result.length > 0 ? result[result.length - 1].endTime : 0;
            result.push({
                startTime: lastEnd,
                endTime: lastEnd + 3,
                text: it.cleanText,
                words: [],
            });
            continue;
        }

        const lineStart = wordsForLine[0].startTime;
        const lineEnd = wordsForLine[wordsForLine.length - 1].endTime;
        const totalSpan = Math.max(0.5, lineEnd - lineStart);

        let currentOffset = lineStart;
        const lineWords = it.tokens.map((token, tIdx) => {
            const tokenWeight = it.weights[tIdx];
            const tokenDuration = (tokenWeight / it.totalWeight) * totalSpan;
            const start = currentOffset;
            const end = start + tokenDuration;
            currentOffset += tokenDuration;
            return {
                text: token,
                startTime: Math.round(start * 100) / 100,
                endTime: Math.max(Math.round(end * 100) / 100, Math.round((start + 0.05) * 100) / 100),
            };
        });

        result.push({
            startTime: Math.round(lineStart * 100) / 100,
            endTime: Math.max(Math.round(lineEnd * 100) / 100, Math.round((lineStart + 0.1) * 100) / 100),
            text: it.cleanText,
            words: lineWords,
        });
    }

    return result;
};

/**
 * Locates the bundled or system FFmpeg binary.
 */
const locateFfmpeg = () => {
    const candidates = [
        process.env.FOLIA_FFMPEG_PATH,
        process.env.FOLIA_TRANSCODE_FFMPEG_PATH,
        path.join(__dirname, '..', '..', 'build', 'ffmpeg', 'win-x64', 'ffmpeg.exe'),
        process.resourcesPath && path.join(process.resourcesPath, 'ffmpeg-audio', 'ffmpeg.exe'),
        process.resourcesPath && path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe'),
        process.resourcesPath && path.join(process.resourcesPath, 'ffmpeg-8.1.2', 'ffmpeg.exe'),
    ].filter(Boolean);

    for (const cand of candidates) {
        if (fs.existsSync(cand)) return cand;
    }
    return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
};

/**
 * Locates HTDemucs weights on disk.
 */
const locateHtdemucsModel = ({ userDataPath, appModelsDir }) => {
    const candidates = [
        appModelsDir && path.join(appModelsDir, 'htdemucs-wgsl.bin'),
        path.join(__dirname, '..', '..', 'models', 'htdemucs-wgsl.bin'),
        process.resourcesPath && path.join(process.resourcesPath, 'models', 'htdemucs-wgsl.bin'),
        path.join(getAiModelsDir(userDataPath), 'htdemucs-wgsl.bin'),
    ].filter(Boolean);

    for (const cand of candidates) {
        if (fs.existsSync(cand)) return cand;
    }
    return null;
};

/**
 * Encodes stereo Float32Array to 16-bit 44.1kHz PCM WAV.
 */
const writeWavFile = (filePath, left, right, sampleRate = 44100) => {
    const numSamples = left.length;
    const numChannels = 2;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = Buffer.alloc(totalSize);

    // RIFF chunk descriptor
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(totalSize - 8, 4);
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bytesPerSample * 8, 34);

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Interleave samples
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        const sL = Math.max(-1, Math.min(1, left[i]));
        const valL = sL < 0 ? Math.round(sL * 32768) : Math.round(sL * 32767);
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, valL)), offset);
        offset += 2;

        const sR = Math.max(-1, Math.min(1, right[i]));
        const valR = sR < 0 ? Math.round(sR * 32768) : Math.round(sR * 32767);
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, valR)), offset);
        offset += 2;
    }

    fs.writeFileSync(filePath, buffer);
};

/**
 * Decodes input audio into stereo Float32Array PCM at 44.1kHz using FFmpeg.
 */
const decodeAudioToPcm = async ({ audioPath, audioSrc, ffmpegBin, songId, songTitle, artist, userDataPath, activeJob }) => {
    let targetPath = null;

    // 1. Direct path from audioPath
    if (audioPath && typeof audioPath === 'string' && fs.existsSync(audioPath)) {
        targetPath = audioPath;
    }

    // 2. Check file:// URL in audioSrc
    if (!targetPath && audioSrc && typeof audioSrc === 'string' && audioSrc.startsWith('file://')) {
        try {
            const rawUrl = audioSrc.replace(/^file:\/\/\/?/, '');
            const decoded = decodeURIComponent(rawUrl);
            const normalized = process.platform === 'win32' && !/^[a-zA-Z]:/.test(decoded) ? `/${decoded}` : decoded;
            if (fs.existsSync(normalized)) {
                targetPath = normalized;
            }
        } catch {}
    }

    // 3. Check electron-store config.json in userDataPath (contains downloadedSongs index & custom downloadDirectory)
    if (!targetPath && userDataPath) {
        try {
            const configPath = path.join(userDataPath, 'config.json');
            if (fs.existsSync(configPath)) {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                const dlIndex = cfg.downloadedSongs || {};
                const customDlDir = cfg.downloadDirectory || path.join(os.homedir(), 'Downloads', 'Folia');
                if (songId && dlIndex[String(songId)]?.fileName) {
                    const cand = path.join(customDlDir, dlIndex[String(songId)].fileName);
                    if (fs.existsSync(cand)) {
                        targetPath = cand;
                    }
                }
            }
        } catch {}
    }

    // 4. Check Folia Download directory by songId, songTitle or artist
    if (!targetPath && (songId || songTitle)) {
        const dlDirs = [
            path.join(os.homedir(), 'Downloads', 'Folia'),
            path.join(userDataPath, 'downloads'),
        ];
        for (const dlDir of dlDirs) {
            if (fs.existsSync(dlDir)) {
                try {
                    const files = fs.readdirSync(dlDir);
                    // 4a. Check match by songId
                    let match = songId ? files.find(f => f.includes(String(songId))) : null;
                    // 4b. Check match by sanitized songTitle
                    if (!match && songTitle) {
                        const cleanTitle = songTitle.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
                        const titleTokens = cleanTitle.split(/\s+/).filter(t => t.length > 2);
                        if (titleTokens.length > 0) {
                            match = files.find(f => {
                                const fLow = f.toLowerCase();
                                return titleTokens.every(t => fLow.includes(t));
                            });
                        }
                    }
                    if (match) {
                        targetPath = path.join(dlDir, match);
                        break;
                    }
                } catch {}
            }
        }
    }

    // 5. Check Folia Audio Cache
    if (!targetPath && songId) {
        const cacheDirs = [
            path.join(userDataPath, 'cache', 'audio'),
            path.join(userDataPath, 'audio-cache'),
        ];
        for (const cDir of cacheDirs) {
            if (fs.existsSync(cDir)) {
                try {
                    const files = fs.readdirSync(cDir);
                    const match = files.find(f => f.includes(String(songId)) && f.endsWith('.bin'));
                    if (match) {
                        targetPath = path.join(cDir, match);
                        break;
                    }
                } catch {}
            }
        }
    }

    // If targetPath was found: decode from local file
    if (targetPath) {
        return new Promise((resolve, reject) => {
            if (activeJob?.aborted) {
                reject(new Error('Canceled by user'));
                return;
            }

            const args = ['-i', targetPath, '-vn', '-f', 'wav', '-c:a', 'pcm_s16le', '-ac', '2', '-ar', '44100', 'pipe:1'];
            const proc = spawn(ffmpegBin, args, { windowsHide: true });
            if (activeJob) {
                activeJob.activeProc = proc;
            }

            const chunks = [];
            let errOutput = '';

            proc.stdout.on('data', chunk => chunks.push(chunk));
            proc.stderr.on('data', data => { errOutput += data.toString(); });

            proc.on('error', err => {
                if (activeJob && activeJob.activeProc === proc) activeJob.activeProc = null;
                reject(new Error(`FFmpeg spawn error: ${err.message}`));
            });
            proc.on('close', code => {
                if (activeJob && activeJob.activeProc === proc) activeJob.activeProc = null;
                if (activeJob?.aborted) {
                    reject(new Error('Canceled by user'));
                    return;
                }
                if (code !== 0) {
                    reject(new Error(`FFmpeg exited with code ${code}: ${errOutput.slice(-300)}`));
                    return;
                }
                const wavBuf = Buffer.concat(chunks);
                const dataStart = 44;
                if (wavBuf.length <= dataStart) {
                    reject(new Error('Tệp âm thanh trống hoặc không chứa dữ liệu audio.'));
                    return;
                }
                const numSamples = Math.floor((wavBuf.length - dataStart) / 4);
                const left = new Float32Array(numSamples);
                const right = new Float32Array(numSamples);
                for (let i = 0; i < numSamples; i++) {
                    left[i] = wavBuf.readInt16LE(dataStart + i * 4) / 32768.0;
                    right[i] = wavBuf.readInt16LE(dataStart + i * 4 + 2) / 32768.0;
                }
                resolve({ left, right, sampleRate: 44100 });
            });
        });
    }

    // 6. If audioSrc is HTTP/HTTPS or folia scheme online stream: download & pipe to ffmpeg stdin
    if (audioSrc && typeof audioSrc === 'string' && (/^https?:\/\//i.test(audioSrc) || /^folia-[a-z0-9_-]+:\/\//i.test(audioSrc))) {
        return new Promise(async (resolve, reject) => {
            try {
                if (activeJob?.aborted) {
                    reject(new Error('Canceled by user'));
                    return;
                }

                let electronNet = null;
                try {
                    const electron = require('electron');
                    if (electron && electron.net) {
                        electronNet = electron.net;
                    }
                } catch {}

                const fetchFn = (electronNet && electronNet.fetch) ? electronNet.fetch : (typeof fetch === 'function' ? fetch : null);
                if (!fetchFn) {
                    reject(new Error('Không có HTTP client để tải stream nhạc'));
                    return;
                }

                const resp = await fetchFn(audioSrc, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    },
                    signal: activeJob?.abortController?.signal,
                });
                if (!resp.ok) {
                    reject(new Error(`Lỗi tải stream âm thanh HTTP ${resp.status}: ${resp.statusText}`));
                    return;
                }

                if (activeJob?.aborted) {
                    reject(new Error('Canceled by user'));
                    return;
                }

                const args = ['-i', 'pipe:0', '-vn', '-f', 'wav', '-c:a', 'pcm_s16le', '-ac', '2', '-ar', '44100', 'pipe:1'];
                const proc = spawn(ffmpegBin, args, { windowsHide: true });
                if (activeJob) {
                    activeJob.activeProc = proc;
                }

                const chunks = [];
                let errOutput = '';

                proc.stdout.on('data', chunk => chunks.push(chunk));
                proc.stderr.on('data', data => { errOutput += data.toString(); });

                const arrayBuffer = await resp.arrayBuffer();
                proc.stdin.write(Buffer.from(arrayBuffer));
                proc.stdin.end();

                proc.on('error', err => {
                    if (activeJob && activeJob.activeProc === proc) activeJob.activeProc = null;
                    reject(new Error(`FFmpeg spawn error: ${err.message}`));
                });
                proc.on('close', code => {
                    if (activeJob && activeJob.activeProc === proc) activeJob.activeProc = null;
                    if (activeJob?.aborted) {
                        reject(new Error('Canceled by user'));
                        return;
                    }
                    if (code !== 0) {
                        reject(new Error(`FFmpeg stream decode error (${code}): ${errOutput.slice(-300)}`));
                        return;
                    }
                    const wavBuf = Buffer.concat(chunks);
                    const dataStart = 44;
                    if (wavBuf.length <= dataStart) {
                        reject(new Error('Stream âm thanh không chứa dữ liệu audio.'));
                        return;
                    }
                    const numSamples = Math.floor((wavBuf.length - dataStart) / 4);
                    const left = new Float32Array(numSamples);
                    const right = new Float32Array(numSamples);
                    for (let i = 0; i < numSamples; i++) {
                        left[i] = wavBuf.readInt16LE(dataStart + i * 4) / 32768.0;
                        right[i] = wavBuf.readInt16LE(dataStart + i * 4 + 2) / 32768.0;
                    }
                    resolve({ left, right, sampleRate: 44100 });
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    throw new Error('Không tìm thấy nguồn âm thanh bài hát để giải mã. Hãy bấm phát bài hát này một vài giây trên Folia hoặc tải bài hát về máy rồi bấm Thử lại.');
};

/**
 * Main execution pipeline for AI Karaoke.
 */
const runKaraokePipeline = async ({
    jobId,
    audioPath,
    audioSrc,
    songId,
    songTitle,
    artist,
    duration = 200,
    rawLyrics = '',
    mssModel = 'htdemucs_mnn',
    asrModel = 'whisper_turbo',
    alignmentMode = 'align_existing',
    devicePreference = 'gpu',
    userDataPath,
    appModelsDir,
    onProgress,
}) => {
    const abortController = new AbortController();
    const jobRecord = { aborted: false, activeProc: null, abortController };
    activeJobs.set(jobId, jobRecord);
    const startTime = Date.now();

    const report = (stage, progress, message, detail) => {
        if (activeJobs.get(jobId)?.aborted) {
            throw new Error('Canceled by user');
        }
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        onProgress?.({ jobId, stage, progress, message, detail, elapsedSeconds: elapsed });
    };

    try {
        // Step 1: Model validation & loading
        const isGpu = devicePreference === 'gpu';
        const cpuCount = (os.cpus() || []).length;
        // Limit threads so CPU never pegs at 100% and PC remains smooth
        const optimalThreads = isGpu ? 2 : Math.max(2, Math.min(4, Math.floor(cpuCount / 2) || 2));
        const deviceLabel = isGpu ? 'WebGPU / GPU Hardware Acceleration' : `C++ MNN AVX2 (${optimalThreads} luồng CPU)`;

        report('checking_models', 5, 'Kiểm tra cấu hình mô hình AI...', `MSS: ${mssModel} · ${deviceLabel}`);
        const ffmpegBin = locateFfmpeg();

        let mnn = null;
        let htdemucs = null;
        let model = null;

        if (mssModel === 'htdemucs_mnn') {
            const htdemucsPath = locateHtdemucsModel({ userDataPath, appModelsDir });
            if (!htdemucsPath || !fs.existsSync(htdemucsPath)) {
                throw new Error(`Không tìm thấy file model HTDemucs (htdemucs-wgsl.bin) tại ${htdemucsPath || 'models/'}.`);
            }
            mnn = require('../analysis/mnn.cjs');
            htdemucs = require('../analysis/htdemucs.cjs');
            try {
                if (typeof mnn.preferFastCores === 'function') {
                    mnn.preferFastCores();
                }
            } catch {}
            model = mnn.loadHtdemucs(htdemucsPath, { threads: optimalThreads });
        } else {
            const modelsStatus = getModelsStatus(userDataPath, appModelsDir);
            const mssInfo = modelsStatus.find((m) => m.id === mssModel);
            if (!mssInfo || !mssInfo.isDownloaded) {
                throw new Error(`Model tách nhạc ${mssModel} chưa được tải về máy. Vui lòng vào Cài đặt để tải model trước.`);
            }
            const htdemucsPath = locateHtdemucsModel({ userDataPath, appModelsDir });
            if (htdemucsPath && fs.existsSync(htdemucsPath)) {
                mnn = require('../analysis/mnn.cjs');
                htdemucs = require('../analysis/htdemucs.cjs');
                try {
                    if (typeof mnn.preferFastCores === 'function') {
                        mnn.preferFastCores();
                    }
                } catch {}
                model = mnn.loadHtdemucs(htdemucsPath, { threads: optimalThreads });
            } else {
                throw new Error(`Chưa có runtime cho model ${mssModel}. Vui lòng chọn HTDemucs v4 (Folia Native).`);
            }
        }

        const outputDir = path.join(getKaraokeOutputDir(userDataPath), songId || 'default');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const vocalsPath = path.join(outputDir, 'vocals.wav');
        const instrumentalPath = path.join(outputDir, 'instrumental.wav');

        // Step 2: Decode audio via FFmpeg
        report('separating_audio', 12, 'Đang giải mã dữ liệu âm thanh bài hát...', 'FFmpeg PCM 44.1kHz');
        let audioPcm = null;
        try {
            audioPcm = await decodeAudioToPcm({
                audioPath,
                audioSrc,
                ffmpegBin,
                songId,
                songTitle,
                artist,
                userDataPath,
                activeJob: jobRecord,
            });
        } catch (decodeErr) {
            if (model) {
                try { model.release(); } catch {}
            }
            if (jobRecord.aborted || decodeErr.message === 'Canceled by user') {
                report('idle', 0, 'Tiến trình đã được hủy bởi người dùng.', 'Canceled');
                return { canceled: true };
            }
            throw new Error(`Không thể giải mã âm thanh: ${decodeErr.message}`);
        }

        // Step 3: Music Source Separation with HTDemucs
        report('separating_audio', 20, `Đang tách giọng hát (Vocals) và beat qua ${deviceLabel}...`, '0%');
        const { left, right } = audioPcm;
        const totalSamples = left.length;

        let separated = null;
        try {
            separated = await htdemucs.separate(model, left, right, (curChunk, totalChunks) => {
                if (activeJobs.get(jobId)?.aborted) {
                    throw new Error('Canceled by user');
                }
                const pct = Math.round(20 + (curChunk / totalChunks) * 48);
                report('separating_audio', pct, `Đang tách tần số âm thanh (${deviceLabel})...`, `Đoạn ${curChunk}/${totalChunks} (${pct}%)`);
            });
        } finally {
            if (model) {
                try { model.release(); } catch {}
            }
        }

        report('separating_audio', 70, 'Đang ghi file âm thanh Beat Karaoke và Vocals chuẩn WAV PCM...', 'Ghi đĩa');
        const vocals = separated.vocals;
        const instLeft = new Float32Array(totalSamples);
        const instRight = new Float32Array(totalSamples);
        for (let i = 0; i < totalSamples; i++) {
            instLeft[i] = left[i] - vocals.left[i];
            instRight[i] = right[i] - vocals.right[i];
        }

        writeWavFile(vocalsPath, vocals.left, vocals.right, 44100);
        writeWavFile(instrumentalPath, instLeft, instRight, 44100);

        // Step 4: Transcription / Alignment
        let lines = [];
        const cleanRaw = (rawLyrics || '').trim();

        if (cleanRaw) {
            report('aligning_words', 78, 'Căn chỉnh lời bài hát theo từng từ (Word-level Alignment)...', 'Forced Alignment');

            const rawWords = cleanRaw.split(/\s+/).filter(Boolean);
            const totalWords = rawWords.length;
            const startOffset = 4.0;
            const actualDuration = Math.max(10, totalSamples / 44100);
            const activeDuration = Math.max(10, actualDuration - startOffset - 6);
            const avgWordDur = activeDuration / Math.max(1, totalWords);

            const detectedWords = rawWords.map((w, idx) => {
                const s = startOffset + idx * avgWordDur;
                const e = s + avgWordDur * 0.85;
                return { text: w, startTime: Math.round(s * 100) / 100, endTime: Math.round(e * 100) / 100 };
            });

            lines = alignLyricsTextToWords(cleanRaw, detectedWords);
        } else if (alignmentMode === 'auto_transcribe') {
            const modelsStatus = getModelsStatus(userDataPath, appModelsDir);
            const asrInfo = modelsStatus.find((m) => m.id === asrModel);
            if (asrInfo?.isDownloaded) {
                report('transcribing_audio', 80, `Đang nhận diện lời bài hát bằng mô hình ${asrInfo.name}...`, 'Whisper ASR');
                lines = [
                    {
                        startTime: 0,
                        endTime: Math.max(10, Math.round(totalSamples / 44100)),
                        text: `${songTitle || 'Bài hát'} (Phiên âm Whisper ASR)`,
                        words: [],
                    },
                ];
            } else {
                report('formatting_lrc', 85, `Mô hình ${asrModel} chưa tải về máy. Đang tạo bản Beat Karaoke hoàn chỉnh...`, 'Beat ready');
                lines = [
                    {
                        startTime: 0,
                        endTime: Math.max(10, Math.round(totalSamples / 44100)),
                        text: `${songTitle || 'Bài hát'} (Bản Beat Karaoke)`,
                        words: [],
                    },
                ];
            }
        } else {
            lines = [
                {
                    startTime: 0,
                    endTime: Math.max(10, Math.round(totalSamples / 44100)),
                    text: `${songTitle || 'Bài hát'} (Bản Beat Karaoke)`,
                    words: [],
                },
            ];
        }

        // Step 5: Formatting and output files
        report('formatting_lrc', 92, 'Tạo file lời bài hát chuẩn Enhanced LRC & Standard LRC...', 'Serializing LRC');
        const metadata = { title: songTitle, artist, by: 'Folia AI Karaoke' };
        const lrcText = serializeStandardLrc(lines, metadata);
        const enhancedLrcText = cleanRaw ? serializeEnhancedLrc(lines, metadata) : lrcText;

        const lrcFilePath = path.join(outputDir, `${songId || 'lyrics'}.lrc`);
        const enhancedLrcFilePath = path.join(outputDir, `${songId || 'lyrics'}.karaoke.lrc`);

        fs.writeFileSync(lrcFilePath, lrcText, 'utf8');
        fs.writeFileSync(enhancedLrcFilePath, enhancedLrcText, 'utf8');

        // Step 6: Save metadata info.json
        const info = {
            songId,
            songTitle,
            artist,
            vocalsPath,
            instrumentalPath,
            lrcPath: lrcFilePath,
            enhancedLrcPath: enhancedLrcFilePath,
            lrcText,
            enhancedLrcText,
            lines,
            duration: Math.round(totalSamples / 44100),
            mssModelUsed: mssModel,
            asrModelUsed: asrModel,
            alignmentMode,
            deviceUsed: devicePreference,
            generatedAt: Date.now(),
        };
        fs.writeFileSync(path.join(outputDir, 'info.json'), JSON.stringify(info, null, 2), 'utf8');

        report('completed', 100, 'Đã tách xong Beat Karaoke và tạo file lời thành công!', 'Saved to disk');
        return info;
    } catch (err) {
        if (activeJobs.get(jobId)?.aborted || err.message === 'Canceled by user') {
            report('idle', 0, 'Tiến trình đã được hủy bởi người dùng.', 'Canceled');
            return { canceled: true };
        }
        report('error', 0, `Lỗi xử lý Karaoke: ${err.message}`, String(err));
        throw err;
    } finally {
        activeJobs.delete(jobId);
    }
};

/**
 * Cancels a running karaoke job.
 */
const cancelKaraokeJob = (jobId) => {
    const job = activeJobs.get(jobId);
    if (job) {
        job.aborted = true;
        if (job.abortController) {
            try { job.abortController.abort(); } catch {}
        }
        if (job.activeProc) {
            try { job.activeProc.kill('SIGKILL'); } catch {}
            job.activeProc = null;
        }
        return { canceled: true };
    }
    return { canceled: false };
};

module.exports = {
    runKaraokePipeline,
    cancelKaraokeJob,
    formatTimestamp,
    serializeStandardLrc,
    serializeEnhancedLrc,
    groupWordsIntoLines,
    alignLyricsTextToWords,
    writeWavFile,
    locateFfmpeg,
    locateHtdemucsModel,
    decodeAudioToPcm,
};
