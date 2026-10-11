import { beforeEach, describe, expect, it } from 'vitest';
import type { SongResult } from '../../../src/types';
import { usePlaybackStore } from '../../../src/stores/usePlaybackStore';
import { watchDeferredAudioQuality } from '../../../src/services/deferredAudioQuality';

// test/unit/services/deferredAudioQuality.test.ts
// Rejects metadata from an old song or an earlier playback attempt of the same song.
const song: SongResult = { id: 42, name: 'Test', artists: [], album: { id: 1, name: 'Test' }, durationMs: 1000 };
beforeEach(() => { usePlaybackStore.setState({ currentSong: song, audioSrc: 'blob:current', playQueue: [song] }); });
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('deferred playback quality', () => {
    it('does not attach the old encoding bitrate to a conflicting measured codec', async () => {
        usePlaybackStore.setState({ currentSong: { ...song, audioQualityInfo: { codec: 'FLAC', bitrate: 2784000, bitDepth: 24 } } });
        watchDeferredAudioQuality(song, 'blob:current', Promise.resolve({ codec: 'AAC', sampleRate: 44100, provenance: 'stream' }));
        await flush();
        expect(usePlaybackStore.getState().currentSong?.audioQualityInfo).toEqual({ codec: 'AAC', sampleRate: 44100, provenance: 'stream' });
    });
    it('keeps NetEase bitrate when measured FLAC agrees regardless of casing', async () => {
        usePlaybackStore.setState({ currentSong: { ...song, audioQualityInfo: { codec: 'flac', bitrate: 2784000 } } });
        watchDeferredAudioQuality(song, 'blob:current', Promise.resolve({ codec: 'FLAC', sampleRate: 96000, provenance: 'stream' }));
        await flush();
        expect(usePlaybackStore.getState().currentSong?.audioQualityInfo).toEqual({ codec: 'FLAC', bitrate: 2784000, sampleRate: 96000, provenance: 'stream' });
    });
    it('preserves reliable stream bitrate when headers only add sample rate', async () => {
        usePlaybackStore.setState({ currentSong: { ...song, audioQualityInfo: { bitrate: 320000 } } });
        watchDeferredAudioQuality(song, 'blob:current', Promise.resolve({ sampleRate: 44100, provenance: 'stream' }));
        await flush();
        expect(usePlaybackStore.getState().currentSong?.audioQualityInfo).toEqual({ bitrate: 320000, sampleRate: 44100, provenance: 'stream' });
    });
    it('replaces original file precision with measured transcoded stream properties', async () => {
        usePlaybackStore.setState({ currentSong: { ...song, audioQualityInfo: { bitrate: 4800000, bitDepth: 24, provenance: 'source' } } });
        watchDeferredAudioQuality(song, 'blob:current', Promise.resolve({ sampleRate: 44100, provenance: 'stream' }));
        await flush();
        expect(usePlaybackStore.getState().currentSong?.audioQualityInfo).toEqual({ sampleRate: 44100, provenance: 'stream' });
    });
    it('updates the current song and queue after background work completes', async () => {
        watchDeferredAudioQuality(song, 'blob:current', Promise.resolve({ bitrate: 320000 }));
        await flush();
        expect(usePlaybackStore.getState().currentSong?.audioQualityInfo).toEqual({ bitrate: 320000 });
        expect(usePlaybackStore.getState().playQueue[0].audioQualityInfo).toEqual({ bitrate: 320000 });
    });
    it('does not overwrite a different song after a track change', async () => {
        watchDeferredAudioQuality(song, 'blob:current', Promise.resolve({ bitrate: 320000 }));
        usePlaybackStore.setState({ currentSong: { ...song, id: 43 } });
        await flush();
        expect(usePlaybackStore.getState().currentSong?.audioQualityInfo).toBeUndefined();
    });
    it('does not overwrite a new source for the same song', async () => {
        watchDeferredAudioQuality(song, 'blob:old', Promise.resolve({ bitrate: 320000 }));
        await flush();
        expect(usePlaybackStore.getState().currentSong?.audioQualityInfo).toBeUndefined();
    });
    it('ignores background failures', async () => {
        watchDeferredAudioQuality(song, 'blob:current', Promise.reject(new Error('Parser failed')));
        await flush();
        expect(usePlaybackStore.getState().audioSrc).toBe('blob:current');
    });
});
