import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Metadata worker lifecycle: queued deadlines, concurrent replies, failures and recovery.
class FakeWorker {
    static instances: FakeWorker[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();

    constructor() { FakeWorker.instances.push(this); }

    reply(index: number, data: unknown, type = 'result') {
        this.onmessage?.({ data: {
            requestId: this.postMessage.mock.calls[index][0].requestId, type, data,
        } } as MessageEvent);
    }
}

let client: typeof import('../../../src/utils/localMetadataWorkerClient');
const file = new File(['audio'], 'song.mp3');
const cover = new Blob(['cover']);

beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    client = await import('../../../src/utils/localMetadataWorkerClient');
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('metadata worker lifecycle', () => {
    it('matches concurrent out-of-order replies, ignores duplicates and clears deadlines', async () => {
        const metadata = client.parseEmbeddedMetadataAsync(file, true);
        const hash = client.hashLocalCoverBlobAsync(cover);
        const worker = FakeWorker.instances[0];
        expect(client.initMetadataWorker()).toBe(worker);
        expect(worker.postMessage.mock.calls[0][0]).toMatchObject({ file, includeCover: true });
        worker.reply(1, { cover, coverAssetId: 'sha256:cover' });
        worker.reply(1, { coverAssetId: 'wrong' });
        worker.reply(0, { title: 'song' });
        expect(await metadata).toEqual({ title: 'song' });
        expect(await hash).toEqual({ cover, coverAssetId: 'sha256:cover' });
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(client.METADATA_WORKER_REQUEST_TIMEOUT_MS);
        expect(worker.terminate).not.toHaveBeenCalled();
    });

    it('times out a stalled request, drains all queued callers and restarts on demand', async () => {
        const first = client.parseEmbeddedMetadataAsync(file);
        const staleWorker = FakeWorker.instances[0];
        const staleHandler = staleWorker.onmessage!;
        await vi.advanceTimersByTimeAsync(1_000);
        const queued = client.hashLocalCoverBlobAsync(cover);
        expect(vi.getTimerCount()).toBe(2);
        await vi.advanceTimersByTimeAsync(client.METADATA_WORKER_REQUEST_TIMEOUT_MS - 1_001);
        expect(staleWorker.terminate).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(await Promise.all([first, queued])).toEqual([null, null]);
        expect(staleWorker.terminate).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
        const recovered = client.parseEmbeddedMetadataAsync(file);
        const freshWorker = FakeWorker.instances[1];
        staleHandler({ data: { type: 'result', requestId: freshWorker.postMessage.mock.calls[0][0].requestId, data: { title: 'stale' } } } as MessageEvent);
        freshWorker.reply(0, { title: 'fresh' });
        expect(await recovered).toEqual({ title: 'fresh' });
    });

    it.each(['onerror', 'onmessageerror'] as const)('drains simultaneous requests after %s and rejects stale failure events', async (event) => {
        const first = client.parseEmbeddedMetadataAsync(file);
        const second = client.hashLocalCoverBlobAsync(cover);
        const worker = FakeWorker.instances[0];
        const staleFailure = worker[event]!;
        staleFailure();
        expect(await Promise.all([first, second])).toEqual([null, null]);
        expect(worker.terminate).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
        const recovered = client.hashLocalCoverBlobAsync(cover);
        const freshWorker = FakeWorker.instances[1];
        staleFailure();
        freshWorker.reply(0, { cover, coverAssetId: 'new' });
        expect(await recovered).toEqual({ cover, coverAssetId: 'new' });
        expect(freshWorker.terminate).not.toHaveBeenCalled();
    });

    it('settles parser errors without discarding other requests', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const first = client.parseEmbeddedMetadataAsync(file);
        const second = client.parseEmbeddedMetadataAsync(file);
        const worker = FakeWorker.instances[0];
        worker.reply(0, undefined, 'error');
        worker.reply(1, { duration: 120 });
        expect(await first).toBeNull();
        expect(await second).toEqual({ duration: 120 });
        expect(worker.terminate).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('resolves postMessage failures and existing queued requests, then recovers', async () => {
        const pending = client.parseEmbeddedMetadataAsync(file);
        const worker = FakeWorker.instances[0];
        worker.postMessage.mockImplementationOnce(() => { throw new Error('DataCloneError'); });
        const failed = client.hashLocalCoverBlobAsync(cover);
        expect(await Promise.all([pending, failed])).toEqual([null, null]);
        expect(vi.getTimerCount()).toBe(0);
        const recovered = client.parseEmbeddedMetadataAsync(file);
        FakeWorker.instances[1].reply(0, { title: 'recovered' });
        expect(await recovered).toEqual({ title: 'recovered' });
    });

    it('resolves construction failures without a timer and retries next request', async () => {
        vi.stubGlobal('Worker', class { constructor() { throw new Error('unsupported'); } });
        expect(await client.parseEmbeddedMetadataAsync(file)).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        vi.stubGlobal('Worker', FakeWorker);
        const recovered = client.parseEmbeddedMetadataAsync(file);
        FakeWorker.instances[0].reply(0, { title: 'available' });
        expect(await recovered).toEqual({ title: 'available' });
    });
});
