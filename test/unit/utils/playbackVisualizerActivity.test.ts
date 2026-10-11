import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

// The visual-work gate must skip FFT without stopping playback/lyric clocks.
const fixture = vi.hoisted(() => ({
    analysisEnabled: false,
    effect: undefined as (() => (() => void)) | undefined,
    signal: () => {
        let current: unknown = new Uint8Array(0);
        return { get: () => current, set: vi.fn((value: unknown) => { current = value; }) };
    },
}));
vi.mock('react', () => ({
    useCallback: (callback: unknown) => callback,
    useMemo: (create: () => unknown) => create(),
    useRef: (current: unknown) => ({ current }),
    useEffect: (effect: () => (() => void)) => { fixture.effect = effect; },
}));
vi.mock('../../../src/hooks/useMainWindowRenderActivity', () => ({
    useMainWindowRenderActivity: () => ({ audioAnalysisEnabled: fixture.analysisEnabled }),
}));
vi.mock('../../../src/stores/usePlaybackStore', () => ({
    usePlaybackStore: (selector: (state: unknown) => unknown) => selector({
        activePlaybackContext: 'main', playerState: 'PLAYING', duration: 120,
    }),
    selectDisplayLyrics: () => null,
    setCurrentLineIndex: vi.fn(), setPlayerState: vi.fn(),
}));
vi.mock('../../../src/stores/motionSignals', () => ({
    audioPower: fixture.signal(), currentTime: fixture.signal(), lyricCurrentTime: fixture.signal(),
    audioBands: Object.fromEntries(['bass', 'lowMid', 'mid', 'vocal', 'treble', 'spectrum'].map(key => [key, fixture.signal()])),
}));

import { audioBands, audioPower, currentTime, lyricCurrentTime } from '../../../src/stores/motionSignals';
import { usePlaybackVisualizerBridge } from '../../../src/hooks/usePlaybackVisualizerBridge';

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const mountBridge = (paused = false) => {
        const audio = { paused, ended: false, currentTime: 42 };
        let sample = 60;
        const analyser = { frequencyBinCount: 1024, getByteFrequencyData: vi.fn((bins: Uint8Array) => bins.fill(sample++)) };
        usePlaybackVisualizerBridge({
            audioRef: { current: audio } as MutableRefObject<HTMLAudioElement>,
            analyserRef: { current: analyser } as unknown as MutableRefObject<AnalyserNode>,
            animationFrameRef: { current: 0 }, effectiveLoopMode: 'off',
            isNowPlayingStageActive: false, isPlayerCapStageActive: false,
            stageActiveEntryKind: null, stageLyricsSession: null,
            stageLyricsClockRef: { current: { startTimeSec: 0, endTimeSec: 120, baseTimeSec: 0, startedAtMs: null } },
            getSyntheticStageLyricsTime: () => 0, syncStageLyricsClock: vi.fn(),
            getNowPlayingDisplayTime: () => 0, getPlayerCapDisplayTime: () => 0,
            syncNowPlayingClock: vi.fn(), lyricTimelineOffsetMs: 500,
            isTransitionAudible: () => false,
        });
        const cleanup = fixture.effect!();
        const frame = vi.mocked(requestAnimationFrame).mock.calls[0][0];
        return { audio, analyser, frame, cleanup };
};

describe('playback visual activity gate', () => {
    it.each([false, true])('preserves clocks with audio analysis enabled=%s', (enabled) => {
        fixture.analysisEnabled = enabled;
        const { analyser, frame, cleanup } = mountBridge();
        frame(0);
        expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(enabled ? 1 : 0);
        expect(audioPower.set).toHaveBeenCalledTimes(enabled ? 1 : 0);
        expect(currentTime.set).toHaveBeenCalledWith(42);
        expect(lyricCurrentTime.set).toHaveBeenCalledWith(41.5);
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
        cleanup();
        expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    });

    it('clears stale FFT once on pause and does not republish or allocate empty snapshots on idle frames', () => {
        fixture.analysisEnabled = true;
        const { audio, analyser, frame, cleanup } = mountBridge();
        frame(0);
        const firstSpectrum = audioBands.spectrum.get();
        expect(firstSpectrum.length).toBe(1024);
        frame(16);
        const secondSpectrum = audioBands.spectrum.get();
        expect(secondSpectrum).not.toBe(firstSpectrum);
        expect(secondSpectrum[0]).toBe(61);
        expect(firstSpectrum[0]).toBe(60);
        expect(secondSpectrum[0]).toBe(61);
        audio.paused = true;
        frame(32);
        const idle = audioBands.spectrum.get();
        expect(idle.length).toBe(0);
        const publishedCount = vi.mocked(audioBands.spectrum.set).mock.calls.length;
        for (let index = 0; index < 300; index++) frame(48 + index * 16);
        expect(audioBands.spectrum.get()).toBe(idle);
        expect(audioBands.spectrum.set).toHaveBeenCalledTimes(publishedCount);
        expect(analyser.getByteFrequencyData).toHaveBeenCalledTimes(2);
        audio.paused = false;
        frame(5000);
        expect(audioBands.spectrum.get().length).toBe(1024);
        expect(audioBands.spectrum.get()).not.toBe(secondSpectrum);
        expect(firstSpectrum[0]).toBe(60);
        cleanup();
    });
});
