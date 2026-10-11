import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '../../../src/types';

// test/unit/services/cachedAudioQuality.test.ts
// Guards persistent source metadata, deduplication, and optional worker/cache failure handling.
const mocks = vi.hoisted(() => ({ records: new Map<string, unknown>(), parse: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('../../../src/services/db', () => ({ getFromCache: mocks.read, saveToCache: mocks.save }));
vi.mock('../../../src/utils/localMetadataWorkerClient', () => ({ parseEmbeddedMetadataAsync: mocks.parse }));
import { readCachedAudioQuality } from '../../../src/services/cachedAudioQuality';
import { rememberAudioCacheRevision } from '../../../src/utils/audioCacheRevision';
const song: SongResult = { id: 42, name: 'Test', artists: [], album: { id: 1, name: 'Test' }, durationMs: 1000, sourceRef: { kind: 'online', providerId: 'netease', mediaId: '42' } };

beforeEach(() => {
    mocks.records.clear();
    mocks.read.mockReset().mockImplementation(async (key: string) => mocks.records.get(key) ?? null);
    mocks.save.mockReset().mockImplementation(async (key: string, value: unknown) => { mocks.records.set(key, value); });
    mocks.parse.mockReset().mockResolvedValue({ bitrate: 320000, codec: 'MP3' });
});

describe('cached audio quality', () => {
    it('invalidates measurements when the Windows cache revision changes', async () => {
        const original = new Blob(['same header']);
        const replacement = new Blob(['same header']);
        rememberAudioCacheRevision(original, 'file-revision-1');
        rememberAudioCacheRevision(replacement, 'file-revision-2');
        await readCachedAudioQuality(song, original);
        mocks.parse.mockResolvedValueOnce({ bitrate: 128000 });
        expect(await readCachedAudioQuality(song, replacement)).toEqual({ bitrate: 128000 });
        expect(mocks.parse).toHaveBeenCalledTimes(2);
    });
    it('reuses persisted measurements for identical cached bytes without parsing again', async () => {
        const blob = new Blob(['same audio']);
        expect(await readCachedAudioQuality(song, blob)).toEqual({ bitrate: 320000, codec: 'MP3' });
        expect(await readCachedAudioQuality(song, new Blob(['same audio']))).toEqual({ bitrate: 320000, codec: 'MP3' });
        expect(mocks.parse).toHaveBeenCalledTimes(1);
    });
    it('remeasures a replacement file even when its size and song identity are unchanged', async () => {
        await readCachedAudioQuality(song, new Blob(['AAAA']));
        mocks.parse.mockResolvedValueOnce({ bitrate: 128000 });
        expect(await readCachedAudioQuality(song, new Blob(['BBBB']))).toEqual({ bitrate: 128000 });
        expect(mocks.parse).toHaveBeenCalledTimes(2);
    });
    it('shares an in-flight parse for simultaneous requests', async () => {
        let finish!: (value: unknown) => void;
        mocks.parse.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const pending = [readCachedAudioQuality(song, new Blob(['shared'])), readCachedAudioQuality(song, new Blob(['shared']))];
        await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledTimes(1));
        finish({ bitrate: 320000 });
        expect(await Promise.all(pending)).toEqual([{ bitrate: 320000 }, { bitrate: 320000 }]);
    });
    it('retries worker failures and tolerates failed persistence', async () => {
        mocks.parse.mockResolvedValueOnce(null);
        expect(await readCachedAudioQuality(song, new Blob(['retry']))).toBeUndefined();
        mocks.save.mockRejectedValueOnce(new Error('Storage full'));
        expect(await readCachedAudioQuality(song, new Blob(['retry']))).toEqual({ bitrate: 320000, codec: 'MP3' });
        expect(mocks.parse).toHaveBeenCalledTimes(2);
    });
});
