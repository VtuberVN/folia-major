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
        // @ts-expect-error test override
        delete window.electron;

        const song: SongResult = {
            id: 'song-123',
            name: 'Test Song',
            artist: 'Test Artist',
            duration: 180,
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
            artist: 'Online Artist',
            duration: 200,
            source: 'youtube',
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
            { id: '1', name: 'Song 1', artist: 'Artist 1', duration: 100 },
            { id: '2', name: 'Song 2', artist: 'Artist 2', duration: 120 },
        ];

        await deleteLocalAudioForSongs(songs);
        expect(deleteLocalAudioMock).toHaveBeenCalledTimes(2);
    });
});
