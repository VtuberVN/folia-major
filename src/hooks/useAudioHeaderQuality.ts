import { useEffect } from 'react';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { acquireAudioHeaderQuality } from '../services/audioHeaderQuality';
import { watchDeferredAudioQuality } from '../services/deferredAudioQuality';

// Runs after playback commits its URL. Never changes audioSrc or controls playback.
export function useAudioHeaderQuality(): void {
    const audioSrc = usePlaybackStore(state => state.audioSrc);
    const songKey = usePlaybackStore(state => state.currentSong ? getPlaybackSongKey(state.currentSong) : null);
    useEffect(() => {
        const song = usePlaybackStore.getState().currentSong;
        if (!song || !audioSrc || !/^https?:\/\//i.test(audioSrc)) return;
        const work = acquireAudioHeaderQuality(audioSrc);
        let active = true;
        watchDeferredAudioQuality(song, audioSrc, work.ready.then(info => active ? info : undefined));
        return () => { active = false; work.release(); };
    }, [audioSrc, songKey]);
}

