import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createSpotifyProgressUpdate,
    resolveSpotifyPollIntervalMs,
    resolveSpotifyRateLimitRemainingSeconds,
    SPOTIFY_PLAYBACK_REFRESH_EVENT,
    SpotifyProvider,
    spotifyPlaybackToTrackSnapshot,
} from '@/services/spotifyProvider';
import { resolveNowPlayingAnchorTime } from '@/utils/nowPlayingClock';
import { hasSynchronizedLyricTimeline } from '@/utils/lyrics/autoMatchBestLyric';

// test/unit/spotify/spotifyProvider.test.ts
// Locks the Spotify-to-external-playback mapping used by the Stage controller.

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const createPlayback = (isPlaying: boolean): ElectronSpotifyPlayback => ({
    id: 'track-1',
    uri: 'spotify:track:track-1',
    type: 'track',
    title: 'Track',
    artist: 'Artist',
    album: 'Album',
    coverUrl: null,
    durationMs: 240_000,
    progressMs: 42_000,
    isPlaying,
    sampledAtMs: 1,
    device: null,
});

const installSpotifyWindowMock = (
    getSpotifyPlayback: ReturnType<typeof vi.fn>,
    getSpotifyLocalPlayback?: ReturnType<typeof vi.fn>,
) => {
    const listeners = new Map<string, Set<EventListener>>();
    vi.stubGlobal('window', {
        electron: { getSpotifyPlayback, getSpotifyLocalPlayback },
        setTimeout: (callback: TimerHandler, delay?: number) => setTimeout(callback, delay) as unknown as number,
        clearTimeout: (timer: number) => clearTimeout(timer),
        addEventListener: (type: string, listener: EventListener) => {
            const registered = listeners.get(type) ?? new Set<EventListener>();
            registered.add(listener);
            listeners.set(type, registered);
        },
        removeEventListener: (type: string, listener: EventListener) => listeners.get(type)?.delete(listener),
        dispatchEvent: (event: Event) => {
            listeners.get(event.type)?.forEach(listener => listener(event));
            return true;
        },
    });
};

describe('spotifyPlaybackToTrackSnapshot', () => {
    it('maps Spotify playback into the existing external track shape', () => {
        const snapshot = spotifyPlaybackToTrackSnapshot({
            id: 'track-1',
            uri: 'spotify:track:track-1',
            type: 'track',
            title: 'Track',
            artist: 'Artist One, Artist Two',
            album: 'Album',
            coverUrl: 'https://image.test/cover.jpg',
            durationMs: 240_000,
            progressMs: 42_000,
            isPlaying: true,
            sampledAtMs: 1,
            device: null,
        });

        expect(snapshot).toEqual({
            id: 'track-1',
            title: 'Track',
            artist: 'Artist One, Artist Two',
            album: 'Album',
            coverUrl: 'https://image.test/cover.jpg',
            durationMs: 240_000,
            isVideo: false,
            isAdvertisement: false,
        });
    });

    it('returns null when Spotify has no active playback', () => {
        expect(spotifyPlaybackToTrackSnapshot(null)).toBeNull();
    });
});

describe('Spotify synchronized-lyrics gate', () => {
    it('accepts a real line timeline', () => {
        expect(hasSynchronizedLyricTimeline({
            title: 'Track',
            artist: 'Artist',
            isWordByWord: false,
            lines: [
                { fullText: 'First line', startTime: 0, endTime: 1.5, words: [] },
                { fullText: 'Second line', startTime: 1.5, endTime: 3, words: [] },
            ],
        } as any)).toBe(true);
    });

    it('rejects static or synthetic text without a timeline', () => {
        expect(hasSynchronizedLyricTimeline({
            title: 'Track',
            artist: 'Artist',
            isWordByWord: false,
            lines: [
                { fullText: 'Static lyrics only', startTime: 0, endTime: 0, words: [] },
            ],
        } as any)).toBe(false);
    });
});

describe('Spotify clock latency compensation', () => {
    it('preserves the measured RTT and advances a playing anchor by half the round trip', () => {
        const playback = {
            id: 'track-1',
            uri: 'spotify:track:track-1',
            type: 'track',
            title: 'Track',
            artist: 'Artist',
            album: 'Album',
            coverUrl: null,
            durationMs: 240_000,
            progressMs: 42_000,
            isPlaying: true,
            sampledAtMs: 1,
            device: null,
        } satisfies ElectronSpotifyPlayback;
        const update = createSpotifyProgressUpdate(playback, 41_000, 180);

        expect(update.rttMs).toBe(180);
        expect(resolveNowPlayingAnchorTime({
            progressMs: update.progressMs,
            rttMs: update.rttMs,
            paused: false,
            durationSec: 240,
        })).toBeCloseTo(42.09, 5);
    });
});

describe('Spotify playback polling cadence', () => {
    it('polls active Stage without using the network as the lyric clock', () => {
        expect(resolveSpotifyPollIntervalMs(true)).toBe(5000);
    });

    it('uses a low-frequency poll while the Spotify Stage is inactive', () => {
        expect(resolveSpotifyPollIntervalMs(false)).toBe(30_000);
    });

    it('uses the local desktop cadence for active and inactive Stage polling', () => {
        expect(resolveSpotifyPollIntervalMs(true, 'local')).toBe(2000);
        expect(resolveSpotifyPollIntervalMs(false, 'local')).toBe(15_000);
    });

    it('reports only a future Spotify cooldown as remaining time', () => {
        const nowMs = Date.parse('2026-07-27T00:00:00Z');

        expect(resolveSpotifyRateLimitRemainingSeconds(null, nowMs)).toBeNull();
        expect(resolveSpotifyRateLimitRemainingSeconds(Number.NaN, nowMs)).toBeNull();
        expect(resolveSpotifyRateLimitRemainingSeconds(nowMs + 1, nowMs)).toBe(1);
        expect(resolveSpotifyRateLimitRemainingSeconds(nowMs + 10_001, nowMs)).toBe(11);
        expect(resolveSpotifyRateLimitRemainingSeconds(nowMs, nowMs)).toBeNull();
        expect(resolveSpotifyRateLimitRemainingSeconds(nowMs - 1, nowMs)).toBeNull();
    });

    it('refreshes promptly on activation without bypassing a rate-limit cooldown', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-27T00:00:00Z'));
        const getSpotifyPlayback = vi.fn()
            .mockResolvedValueOnce({ playback: createPlayback(true), retryAfterMs: null })
            .mockResolvedValueOnce({ playback: createPlayback(true), retryAfterMs: null })
            .mockResolvedValueOnce({ playback: null, retryAfterMs: 10_000, error: 'Spotify rate limit reached.' })
            .mockResolvedValue({ playback: createPlayback(true), retryAfterMs: null });
        installSpotifyWindowMock(getSpotifyPlayback);
        const provider = new SpotifyProvider();

        provider.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(getSpotifyPlayback).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(29_999);
        expect(getSpotifyPlayback).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(getSpotifyPlayback).toHaveBeenCalledTimes(2);

        provider.setActive(true);
        await vi.advanceTimersByTimeAsync(249);
        expect(getSpotifyPlayback).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        expect(getSpotifyPlayback).toHaveBeenCalledTimes(3);

        window.dispatchEvent(new Event(SPOTIFY_PLAYBACK_REFRESH_EVENT));
        provider.setActive(false);
        provider.setActive(true);
        await vi.advanceTimersByTimeAsync(9999);
        expect(getSpotifyPlayback).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(1);
        expect(getSpotifyPlayback).toHaveBeenCalledTimes(4);

        provider.stop();
    });

    it('polls only the local bridge in local mode at the configured cadence', async () => {
        vi.useFakeTimers();
        const getSpotifyPlayback = vi.fn().mockResolvedValue({
            playback: createPlayback(true),
            retryAfterMs: null,
        });
        const getSpotifyLocalPlayback = vi.fn().mockResolvedValue({
            playback: createPlayback(true),
            retryAfterMs: null,
        });
        installSpotifyWindowMock(getSpotifyPlayback, getSpotifyLocalPlayback);
        const provider = new SpotifyProvider({}, { mode: 'local' });

        provider.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(getSpotifyLocalPlayback).toHaveBeenCalledTimes(1);
        expect(getSpotifyPlayback).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(14_999);
        expect(getSpotifyLocalPlayback).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(getSpotifyLocalPlayback).toHaveBeenCalledTimes(2);

        provider.setActive(true);
        await vi.advanceTimersByTimeAsync(250);
        expect(getSpotifyLocalPlayback).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(1_999);
        expect(getSpotifyLocalPlayback).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(1);
        expect(getSpotifyLocalPlayback).toHaveBeenCalledTimes(4);
        expect(getSpotifyPlayback).not.toHaveBeenCalled();

        provider.stop();
    });

    it('pauses on a local probe error and clears stale playback after three failures', async () => {
        vi.useFakeTimers();
        const localError = 'Neither playerctl nor gdbus could read Spotify.';
        const getSpotifyPlayback = vi.fn();
        const getSpotifyLocalPlayback = vi.fn()
            .mockResolvedValueOnce({ playback: createPlayback(true), retryAfterMs: null })
            .mockResolvedValueOnce({ playback: null, retryAfterMs: null, error: localError })
            .mockResolvedValueOnce({ playback: null, retryAfterMs: null, error: localError })
            .mockResolvedValueOnce({ playback: null, retryAfterMs: null, error: localError })
            .mockResolvedValue({ playback: createPlayback(true), retryAfterMs: null });
        installSpotifyWindowMock(getSpotifyPlayback, getSpotifyLocalPlayback);
        const onTrack = vi.fn();
        const onPauseState = vi.fn();
        const onProgress = vi.fn();
        const onErrorChange = vi.fn();
        const provider = new SpotifyProvider({ onTrack, onPauseState, onProgress, onErrorChange }, { mode: 'local' });

        provider.setActive(true);
        provider.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(onTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'track-1' }));
        expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ rttMs: 0 }));

        await vi.advanceTimersByTimeAsync(2000);
        expect(onErrorChange).toHaveBeenLastCalledWith(localError);
        expect(onPauseState).toHaveBeenLastCalledWith(true);
        expect(onTrack).not.toHaveBeenLastCalledWith(null);

        await vi.advanceTimersByTimeAsync(5000);
        expect(onTrack).not.toHaveBeenLastCalledWith(null);
        await vi.advanceTimersByTimeAsync(5000);
        expect(onTrack).toHaveBeenLastCalledWith(null);
        expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ progressMs: 0, isReplay: true }));

        await vi.advanceTimersByTimeAsync(5000);
        expect(onErrorChange).toHaveBeenLastCalledWith(null);
        expect(onTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'track-1' }));

        provider.stop();
    });
});
