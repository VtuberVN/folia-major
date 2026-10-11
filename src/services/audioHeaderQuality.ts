import type { AudioQualityInfo } from '../types/audioQuality';

// Optional, bounded inspection of the exact HTTP source already selected for playback.
export const AUDIO_HEADER_LIMIT = 256 * 1024;
export const AUDIO_HEADER_TIMEOUT_MS = 5_000;
const CACHE_LIMIT = 48;
type Header = { bytes: Uint8Array; mimeType?: string; totalSize?: number };
type Task = { promise: Promise<AudioQualityInfo | undefined>; controller: AbortController; users: number };
const cache = new Map<string, AudioQualityInfo | undefined>();
const inFlight = new Map<string, Task>();

export async function readAudioHeader(url: string, signal: AbortSignal): Promise<Header> {
    const response = await fetch(url, { headers: { Range: `bytes=0-${AUDIO_HEADER_LIMIT - 1}` }, signal });
    if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => {});
        throw new Error('Audio header unavailable');
    }
    const range = response.headers.get('Content-Range');
    const match = range?.match(/^bytes 0-(\d+)\/(\d+)$/i);
    // Content-Length on a partial response is not the complete file size.
    const rangeEnd = match ? Number(match[1]) : NaN;
    const total = match ? Number(match[2]) : NaN;
    const totalSize = response.status === 206 && Number.isSafeInteger(total) && total > rangeEnd ? total : undefined;
    if (response.status === 206 && !/^bytes 0-/i.test(range ?? '')) {
        await response.body.cancel().catch(() => {});
        throw new Error('Audio range does not begin at the header');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (length < AUDIO_HEADER_LIMIT) {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = value.subarray(0, AUDIO_HEADER_LIMIT - length);
            chunks.push(chunk.slice());
            length += chunk.length;
        }
    } finally {
        // Also cancel when a server ignores Range and returns its entire media body.
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { bytes, mimeType: response.headers.get('Content-Type') ?? undefined, totalSize };
}

function parseInWorker(header: Header, signal: AbortSignal): Promise<AudioQualityInfo | undefined> {
    return new Promise(resolve => {
        if (signal.aborted) { resolve(undefined); return; }
        let worker: Worker;
        try { worker = new Worker(new URL('../workers/audioHeaderQuality.worker.ts', import.meta.url), { type: 'module' }); }
        catch { resolve(undefined); return; }
        const finish = (info?: AudioQualityInfo) => {
            signal.removeEventListener('abort', abort);
            worker.terminate();
            resolve(info);
        };
        const abort = () => finish();
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = event => finish(event.data as AudioQualityInfo | undefined);
        worker.onerror = () => finish();
        worker.onmessageerror = () => finish();
        try { worker.postMessage(header, [header.bytes.buffer]); }
        catch { finish(); }
    });
}

export function acquireAudioHeaderQuality(url: string): { ready: Promise<AudioQualityInfo | undefined>; release: () => void } {
    if (!/^https?:\/\//i.test(url)) return { ready: Promise.resolve(undefined), release: () => {} };
    if (cache.has(url)) return { ready: Promise.resolve(cache.get(url)), release: () => {} };
    let task = inFlight.get(url);
    if (!task) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), AUDIO_HEADER_TIMEOUT_MS);
        const created: Task = { controller, users: 0, promise: Promise.resolve(undefined) };
        created.promise = (async () => {
            try {
                const header = await readAudioHeader(url, controller.signal);
                const info = await parseInWorker(header, controller.signal);
                if (!controller.signal.aborted) {
                    cache.set(url, info);
                    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
                }
                return controller.signal.aborted ? undefined : info;
            } catch {
                // A failed URL is best effort, not a playback retry trigger.
                if (!controller.signal.aborted) {
                    cache.set(url, undefined);
                    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
                }
                return undefined;
            } finally {
                clearTimeout(timer);
                if (inFlight.get(url) === created) inFlight.delete(url);
            }
        })();
        task = created;
        inFlight.set(url, task);
    }
    task.users++;
    let released = false;
    return { ready: task.promise, release: () => {
        if (released) return;
        released = true;
        if (--task.users === 0 && inFlight.get(url) === task) {
            inFlight.delete(url);
            task.controller.abort();
        }
    } };
}
