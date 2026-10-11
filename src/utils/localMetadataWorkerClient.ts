export interface EmbeddedMetadataResult {
    title?: string;
    artist?: string;
    artists?: string[];
    album?: string;
    trackNumber?: number;
    discNumber?: number;
    cover?: Blob;
    coverAssetId?: string;
    bitrate?: number;
    sampleRate?: number;
    bitDepth?: number;
    codec?: string;
    lyrics?: string;
    translationLyrics?: string;
    replayGain?: number;
    replayGainTrackGain?: number;
    replayGainTrackPeak?: number;
    replayGainAlbumGain?: number;
    replayGainAlbumPeak?: number;
    duration?: number;
}

export interface HashedLocalCoverResult {
    cover: Blob;
    coverAssetId: string;
}

let metadataWorker: Worker | null = null;
let workerRequestId = 0;
export const METADATA_WORKER_REQUEST_TIMEOUT_MS = 30_000;
const workerCallbacks = new Map<string, {
    resolve: (result: unknown | null) => void;
    timer: ReturnType<typeof setTimeout>;
}>();

const settleWorkerRequest = (requestId: string, result: unknown | null): void => {
    const pending = workerCallbacks.get(requestId);
    if (!pending) return;
    workerCallbacks.delete(requestId);
    clearTimeout(pending.timer);
    pending.resolve(result);
};

// A failed or hung worker cannot safely finish any queued work. Release all callers
// and let the next request create a fresh worker; late events belong to the old one.
const discardMetadataWorker = (worker: Worker): void => {
    if (metadataWorker !== worker) return;
    metadataWorker = null;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    try {
        worker.terminate();
    } catch {
        // Cleanup must still resolve callers even if the runtime already disposed it.
    } finally {
        for (const requestId of workerCallbacks.keys()) settleWorkerRequest(requestId, null);
    }
};

export const initMetadataWorker = (): Worker => {
    if (!metadataWorker) {
        const worker = new Worker(
            new URL('../workers/metadataParser.worker.ts', import.meta.url),
            { type: 'module' }
        );
        metadataWorker = worker;
        worker.onmessage = (e) => {
            if (metadataWorker !== worker || !e.data || typeof e.data !== 'object') return;
            const { type, data, requestId, message } = e.data;
            if (workerCallbacks.has(requestId)) {
                if (type === 'result') {
                    settleWorkerRequest(requestId, data);
                } else {
                    console.warn('[MetadataWorker] parsing error:', message);
                    settleWorkerRequest(requestId, null);
                }
            }
        };
        worker.onerror = () => discardMetadataWorker(worker);
        worker.onmessageerror = () => discardMetadataWorker(worker);
    }

    return metadataWorker;
};

// Include queue wait in the deadline: a stalled parser must not block callers forever.
const requestMetadataWorker = <T>(requestId: string, message: object): Promise<T | null> => {
    return new Promise((resolve) => {
        let worker: Worker;
        try {
            worker = initMetadataWorker();
        } catch {
            resolve(null);
            return;
        }
        workerCallbacks.set(requestId, {
            resolve: result => resolve(result as T | null),
            timer: setTimeout(() => discardMetadataWorker(worker), METADATA_WORKER_REQUEST_TIMEOUT_MS),
        });
        try {
            worker.postMessage({ ...message, requestId });
        } catch {
            discardMetadataWorker(worker);
        }
    });
};

export const parseEmbeddedMetadataAsync = (
    file: File,
    includeCover = false
): Promise<EmbeddedMetadataResult | null> => {
    return requestMetadataWorker(`meta_req_${++workerRequestId}`, { type: 'parse-metadata', file, includeCover });
};

export const hashLocalCoverBlobAsync = (cover: Blob): Promise<HashedLocalCoverResult | null> => {
    return requestMetadataWorker(`cover_hash_req_${++workerRequestId}`, { type: 'hash-cover', cover });
};
