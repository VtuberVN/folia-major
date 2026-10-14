import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibraryAccountSwitchCleanupPort } from '@/library/app/createLibraryAccountPort';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { useCollectionNavigationStore } from '@/stores/useCollectionNavigationStore';
import { PlayerState, type SongResult } from '@/types';

// test/unit/library/app/libraryAccountPort.test.ts
// Provider switch cleanup port: switching the currently browsed provider only resets search runtime
// and collection navigation without touching playing songs or queues (queue tracks carry their own source),
// and does not require user confirmation.

const song = { id: 's1', name: 'Song', artists: [], album: { id: '', name: '' } } as unknown as SongResult;

describe('provider switch cleanup port', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        usePlaybackStore.setState({
            audioSrc: 'blob:old-track',
            currentSong: song,
            playQueue: [song],
            cachedCoverUrl: 'cover.png',
            isFmMode: true,
            playerState: PlayerState.PLAYING,
        });
    });

    it('only resets browsing state for the new provider', () => {
        const resetRuntime = vi.spyOn(useSearchNavigationStore.getState(), 'resetRuntime');
        const clearNavigation = vi.spyOn(useCollectionNavigationStore.getState(), 'clear');
        const port = createLibraryAccountSwitchCleanupPort();

        port.resetForProviderSwitch('qq', 'netease');

        expect(resetRuntime).toHaveBeenCalledWith('qq');
        expect(clearNavigation).toHaveBeenCalledTimes(1);
    });

    it('leaves the playing song, the queue and the transport untouched', () => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const port = createLibraryAccountSwitchCleanupPort();

        port.resetForProviderSwitch('kugou', 'netease');

        expect(usePlaybackStore.getState()).toMatchObject({
            audioSrc: 'blob:old-track',
            currentSong: song,
            playQueue: [song],
            cachedCoverUrl: 'cover.png',
            isFmMode: true,
            playerState: PlayerState.PLAYING,
        });
        expect(revoke).not.toHaveBeenCalled();
        revoke.mockRestore();
    });

    it('asks for no confirmation, since nothing is lost by switching', () => {
        expect(createLibraryAccountSwitchCleanupPort().requiresConfirmation).toBe(false);
    });
});
