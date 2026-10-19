/// <reference types="@webgpu/types" />
import { HtdemucsWgsl, type HtdemucsWgslManifest, HTDEMUCS_SEGMENT } from '../services/analysis/htdemucsWgsl/runtime';

// src/workers/webGpuSeparator.worker.ts
// Music Source Separation for AI Karaoke running entirely on WebGPU.
// Extracts Vocals stem (source index 3) across arbitrary length audio using
// overlap-add triangular windowing, streaming progress per segment.

export const buildWindow = (segment: number): Float32Array => {
    const overlap = Math.floor(segment / 4);
    const win = new Float32Array(segment).fill(1);
    for (let i = 0; i < overlap; i += 1) {
        const ramp = i / (overlap - 1);
        win[i] = ramp;
        win[segment - 1 - i] = ramp;
    }
    return win;
};

type Request =
    | { id: number; kind: 'load'; weights: Uint8Array<ArrayBuffer>; manifest: HtdemucsWgslManifest }
    | { id: number; kind: 'separateTrack'; left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> }
    | { id: number; kind: 'dispose' };

let htdemucs: HtdemucsWgsl | null = null;
let device: GPUDevice | null = null;
let f16 = false;
let lost: string | null = null;

const openDevice = async (): Promise<GPUDevice> => {
    if (device) return device;
    if (!navigator.gpu) throw new Error('no WebGPU in this worker');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('no WebGPU adapter');
    f16 = adapter.features.has('shader-f16');
    const opened = await adapter.requestDevice({ requiredFeatures: f16 ? ['shader-f16'] : [] });
    opened.lost.then((info) => {
        lost = `device lost (${info.reason}): ${info.message}`;
        htdemucs?.destroy();
        htdemucs = null;
    });
    device = opened;
    return opened;
};

self.onmessage = async (event: MessageEvent<Request>) => {
    const request = event.data;
    try {
        if (request.kind === 'load') {
            const dev = await openDevice();
            if (!htdemucs) {
                // source: 3 is VOCALS in HTDemucs (0: drums, 1: bass, 2: other, 3: vocals)
                htdemucs = await HtdemucsWgsl.create(dev, request.weights, request.manifest, { source: 3, f16 });
            }
            self.postMessage({ id: request.id, ok: true });
            return;
        }

        if (request.kind === 'dispose') {
            htdemucs?.destroy();
            htdemucs = null;
            device?.destroy();
            device = null;
            self.postMessage({ id: request.id, ok: true });
            return;
        }

        if (request.kind === 'separateTrack') {
            if (lost) throw new Error(lost);
            if (!htdemucs) throw new Error('htdemucs not loaded on GPU');

            const total = request.left.length;
            const segment = HTDEMUCS_SEGMENT; // 172032 samples (3.902s @ 44.1kHz)
            const stride = segment - Math.floor(segment / 4); // 129024 samples
            const chunks = Math.max(1, Math.ceil(total / stride));
            const win = buildWindow(segment);

            const vocalsL = new Float32Array(total);
            const vocalsR = new Float32Array(total);
            const weight = new Float32Array(total);

            const inputL = new Float32Array(segment);
            const inputR = new Float32Array(segment);

            for (let c = 0; c < chunks; c += 1) {
                const start = c * stride;
                const end = Math.min(start + segment, total);
                if (end <= start) break;
                const n = end - start;

                inputL.fill(0);
                inputR.fill(0);
                inputL.set(request.left.subarray(start, end), 0);
                inputR.set(request.right.subarray(start, end), 0);

                const result = await htdemucs.run(inputL, inputR, { slice: 'auto' });

                for (let i = 0; i < n; i += 1) {
                    vocalsL[start + i] += result.left[i] * win[i];
                    vocalsR[start + i] += result.right[i] * win[i];
                    weight[start + i] += win[i];
                }

                // Send progress notification per chunk
                self.postMessage({
                    kind: 'progress',
                    curChunk: c + 1,
                    totalChunks: chunks,
                    percent: Math.round(((c + 1) / chunks) * 100),
                });
            }

            for (let i = 0; i < total; i += 1) {
                const w = Math.max(weight[i], 1e-8);
                vocalsL[i] /= w;
                vocalsR[i] /= w;
            }

            self.postMessage(
                {
                    id: request.id,
                    result: {
                        left: vocalsL,
                        right: vocalsR,
                    },
                },
                [vocalsL.buffer, vocalsR.buffer]
            );

            return;
        }
    } catch (error) {
        self.postMessage({ id: (request as any)?.id ?? -1, error: String((error as Error)?.message ?? error) });
    }
};
