import type { RefObject } from 'react';
import type { LyricData } from '../../types';
import type { OnlineProviderId } from '../../types/onlineMusic';
import type { LibraryProviderSwitchCleanupPort } from '../core/contracts/account';
import { useSearchNavigationStore } from '../../stores/useSearchNavigationStore';
import { useCollectionNavigationStore } from '../../stores/useCollectionNavigationStore';

// src/library/app/createLibraryAccountPort.ts
// Online account controller switch cleanup port (modeled after createLibraryHomePort).
//
// Switching the "currently browsed provider" only affects search and collection browsing: currently playing tracks
// and the playback queue remain untouched. Each track in the queue carries its own source (Netease, QQ Music,
// Zing MP3, NhacCuaTui, Local...), playing with its own audio source, allowing cross-platform queue mixing.
// Clearing them when switching providers provides no benefit and causes users to lose their active queue when browsing other providers.
// Therefore, we only reset browsing runtime states from the previous provider, and switching no longer requires confirmation (requiresConfirmation: false).

/** Player handles held by the App. Switching no longer touches playback; preserving this type avoids changing callers. */
export type LibraryAccountSwitchHost = {
    audioRef: RefObject<HTMLAudioElement | null>;
    automixRef: RefObject<{ abortTransition: () => void } | null>;
    setLyrics: (lyrics: LyricData | null) => void;
};

export const createLibraryAccountSwitchCleanupPort = (
    _getHost?: () => LibraryAccountSwitchHost,
): LibraryProviderSwitchCleanupPort => ({
    requiresConfirmation: false,
    resetForProviderSwitch: (nextProviderId: OnlineProviderId) => {
        useSearchNavigationStore.getState().resetRuntime(nextProviderId);
        useCollectionNavigationStore.getState().clear();
    },
});
