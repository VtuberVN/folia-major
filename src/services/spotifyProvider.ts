import type { NowPlayingConnectionStatus, NowPlayingTrackSnapshot } from '../types';

// src/services/spotifyProvider.ts
// Adapts Electron's Web API or local Spotify bridge to the external-playback clock contract.

const SPOTIFY_ACTIVE_POLL_INTERVAL_MS = 5000;
const SPOTIFY_INACTIVE_POLL_INTERVAL_MS = 30_000;
const SPOTIFY_LOCAL_ACTIVE_POLL_INTERVAL_MS = 2000;
const SPOTIFY_LOCAL_INACTIVE_POLL_INTERVAL_MS = 15_000;
const SPOTIFY_ERROR_RETRY_MS = 5000;
export const SPOTIFY_PLAYBACK_REFRESH_EVENT = 'folia:spotify-playback-refresh';

export type SpotifyProviderMode = 'web-api' | 'local';

export type SpotifyProgressUpdate = {
    progressMs: number;
    isReplay: boolean;
    quality: 'precise';
    rttMs: number;
};

type SpotifyProviderCallbacks = {
    onConnectionStatusChange?: (status: NowPlayingConnectionStatus) => void;
    onErrorChange?: (error: string | null) => void;
    onTrack?: (track: NowPlayingTrackSnapshot | null) => void;
    onPauseState?: (isPaused: boolean) => void;
    onProgress?: (update: SpotifyProgressUpdate) => void;
};

const areTracksEqual = (
    left: NowPlayingTrackSnapshot | null,
    right: NowPlayingTrackSnapshot | null,
) => (
    left?.id === right?.id
    && left?.title === right?.title
    && left?.artist === right?.artist
    && left?.album === right?.album
    && left?.coverUrl === right?.coverUrl
    && left?.durationMs === right?.durationMs
);

export const spotifyPlaybackToTrackSnapshot = (
    playback: ElectronSpotifyPlayback | null,
): NowPlayingTrackSnapshot | null => {
    if (!playback) {
        return null;
    }

    return {
        id: playback.id || playback.uri,
        title: playback.title || 'Spotify',
        artist: playback.artist || 'Spotify',
        album: playback.album || '',
        coverUrl: playback.coverUrl || null,
        durationMs: Math.max(0, playback.durationMs) || null,
        isVideo: playback.type === 'episode',
        isAdvertisement: false,
    };
};

export const createSpotifyProgressUpdate = (
    playback: ElectronSpotifyPlayback | null,
    previousProgressMs: number,
    rttMs: number,
): SpotifyProgressUpdate => {
    const progressMs = playback?.progressMs ?? 0;
    return {
        progressMs,
        isReplay: progressMs + 1500 < previousProgressMs,
        quality: 'precise',
        rttMs: Math.max(0, rttMs),
    };
};

export const resolveSpotifyPollIntervalMs = (
    active: boolean,
    mode: SpotifyProviderMode = 'web-api',
) => {
    if (mode === 'local') {
        return active ? SPOTIFY_LOCAL_ACTIVE_POLL_INTERVAL_MS : SPOTIFY_LOCAL_INACTIVE_POLL_INTERVAL_MS;
    }
    if (!active) {
        return SPOTIFY_INACTIVE_POLL_INTERVAL_MS;
    }
    return SPOTIFY_ACTIVE_POLL_INTERVAL_MS;
};

export const resolveSpotifyRateLimitRemainingSeconds = (
    rateLimitedUntil: number | null | undefined,
    nowMs = Date.now(),
) => {
    if (!Number.isFinite(rateLimitedUntil) || !rateLimitedUntil || rateLimitedUntil <= 0) {
        return null;
    }
    const remainingSeconds = Math.ceil((rateLimitedUntil - nowMs) / 1000);
    return remainingSeconds > 0 ? remainingSeconds : null;
};

export class SpotifyProvider {
    private readonly callbacks: SpotifyProviderCallbacks;
    private readonly mode: SpotifyProviderMode;
    private timer: number | null = null;
    private stopped = true;
    private track: NowPlayingTrackSnapshot | null = null;
    private lastProgressMs = 0;
    private lastPauseState: boolean | null = null;
    private connectionStatus: NowPlayingConnectionStatus | null = null;
    private error: string | null = null;
    private consecutiveErrors = 0;
    private active = false;
    private rateLimitedUntilMs = 0;

    constructor(
        callbacks: SpotifyProviderCallbacks = {},
        options: { mode?: SpotifyProviderMode } = {},
    ) {
        this.callbacks = callbacks;
        this.mode = options.mode ?? 'web-api';
    }

    start() {
        this.stopped = false;
        window.addEventListener(SPOTIFY_PLAYBACK_REFRESH_EVENT, this.requestImmediatePoll);
        this.updateConnectionStatus('connecting');
        void this.poll();
    }

    setActive(active: boolean) {
        if (this.active === active) {
            return;
        }
        this.active = active;
        if (this.stopped || this.timer === null) {
            return;
        }
        const remainingCooldownMs = Math.ceil(this.rateLimitedUntilMs - Date.now());
        window.clearTimeout(this.timer);
        this.timer = null;
        this.schedule(remainingCooldownMs > 0
            ? remainingCooldownMs
            : this.active
                ? 250
                : resolveSpotifyPollIntervalMs(false, this.mode));
    }

    stop({ reset = true }: { reset?: boolean } = {}) {
        this.stopped = true;
        window.removeEventListener(SPOTIFY_PLAYBACK_REFRESH_EVENT, this.requestImmediatePoll);
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
        if (reset) {
            this.track = null;
            this.lastProgressMs = 0;
            this.lastPauseState = null;
            this.rateLimitedUntilMs = 0;
            this.consecutiveErrors = 0;
            this.callbacks.onTrack?.(null);
            this.callbacks.onPauseState?.(true);
            this.callbacks.onProgress?.({ progressMs: 0, isReplay: true, quality: 'precise', rttMs: 0 });
            this.updateError(null);
            this.updateConnectionStatus('disabled');
        }
    }

    private schedule(delayMs: number) {
        if (this.stopped) {
            return;
        }
        this.timer = window.setTimeout(() => {
            this.timer = null;
            void this.poll();
        }, Math.max(250, delayMs));
    }

    private requestImmediatePoll = () => {
        if (this.stopped || this.timer === null) {
            return;
        }
        if (this.rateLimitedUntilMs > Date.now()) {
            return;
        }
        window.clearTimeout(this.timer);
        this.timer = null;
        this.schedule(250);
    };

    // Polling is serialized so slow Spotify responses cannot pile up and disturb the lyric clock.
    private async poll() {
        if (this.stopped) {
            return;
        }

        const getPlayback = this.mode === 'local'
            ? window.electron?.getSpotifyLocalPlayback
            : window.electron?.getSpotifyPlayback;
        if (!getPlayback) {
            this.handlePollError(`Spotify ${this.mode} playback bridge is unavailable.`);
            this.schedule(SPOTIFY_ERROR_RETRY_MS);
            return;
        }

        try {
            const requestStartedAt = performance.now();
            const response = await getPlayback();
            const measuredRttMs = Math.max(0, performance.now() - requestStartedAt);
            const rttMs = this.mode === 'local' ? 0 : measuredRttMs;
            if (this.stopped) {
                return;
            }
            if (response.error) {
                if (response.retryAfterMs !== null && response.retryAfterMs > 0) {
                    const retryAfterMs = Math.max(1000, response.retryAfterMs);
                    this.rateLimitedUntilMs = Date.now() + retryAfterMs;
                    this.updateError(response.error);
                    this.updateConnectionStatus('connected');
                    this.schedule(retryAfterMs);
                    return;
                }
                this.handlePollError(response.error);
                this.schedule(SPOTIFY_ERROR_RETRY_MS);
                return;
            }

            this.rateLimitedUntilMs = 0;
            this.consecutiveErrors = 0;
            this.updateError(null);
            this.updateConnectionStatus('connected');
            const playback = response.playback;
            const nextTrack = spotifyPlaybackToTrackSnapshot(playback);
            if (!areTracksEqual(this.track, nextTrack)) {
                this.track = nextTrack;
                this.callbacks.onTrack?.(nextTrack);
            }

            const progressUpdate = createSpotifyProgressUpdate(playback, this.lastProgressMs, rttMs);
            this.lastProgressMs = progressUpdate.progressMs;
            const isPaused = !(playback?.isPlaying ?? false);
            this.updatePauseState(isPaused);
            this.callbacks.onProgress?.(progressUpdate);
            this.schedule(resolveSpotifyPollIntervalMs(this.active, this.mode));
        } catch (error) {
            console.warn(`[Spotify ${this.mode}] Playback poll failed`, error);
            this.handlePollError(error instanceof Error ? error.message : String(error));
            this.schedule(SPOTIFY_ERROR_RETRY_MS);
        }
    }

    // Local probe failures pause immediately, then clear stale content after three failed reads.
    private handlePollError(error: string) {
        this.updateError(error);
        this.updateConnectionStatus('error');
        if (this.mode !== 'local') {
            return;
        }

        this.consecutiveErrors += 1;
        this.updatePauseState(true);
        if (this.consecutiveErrors < 3) {
            return;
        }

        if (this.track !== null) {
            this.track = null;
            this.callbacks.onTrack?.(null);
        }
        if (this.lastProgressMs !== 0) {
            this.lastProgressMs = 0;
            this.callbacks.onProgress?.({ progressMs: 0, isReplay: true, quality: 'precise', rttMs: 0 });
        }
    }

    private updatePauseState(isPaused: boolean) {
        if (isPaused === this.lastPauseState) {
            return;
        }
        this.lastPauseState = isPaused;
        this.callbacks.onPauseState?.(isPaused);
    }

    private updateError(error: string | null) {
        if (error === this.error) {
            return;
        }
        this.error = error;
        this.callbacks.onErrorChange?.(error);
    }

    private updateConnectionStatus(status: NowPlayingConnectionStatus) {
        if (status === this.connectionStatus) {
            return;
        }
        this.connectionStatus = status;
        this.callbacks.onConnectionStatusChange?.(status);
    }
}
