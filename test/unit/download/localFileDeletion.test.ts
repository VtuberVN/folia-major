// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { deleteLocalAudioForSong, deleteLocalAudioForSongs } from '@/services/localFileDeletion';
import type { SongResult } from '@/types';

describe('localFileDeletion', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns early when electron download bridge is not available', async () => {
        const originalElectron = window.electron;
        delete (window as any).electron;

        const song: SongResult = {
            id: 'song-123',
            name: 'Test Song',
            artists: [{ id: 0, name: 'Test Artist' }],
            album: { id: 0, name: 'Test Album' },
            durationMs: 180000,
        };

        await expect(deleteLocalAudioForSong(song)).resolves.toBeUndefined();
        window.electron = originalElectron;
    });

    it('calls bridge.deleteLocalAudio with cacheKey for online songs', async () => {
        const deleteLocalAudioMock = vi.fn().mockResolvedValue({ removed: [] });
        window.electron = {
            ...window.electron,
            // @ts-expect-error partial mock
            download: {
                deleteLocalAudio: deleteLocalAudioMock,
            },
        };

        const song: SongResult = {
            id: 'yt-123',
            name: 'Online Track',
            artists: [{ id: 0, name: 'Online Artist' }],
            album: { id: 0, name: 'Online Album' },
            durationMs: 200000,
        };

        await deleteLocalAudioForSong(song);

        expect(deleteLocalAudioMock).toHaveBeenCalledTimes(1);
        expect(deleteLocalAudioMock).toHaveBeenCalledWith(
            expect.objectContaining({
                songId: 'yt-123',
            }),
        );
    });

    it('deletes multiple songs in parallel via deleteLocalAudioForSongs', async () => {
        const deleteLocalAudioMock = vi.fn().mockResolvedValue({ removed: [] });
        window.electron = {
            ...window.electron,
            // @ts-expect-error partial mock
            download: {
                deleteLocalAudio: deleteLocalAudioMock,
            },
        };

        const songs: SongResult[] = [
            { id: '1', name: 'Song 1', artists: [{ id: 0, name: 'Artist 1' }], album: { id: 0, name: 'Album 1' }, durationMs: 100000 },
            { id: '2', name: 'Song 2', artists: [{ id: 0, name: 'Artist 2' }], album: { id: 0, name: 'Album 2' }, durationMs: 120000 },
        ];

        await deleteLocalAudioForSongs(songs);
        expect(deleteLocalAudioMock).toHaveBeenCalledTimes(2);
    });
});
