import type { SongResult } from '../types';
import type { AudioQualityInfo } from '../types/audioQuality';
import { setCurrentSong, setPlayQueue, usePlaybackStore } from '../stores/usePlaybackStore';
import { isSamePlaybackSong } from '../utils/appPlaybackGuards';

// src/services/deferredAudioQuality.ts
// Applies background metadata only while the exact playback source still owns the current song.
export function watchDeferredAudioQuality(song: SongResult, audioSrc: string, ready?: Promise<AudioQualityInfo | undefined>): void {
    if (!ready) return;
    void ready.then(info => {
        const state = usePlaybackStore.getState();
        if (!info || state.audioSrc !== audioSrc || !state.currentSong || !isSamePlaybackSong(state.currentSong, song)) return;
        const previous = state.currentSong.audioQualityInfo;
        const definedInfo = Object.fromEntries(Object.entries(info).filter(([, value]) => value !== undefined));
        // Conflicting codecs describe different encodings; never carry the old encoding's
        // bitrate/precision into the newly measured stream.
        const codecChanged = previous?.codec && info.codec && previous.codec.trim().toLowerCase() !== info.codec.trim().toLowerCase();
        const replace = codecChanged || (previous?.provenance === 'source' && info.provenance !== 'source');
        const audioQualityInfo = replace ? info : { ...previous, ...definedInfo };
        setCurrentSong(current => (current && isSamePlaybackSong(current, song) ? { ...current, audioQualityInfo } : current));
        setPlayQueue(currentQueue => currentQueue.map(entry => isSamePlaybackSong(entry, song) ? { ...entry, audioQualityInfo } : entry));
    }).catch(() => { /* Metadata is optional and must not interrupt playback. */ });
}
