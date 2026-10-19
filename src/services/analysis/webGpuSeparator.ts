// src/services/analysis/webGpuSeparator.ts
// Client service coordinating the WebGPU separation worker for AI Karaoke.
// Connects with Electron's IPC bridge to process full-track audio directly on the user's GPU.

import type { HtdemucsWgslManifest } from './htdemucsWgsl/runtime';

let worker: Worker | null = null;
let isReady = false;
let readyPromise: Promise<boolean> | null = null;
let nextReqId = 0;

interface WorkerReply {
    id?: number;
    kind?: string;
    curChunk?: number;
    totalChunks?: number;
    percent?: number;
    deviceLabel?: string;
    result?: {
        left: Float32Array;
        right: Float32Array;
    };
    ok?: boolean;
    error?: string;
}

const pendingRequests = new Map<number, (reply: WorkerReply) => void>();
let progressCallback: ((curChunk: number, totalChunks: number, pct: number, deviceLabel?: string) => void) | null = null;

const getWorker = (): Worker | null => {
    if (worker) return worker;
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
    try {
        worker = new Worker(new URL('../../workers/webGpuSeparator.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
            const data = event.data;
            if (data.kind === 'progress') {
                progressCallback?.(data.curChunk || 0, data.totalChunks || 1, data.percent || 0, data.deviceLabel);
                return;
            }
            if (typeof data.id === 'number') {
                const handler = pendingRequests.get(data.id);
                if (handler) {
                    pendingRequests.delete(data.id);
                    handler(data);
                }
            }
        };
        worker.onerror = (err) => {
            console.warn('[webGpuSeparator] worker error:', err);
            disposeWorker();
        };
        return worker;
    } catch (e) {
        console.warn('[webGpuSeparator] failed to spawn worker:', e);
        return null;
    }
};

const disposeWorker = () => {
    if (worker) {
        try {
            worker.postMessage({ id: nextReqId++, kind: 'dispose' });
            worker.terminate();
        } catch {}
        worker = null;
    }
    isReady = false;
    readyPromise = null;
    pendingRequests.clear();
    progressCallback = null;
};

/**
 * Checks whether the current environment supports WebGPU for AI Karaoke separation.
 */
export const probeWebGpuSeparator = async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    try {
        const adapter = await navigator.gpu.requestAdapter();
        return Boolean(adapter);
    } catch {
        return false;
    }
};

/**
 * Ensures model weights are loaded on the WebGPU worker.
 */
export const ensureWebGpuModelLoaded = async (): Promise<boolean> => {
    if (isReady) return true;
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
        const w = getWorker();
        if (!w) return false;

        const fetchWeights = window.electron?.getHtdemucsGpuWeights;
        if (typeof fetchWeights !== 'function') return false;

        const found = await fetchWeights();
        if (!found || !found.weights || !found.manifest) return false;

        const reqId = ++nextReqId;
        const result = await new Promise<boolean>((resolve) => {
            pendingRequests.set(reqId, (reply) => {
                if (reply.error) {
                    console.warn('[webGpuSeparator] load error:', reply.error);
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
            w.postMessage(
                {
                    id: reqId,
                    kind: 'load',
                    weights: found.weights,
                    manifest: found.manifest as HtdemucsWgslManifest,
                },
                [found.weights.buffer]
            );
        });

        isReady = result;
        if (!result) {
            readyPromise = null;
        }
        return result;
    })();

    return readyPromise;
};

/**
 * Separates full stereo audio track into Vocals using WebGPU.
 */
export const separateAudioWithWebGpu = async (
    left: Float32Array,
    right: Float32Array,
    onProgress?: (curChunk: number, totalChunks: number, pct: number, deviceLabel?: string) => void
): Promise<{ left: Float32Array; right: Float32Array }> => {
    const loaded = await ensureWebGpuModelLoaded();
    if (!loaded) throw new Error('Không thể khởi tạo mô hình WebGPU trên card đồ họa');

    const w = getWorker();
    if (!w) throw new Error('Không khởi tạo được Web Worker WebGPU');

    const reqId = ++nextReqId;
    progressCallback = onProgress || null;

    // Direct buffer transfer if buffers are isolated, else sliced copy
    const inputLeft = left.byteOffset === 0 && left.byteLength === left.buffer.byteLength
        ? left
        : Float32Array.from(left);
    const inputRight = right.byteOffset === 0 && right.byteLength === right.buffer.byteLength
        ? right
        : Float32Array.from(right);

    return new Promise((resolve, reject) => {
        pendingRequests.set(reqId, (reply) => {
            progressCallback = null;
            if (reply.error) {
                reject(new Error(reply.error));
            } else if (reply.result) {
                resolve(reply.result);
            } else {
                reject(new Error('WebGPU separation returned empty result'));
            }
        });

        w.postMessage(
            {
                id: reqId,
                kind: 'separateTrack',
                left: inputLeft,
                right: inputRight,
            },
            [inputLeft.buffer, inputRight.buffer]
        );
    });
};


/**
 * Initializes the Electron IPC bridge listener for WebGPU separation requests from the main process.
 */
export const initWebGpuSeparationIpcBridge = () => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge || typeof bridge.onRunWebGpuSeparation !== 'function') return;

    bridge.onRunWebGpuSeparation(async ({ sepJobId, left, right }) => {
        try {
            const vocals = await separateAudioWithWebGpu(left, right, (curChunk, totalChunks, pct, deviceLabel) => {
                bridge.sendWebGpuProgress?.(sepJobId, curChunk, totalChunks, pct, deviceLabel);
            });
            bridge.sendWebGpuDone?.(sepJobId, { vocals }, null);
        } catch (err) {
            bridge.sendWebGpuDone?.(sepJobId, null, (err as Error)?.message || String(err));
        }
    });
};
