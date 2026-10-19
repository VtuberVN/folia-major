import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// test/unit/spotify/spotifyMain.test.ts
// Verifies the main-process Spotify PKCE and playback normalization boundaries.

const require = createRequire(import.meta.url);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../..');
const readRepoFile = (relativePath: string) => readFile(path.join(repoRoot, relativePath), 'utf8');
const {
    buildCodeChallenge,
    buildSpotifyPlaybackControlRequest,
    createSpotifyController,
    isValidSpotifyClientId,
    normalizeSpotifyPlayback,
    resolveSpotifyRetryAfterMs,
} = require('../../../electron/spotify.cjs') as {
    buildCodeChallenge: (verifier: string) => string;
    buildSpotifyPlaybackControlRequest: (command: ElectronSpotifyPlaybackControlCommand) => { method: string; pathname: string };
    createSpotifyController: (dependencies: Record<string, unknown>) => {
        buildStatus: () => ElectronSpotifyStatus;
        getPlayback: () => Promise<ElectronSpotifyPlaybackResponse>;
        controlPlayback: (command: ElectronSpotifyPlaybackControlCommand) => Promise<ElectronSpotifyPlaybackControlResponse>;
    };
    isValidSpotifyClientId: (clientId: string) => boolean;
    normalizeSpotifyPlayback: (payload: unknown) => ElectronSpotifyPlayback | null;
    resolveSpotifyRetryAfterMs: (value: string | null, nowMs?: number) => number;
};

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const createAuthenticatedSpotifyController = (
    getMainWindow: () => unknown = () => null,
) => {
    const tokenRecord = Buffer.from(JSON.stringify({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 60 * 60 * 1000,
        scope: 'user-read-playback-state user-modify-playback-state',
    })).toString('base64');
    const values = new Map<string, unknown>([
        ['SPOTIFY_CLIENT_ID', '0123456789abcdef0123456789abcdef'],
        ['SPOTIFY_TOKEN_RECORD', `plain:${tokenRecord}`],
    ]);

    return createSpotifyController({
        privateStore: {
            get: (key: string) => values.get(key),
            set: (key: string, value: unknown) => values.set(key, value),
            delete: (key: string) => values.delete(key),
        },
        shell: { openExternal: vi.fn() },
        safeStorage: { isEncryptionAvailable: () => false },
        getMainWindow,
    });
};

describe('Spotify main-process helpers', () => {
    it('keeps the Spotify controller wired through the trusted Electron bridge', async () => {
        const [mainSource, preloadSource, stageApiSource] = await Promise.all([
            readRepoFile('electron/main.cjs'),
            readRepoFile('electron/preload.cjs'),
            readRepoFile('electron/stageApi.cjs'),
        ]);

        expect(mainSource).toContain("const { createSpotifyController } = require('./spotify.cjs');");
        expect(mainSource).toContain("const { createSpotifyLocalController } = require('./spotifyLocal.cjs');");
        expect(mainSource).toContain("name: 'spotify-auth'");
        expect(mainSource).toContain("ipcMain.handle('spotify-get-status'");
        expect(mainSource).toContain("ipcMain.handle('spotify-connect'");
        expect(mainSource).toContain("ipcMain.handle('spotify-control-playback'");
        expect(mainSource).toContain("ipcMain.handle('spotify-local-get-playback'");
        expect(mainSource).toContain('isTrustedMainWindowContents(event.sender)');
        expect(mainSource).toContain('spotify.stop();');

        expect(preloadSource).toContain("getSpotifyStatus: () => ipcRenderer.invoke('spotify-get-status')");
        expect(preloadSource).toContain("getSpotifyLocalPlayback: () => ipcRenderer.invoke('spotify-local-get-playback')");
        expect(preloadSource).toContain("controlSpotifyPlayback: (command) => ipcRenderer.invoke('spotify-control-playback', command)");
        expect(preloadSource).toContain("ipcRenderer.on('spotify-status-changed', listener)");

        expect(stageApiSource).toContain("configuredSource === 'spotify'");
        expect(stageApiSource).toContain("configuredSource === 'spotify-local'");
        expect(stageApiSource).toContain("configuredSource === 'playercap'");
    });

    it('builds the RFC 7636 S256 challenge', () => {
        expect(buildCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
            'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        );
    });

    it('accepts client IDs without accepting arbitrary text', () => {
        expect(isValidSpotifyClientId('0123456789abcdef0123456789abcdef')).toBe(true);
        expect(isValidSpotifyClientId('too short')).toBe(false);
        expect(isValidSpotifyClientId('0123456789abcdef0123456789abcde!')).toBe(false);
    });

    it('normalizes a Spotify playback response for the renderer', () => {
        const playback = normalizeSpotifyPlayback({
            progress_ms: 12_345,
            is_playing: true,
            device: { id: 'device-1', name: 'Desktop', type: 'Computer', is_restricted: false },
            item: {
                id: 'track-1',
                uri: 'spotify:track:track-1',
                type: 'track',
                name: 'Test Track',
                duration_ms: 180_000,
                artists: [{ name: 'Test Artist' }],
                album: { name: 'Test Album', images: [{ url: 'https://image.test/cover.jpg' }] },
            },
        });

        expect(playback).toMatchObject({
            id: 'track-1',
            title: 'Test Track',
            artist: 'Test Artist',
            album: 'Test Album',
            coverUrl: 'https://image.test/cover.jpg',
            durationMs: 180_000,
            progressMs: 12_345,
            isPlaying: true,
        });
    });

    it('maps the supported player controls to fixed Web API requests', () => {
        expect(buildSpotifyPlaybackControlRequest({ action: 'resume' })).toEqual({ method: 'PUT', pathname: '/me/player/play' });
        expect(buildSpotifyPlaybackControlRequest({ action: 'pause' })).toEqual({ method: 'PUT', pathname: '/me/player/pause' });
        expect(buildSpotifyPlaybackControlRequest({ action: 'seek', positionMs: 12_345.9 })).toEqual({
            method: 'PUT',
            pathname: '/me/player/seek?position_ms=12345',
        });
        expect(buildSpotifyPlaybackControlRequest({ action: 'next' })).toEqual({ method: 'POST', pathname: '/me/player/next' });
        expect(buildSpotifyPlaybackControlRequest({ action: 'previous' })).toEqual({ method: 'POST', pathname: '/me/player/previous' });
        expect(buildSpotifyPlaybackControlRequest({ action: 'repeat', state: 'track' })).toEqual({
            method: 'PUT',
            pathname: '/me/player/repeat?state=track',
        });
    });

    it('rejects malformed playback controls before they reach Spotify', () => {
        expect(() => buildSpotifyPlaybackControlRequest({ action: 'seek', positionMs: -1 })).toThrow(/non-negative/i);
        expect(() => buildSpotifyPlaybackControlRequest({ action: 'repeat', state: 'bad' } as any)).toThrow(/repeat state/i);
    });

    it('parses Retry-After without turning a missing header into a one-second retry', () => {
        expect(resolveSpotifyRetryAfterMs('2')).toBe(3000);
        expect(resolveSpotifyRetryAfterMs(null)).toBe(31_000);
        expect(resolveSpotifyRetryAfterMs('not-a-delay')).toBe(31_000);
    });

    it('publishes the cooldown deadline and clears it when the cooldown expires', async () => {
        vi.useFakeTimers();
        const now = new Date('2026-07-27T00:00:00Z');
        vi.setSystemTime(now);
        const send = vi.fn();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
            status: 429,
            headers: { 'Retry-After': '10' },
        })));
        const controller = createAuthenticatedSpotifyController(() => ({
            isDestroyed: () => false,
            webContents: { send },
        }));

        await expect(controller.getPlayback()).resolves.toMatchObject({
            error: 'Spotify rate limit reached.',
            retryAfterMs: 11_000,
        });
        expect(controller.buildStatus()).toMatchObject({
            error: 'Spotify rate limit reached.',
            rateLimitedUntil: now.getTime() + 11_000,
        });
        expect(send).toHaveBeenLastCalledWith('spotify-status-changed', expect.objectContaining({
            error: 'Spotify rate limit reached.',
            rateLimitedUntil: now.getTime() + 11_000,
        }));

        await vi.advanceTimersByTimeAsync(10_999);
        expect(controller.buildStatus().rateLimitedUntil).toBe(now.getTime() + 11_000);
        await vi.advanceTimersByTimeAsync(1);
        expect(controller.buildStatus()).toMatchObject({ error: null, rateLimitedUntil: null });
        expect(send).toHaveBeenLastCalledWith('spotify-status-changed', expect.objectContaining({
            error: null,
            rateLimitedUntil: null,
        }));
    });

    it('shares a Spotify rate-limit cooldown between playback reads and controls', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-27T00:00:00Z'));
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {
                status: 429,
                headers: { 'Retry-After': '10' },
            }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetchMock);
        const controller = createAuthenticatedSpotifyController();

        const playbackResponse = await controller.getPlayback();
        const controlResponse = await controller.controlPlayback({ action: 'pause' });

        expect(playbackResponse).toMatchObject({
            error: 'Spotify rate limit reached.',
            retryAfterMs: 11_000,
        });
        expect(controlResponse.ok).toBe(false);
        expect(controlResponse.error).toBe('Spotify rate limit reached.');
        expect(controlResponse.retryAfterMs).toBeGreaterThan(10_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(11_000);
        await expect(controller.getPlayback()).resolves.toEqual({ playback: null, retryAfterMs: null });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('renews and rebroadcasts a repeated rate limit with the same error text', async () => {
        vi.useFakeTimers();
        const now = new Date('2026-07-27T00:00:00Z');
        vi.setSystemTime(now);
        const send = vi.fn();
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {
                status: 429,
                headers: { 'Retry-After': '1' },
            }))
            .mockResolvedValueOnce(new Response(null, {
                status: 429,
                headers: { 'Retry-After': '5' },
            }));
        vi.stubGlobal('fetch', fetchMock);
        const controller = createAuthenticatedSpotifyController(() => ({
            isDestroyed: () => false,
            webContents: { send },
        }));

        await controller.getPlayback();
        expect(controller.buildStatus().rateLimitedUntil).toBe(now.getTime() + 2_000);

        vi.setSystemTime(now.getTime() + 2_000);
        await controller.getPlayback();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(controller.buildStatus()).toMatchObject({
            error: 'Spotify rate limit reached.',
            rateLimitedUntil: now.getTime() + 8_000,
        });
        expect(send).toHaveBeenLastCalledWith('spotify-status-changed', expect.objectContaining({
            error: 'Spotify rate limit reached.',
            rateLimitedUntil: now.getTime() + 8_000,
        }));
    });

    it('replaces a stale rate-limit error after a post-cooldown control failure', async () => {
        vi.useFakeTimers();
        const now = new Date('2026-07-27T00:00:00Z');
        vi.setSystemTime(now);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(null, {
                status: 429,
                headers: { 'Retry-After': '1' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                error: { message: 'No active Spotify device.' },
            }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', fetchMock);
        const controller = createAuthenticatedSpotifyController();

        await controller.getPlayback();
        vi.setSystemTime(now.getTime() + 2_000);
        await expect(controller.controlPlayback({ action: 'pause' })).resolves.toMatchObject({
            ok: false,
            error: 'No active Spotify device.',
        });

        expect(controller.buildStatus()).toMatchObject({
            error: 'No active Spotify device.',
            rateLimitedUntil: null,
        });
    });
});
