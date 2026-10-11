import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_HEADER_LIMIT, acquireAudioHeaderQuality, readAudioHeader } from '../../src/services/audioHeaderQuality';
import { parseAudioHeaderQuality } from '../../src/workers/audioHeaderQuality.worker';

// Minimal valid FLAC STREAMINFO fixture, not an audio parser.
function flacHeader(): Uint8Array {
    const bytes = new Uint8Array(42);
    bytes.set([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34]);
    const view = new DataView(bytes.buffer);
    view.setUint16(8, 4096); view.setUint16(10, 4096);
    let packed = (44100n << 44n) | (1n << 41n) | (15n << 36n) | 441000n;
    for (let i = 25; i >= 18; --i) { bytes[i] = Number(packed & 255n); packed >>= 8n; }
    return bytes;
}
function mp3Frames(variable = false): Uint8Array {
    const frames = Array.from({ length: 5 }, (_, index) => {
        const high = variable && index % 2 === 1;
        const frame = new Uint8Array(high ? 522 : 417);
        frame.set([0xff, 0xfb, high ? 0xa0 : 0x90, 0]);
        return frame;
    });
    const bytes = new Uint8Array(frames.reduce((sum, frame) => sum + frame.length, 0));
    let offset = 0;
    for (const frame of frames) { bytes.set(frame, offset); offset += frame.length; }
    return bytes;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('bounded HTTP audio header', () => {
    it('caps a server ignoring Range and cancels the rest', async () => {
        const cancel = vi.fn();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
            start(controller) { controller.enqueue(new Uint8Array(AUDIO_HEADER_LIMIT + 40)); }, cancel,
        }), { headers: { 'Content-Length': '99999999', 'Content-Type': 'audio/flac' } })));
        const header = await readAudioHeader('https://test.invalid/audio', new AbortController().signal);
        expect(header.bytes.length).toBe(AUDIO_HEADER_LIMIT);
        expect(header.totalSize).toBeUndefined();
        expect(cancel).toHaveBeenCalledOnce();
    });
    it('trusts total Content-Range size, not partial Content-Length', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(flacHeader().buffer as ArrayBuffer, { status: 206, headers: {
            'Content-Range': 'bytes 0-41/1000000', 'Content-Length': '42',
        } })));
        expect((await readAudioHeader('https://test.invalid/range', new AbortController().signal)).totalSize).toBe(1000000);
    });
    it('rejects ranges missing the file header', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(flacHeader().buffer as ArrayBuffer, { status: 206, headers: { 'Content-Range': 'bytes 42-83/1000000' } })));
        await expect(readAudioHeader('https://test.invalid/range', new AbortController().signal)).rejects.toThrow('begin');
    });
    it('deduplicates callers and aborts after the last subscriber leaves', async () => {
        let signal: AbortSignal | undefined;
        const request = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
            signal = options.signal;
            signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }));
        vi.stubGlobal('fetch', request);
        const one = acquireAudioHeaderQuality('https://test.invalid/dedupe');
        const two = acquireAudioHeaderQuality('https://test.invalid/dedupe');
        expect(request).toHaveBeenCalledOnce(); expect(one.ready).toBe(two.ready);
        one.release(); expect(signal?.aborted).toBe(false);
        two.release(); expect(signal?.aborted).toBe(true);
        await expect(one.ready).resolves.toBeUndefined();
    });
    it('aborts a slow request after five seconds', async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
            signal = options.signal;
            signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })));
        const task = acquireAudioHeaderQuality('https://test.invalid/timeout');
        await vi.advanceTimersByTimeAsync(5000);
        expect(signal?.aborted).toBe(true);
        await expect(task.ready).resolves.toBeUndefined(); task.release();
    });
});
describe('real header parsing', () => {
    it.each(['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/x-m4a', 'application/octet-stream'])('detects FLAC bytes despite HTTP MIME %s', async mimeType => {
        const info = await parseAudioHeaderQuality({ bytes: flacHeader(), mimeType, totalSize: 1000000 });
        expect(info?.codec).toBe('FLAC');
        expect(info?.bitDepth).toBe(16);
        expect(info?.sampleRate).toBe(44100);
        expect(info?.bitrate).toBeCloseTo(799966.4);
    });
    it('retains measured FLAC STREAMINFO when later metadata is truncated', async () => {
        const bytes = new Uint8Array(46);
        bytes.set(flacHeader()); bytes[4] = 0;
        bytes.set([0x86, 0x10, 0, 0], 42); // A final picture block larger than the available header.
        const info = await parseAudioHeaderQuality({ bytes, mimeType: 'audio/aac', totalSize: 1000000 });
        expect(info).toMatchObject({ codec: 'FLAC', sampleRate: 44100, bitDepth: 16 });
        expect(info?.bitrate).toBeUndefined();
    });
    it('retains a CBR bitrate measured from MPEG frame headers', async () => {
        const info = await parseAudioHeaderQuality({ bytes: mp3Frames(), mimeType: 'audio/mpeg' });
        expect(info?.bitrate).toBe(128000);
        expect(info?.sampleRate).toBe(44100);
    });
    it('omits variable MPEG bitrate instead of extrapolating partial file size', async () => {
        const info = await parseAudioHeaderQuality({ bytes: mp3Frames(true), mimeType: 'audio/mpeg', totalSize: 10000000 });
        expect(info?.sampleRate).toBe(44100);
        expect(info?.bitrate).toBeUndefined();
    });
    it('keeps FLAC properties but omits bitrate when total size is unknown', async () => {
        const info = await parseAudioHeaderQuality({ bytes: flacHeader(), mimeType: 'audio/flac' });
        expect(info).toMatchObject({ codec: 'FLAC', sampleRate: 44100, bitDepth: 16, provenance: 'stream' });
        expect(info?.bitrate).toBeUndefined();
    });
    it('derives FLAC bitrate from total size and actual header duration', async () => {
        const info = await parseAudioHeaderQuality({ bytes: flacHeader(), mimeType: 'audio/flac', totalSize: 1000000 });
        expect(info?.bitrate).toBeCloseTo(8 * (1000000 - 42) / 10);
    });
    it('omits quality for unrecognized bytes', async () => {
        expect(await parseAudioHeaderQuality({ bytes: new TextEncoder().encode('invalid audio') })).toBeUndefined();
    });
});
