import { createRequire } from 'module';
import { afterEach, describe, expect, it, vi } from 'vitest';

// test/unit/spotify/spotifyLocalMain.test.ts
// Locks down native Spotify command boundaries and cross-platform playback normalization.

const require = createRequire(import.meta.url);
const {
    EXEC_MAX_BUFFER_BYTES,
    PLAYERCTL_FIELD_SEPARATOR,
    createSpotifyLocalController,
    findSpotifyMprisService,
    normalizeMacSpotifyDurationMs,
    normalizeSpotifyLocalPlayback,
    parseGdbusSpotifyOutput,
    parseMacSpotifyOutput,
    parsePlayerctlSpotifyOutput,
    resolveSpotifyLocalBackend,
} = require('../../../electron/spotifyLocal.cjs') as {
    EXEC_MAX_BUFFER_BYTES: number;
    PLAYERCTL_FIELD_SEPARATOR: string;
    createSpotifyLocalController: (options?: {
        platform?: string;
        execFile?: ExecFileLike;
        now?: () => number;
    }) => {
        getPlayback: (options?: { signal?: AbortSignal; }) => Promise<ElectronSpotifyPlaybackResponse>;
        getStatus: () => { supported: boolean; platform: string; backend: string | null; };
    };
    findSpotifyMprisService: (output: string) => string | null;
    normalizeMacSpotifyDurationMs: (
        duration: unknown,
        options?: { positionMs?: unknown; },
    ) => number;
    normalizeSpotifyLocalPlayback: (payload: Record<string, unknown> | null, nowMs?: number) => ElectronSpotifyPlayback | null;
    parseGdbusSpotifyOutput: (output: string, serviceName: string) => Record<string, unknown>;
    parseMacSpotifyOutput: (output: string) => Record<string, unknown>;
    parsePlayerctlSpotifyOutput: (output: string) => Record<string, unknown>;
    resolveSpotifyLocalBackend: (platform: string) => string | null;
};

type ExecFileCallback = (error: (Error & { code?: string | number; }) | null, stdout: string, stderr: string) => void;
type ExecFileLike = (
    file: string,
    args: string[],
    options: Record<string, unknown>,
    callback: ExecFileCallback,
) => unknown;

type ExecResult = {
    error?: Error & { code?: string | number; };
    stdout?: string;
    stderr?: string;
};

const createExecFileQueue = (initialResults: ExecResult[]) => {
    const results = [...initialResults];
    return vi.fn((
        _file: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: ExecFileCallback,
    ) => {
        const result = results.shift();
        if (!result) {
            throw new Error('Unexpected execFile call.');
        }
        callback(result.error ?? null, result.stdout ?? '', result.stderr ?? '');
        return { kill: vi.fn() };
    });
};

const errorWithCode = (message: string, code: string | number) => Object.assign(new Error(message), { code });

const GDBUS_PLAYBACK_OUTPUT = String.raw`({'PlaybackStatus': <'Playing'>, 'LoopStatus': <'None'>, 'Metadata': <{'mpris:trackid': <objectpath '/com/spotify/track/abc'>, 'mpris:length': <int64 240000000>, 'mpris:artUrl': <'https://image.test/cover.jpg'>, 'xesam:album': <'Test Album'>, 'xesam:artist': <['Artist One', 'Artist Two']>, 'xesam:title': <'Don\'t Stop'>, 'xesam:url': <'spotify:track:abc'>}>, 'Position': <int64 42000000>},)`;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Spotify local playback normalization', () => {
    it('normalizes a native payload into the existing Electron Spotify playback shape', () => {
        expect(normalizeSpotifyLocalPlayback({
            running: true,
            state: 'Playing',
            id: 'track-1',
            uri: 'spotify:track:track-1',
            title: ' Track ',
            artist: ['Artist One', 'Artist Two'],
            album: 'Album',
            coverUrl: 'https://image.test/cover.jpg',
            durationMs: 240_000.9,
            progressMs: 250_000,
            sourceId: 'spotify-session',
        }, 123_456)).toEqual({
            id: 'track-1',
            uri: 'spotify:track:track-1',
            type: 'track',
            title: 'Track',
            artist: 'Artist One, Artist Two',
            album: 'Album',
            coverUrl: 'https://image.test/cover.jpg',
            durationMs: 240_000,
            progressMs: 240_000,
            isPlaying: true,
            sampledAtMs: 123_456,
            device: {
                id: 'spotify-session',
                name: 'Spotify',
                type: 'Computer',
                isRestricted: false,
            },
        });
    });

    it('keeps paused tracks but removes stopped or missing sessions', () => {
        expect(normalizeSpotifyLocalPlayback({
            running: true,
            state: 'paused',
            uri: 'spotify:episode:episode-1',
            title: 'Episode',
            artist: '',
            durationMs: 1_000,
            progressMs: 100,
        }, 1)).toMatchObject({ type: 'episode', isPlaying: false, artist: 'Spotify' });
        expect(normalizeSpotifyLocalPlayback({ running: true, state: 'stopped' }, 1)).toBeNull();
        expect(normalizeSpotifyLocalPlayback({ running: false }, 1)).toBeNull();
        expect(normalizeSpotifyLocalPlayback(null, 1)).toBeNull();
    });

    it('uses playback position to distinguish seconds from milliseconds, including short episodes', () => {
        expect(normalizeMacSpotifyDurationMs(240_000)).toBe(240_000);
        expect(normalizeMacSpotifyDurationMs(240)).toBe(240_000);
        expect(normalizeMacSpotifyDurationMs(3_600, { positionMs: 0 })).toBe(3_600_000);
        expect(normalizeMacSpotifyDurationMs(60_000, { positionMs: 0 })).toBe(60_000);
        expect(normalizeMacSpotifyDurationMs(60, { positionMs: 30_000 })).toBe(60_000);
        expect(normalizeMacSpotifyDurationMs(60_000, { positionMs: 30_000 })).toBe(60_000);
        expect(normalizeMacSpotifyDurationMs(240_000, { positionMs: 240_500 })).toBe(240_000);
        expect(normalizeMacSpotifyDurationMs(10_800, {
            positionMs: 120_000,
        })).toBe(10_800_000);
        expect(normalizeMacSpotifyDurationMs(10_800_000, {
            positionMs: 120_000,
        })).toBe(10_800_000);
        expect(normalizeMacSpotifyDurationMs('bad')).toBe(0);

        expect(parseMacSpotifyOutput(JSON.stringify({
            running: true,
            state: 'paused',
            duration: 240,
            position: 42.5,
        }))).toMatchObject({
            backend: 'applescript',
            durationMs: 240_000,
            progressMs: 42_500,
        });

        expect(parseMacSpotifyOutput(JSON.stringify({
            running: true,
            state: 'playing',
            uri: 'spotify:episode:short',
            duration: 60_000,
            position: 30,
        }))).toMatchObject({
            backend: 'applescript',
            durationMs: 60_000,
            progressMs: 30_000,
        });

        expect(parseMacSpotifyOutput(JSON.stringify({
            running: true,
            state: 'paused',
            uri: 'spotify:episode:legacy',
            duration: 3_600,
            position: 0,
        }))).toMatchObject({
            backend: 'applescript',
            durationMs: 3_600_000,
            progressMs: 0,
        });
    });
});

describe('macOS Spotify local probe', () => {
    it('checks the process without a shell and then runs one fixed AppleScript probe', async () => {
        const execFile = createExecFileQueue([
            { stdout: '' },
            {
                stdout: JSON.stringify({
                    running: true,
                    state: 'playing',
                    id: 'track-1',
                    uri: 'spotify:track:track-1',
                    title: 'Track',
                    artist: 'Artist',
                    album: 'Album',
                    coverUrl: '',
                    duration: 240,
                    position: 42,
                }),
            },
        ]);
        const abortController = new AbortController();
        const controller = createSpotifyLocalController({
            platform: 'darwin',
            execFile: execFile as unknown as ExecFileLike,
            now: () => 999,
        });

        await expect(controller.getPlayback({ signal: abortController.signal })).resolves.toMatchObject({
            playback: {
                title: 'Track',
                durationMs: 240_000,
                progressMs: 42_000,
                sampledAtMs: 999,
                isPlaying: true,
            },
            retryAfterMs: null,
        });

        expect(execFile).toHaveBeenCalledTimes(2);
        expect(execFile.mock.calls[0][0]).toBe('/usr/bin/pgrep');
        expect(execFile.mock.calls[0][1]).toEqual(['-xq', 'Spotify']);
        expect(execFile.mock.calls[0][2]).toMatchObject({
            encoding: 'utf8',
            timeout: 2_000,
            maxBuffer: EXEC_MAX_BUFFER_BYTES,
            windowsHide: true,
            signal: abortController.signal,
        });
        expect(execFile.mock.calls[1][0]).toBe('/usr/bin/osascript');
        expect(execFile.mock.calls[1][1].slice(0, 3)).toEqual(['-l', 'AppleScript', '-e']);
        expect(execFile.mock.calls[1][1][3]).toContain('tell application "Spotify"');
        expect(execFile.mock.calls[1][1][3]).toContain('NSJSONSerialization');
        expect(execFile.mock.calls[1][2]).toMatchObject({ timeout: 5_000 });
    });

    it('returns no playback without invoking AppleScript when Spotify is not running', async () => {
        const execFile = createExecFileQueue([
            { error: errorWithCode('no matching process', 1) },
        ]);
        const controller = createSpotifyLocalController({ platform: 'darwin', execFile: execFile as unknown as ExecFileLike });

        await expect(controller.getPlayback()).resolves.toEqual({ playback: null, retryAfterMs: null });
        expect(execFile).toHaveBeenCalledTimes(1);
    });

    it('reports process-query failures instead of mislabeling them as a stopped client', async () => {
        const execFile = createExecFileQueue([
            { error: errorWithCode('pgrep denied', 'EACCES') },
        ]);
        const controller = createSpotifyLocalController({ platform: 'darwin', execFile: execFile as unknown as ExecFileLike });

        await expect(controller.getPlayback()).resolves.toMatchObject({
            playback: null,
            retryAfterMs: null,
            error: expect.stringContaining('pgrep denied'),
        });
    });
});

describe('Windows GSMTC Spotify local probe', () => {
    it('uses a hidden bounded PowerShell process and prefers the playing Spotify session', async () => {
        const execFile = createExecFileQueue([{
            stdout: JSON.stringify({
                running: true,
                state: 'playing',
                title: 'Track',
                artist: 'Artist',
                album: 'Album',
                durationMs: 180_000,
                progressMs: 12_000,
                sourceId: 'Spotify.exe',
            }),
        }]);
        const controller = createSpotifyLocalController({
            platform: 'win32',
            execFile: execFile as unknown as ExecFileLike,
            now: () => 321,
        });

        await expect(controller.getPlayback()).resolves.toMatchObject({
            playback: {
                title: 'Track',
                durationMs: 180_000,
                progressMs: 12_000,
                sampledAtMs: 321,
                device: { id: 'Spotify.exe' },
            },
        });

        expect(execFile).toHaveBeenCalledTimes(1);
        expect(execFile.mock.calls[0][0]).toBe('powershell.exe');
        expect(execFile.mock.calls[0][1].slice(0, -1)).toEqual([
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
        ]);
        expect(execFile.mock.calls[0][1].at(-1)).toContain('GlobalSystemMediaTransportControlsSessionManager');
        expect(execFile.mock.calls[0][1].at(-1)).toContain("SourceAppUserModelId -notmatch '(?i)spotify'");
        expect(execFile.mock.calls[0][1].at(-1)).toContain("$candidateStatus -eq 'Paused'");
        expect(execFile.mock.calls[0][1].at(-1)).toContain('$candidateRank -gt $sessionRank');
        expect(execFile.mock.calls[0][1].at(-1)).toContain('$candidateRank -eq 2');
        expect(execFile.mock.calls[0][2]).toMatchObject({
            timeout: 5_000,
            maxBuffer: EXEC_MAX_BUFFER_BYTES,
            windowsHide: true,
        });
    });

    it('treats a successful GSMTC no-session result as normal inactivity', async () => {
        const execFile = createExecFileQueue([{ stdout: '{"running":false}' }]);
        const controller = createSpotifyLocalController({ platform: 'win32', execFile: execFile as unknown as ExecFileLike });

        await expect(controller.getPlayback()).resolves.toEqual({ playback: null, retryAfterMs: null });
    });

    it('accepts a harmless PowerShell banner before the JSON payload', async () => {
        const execFile = createExecFileQueue([{
            stdout: 'Windows PowerShell\r\n{"running":false}\r\n',
        }]);
        const controller = createSpotifyLocalController({ platform: 'win32', execFile: execFile as unknown as ExecFileLike });

        await expect(controller.getPlayback()).resolves.toEqual({ playback: null, retryAfterMs: null });
    });
});

describe('Linux MPRIS Spotify local probe', () => {
    it('prefers playerctl and parses its control-character-delimited metadata', async () => {
        const playerctlOutput = [
            'Playing',
            '/com/spotify/track/abc',
            'spotify:track:abc',
            'Track',
            'Artist One, Artist Two',
            'Album',
            'https://image.test/cover.jpg',
            '240000000',
            '42000000',
        ].join(PLAYERCTL_FIELD_SEPARATOR);
        const execFile = createExecFileQueue([{ stdout: playerctlOutput }]);
        const controller = createSpotifyLocalController({
            platform: 'linux',
            execFile: execFile as unknown as ExecFileLike,
            now: () => 777,
        });

        await expect(controller.getPlayback()).resolves.toMatchObject({
            playback: {
                id: '/com/spotify/track/abc',
                uri: 'spotify:track:abc',
                title: 'Track',
                artist: 'Artist One, Artist Two',
                durationMs: 240_000,
                progressMs: 42_000,
                sampledAtMs: 777,
            },
        });

        expect(execFile).toHaveBeenCalledTimes(1);
        expect(execFile.mock.calls[0][0]).toBe('playerctl');
        expect(execFile.mock.calls[0][1].slice(0, 3)).toEqual(['--player=spotify', 'metadata', '--format']);
        expect(execFile.mock.calls[0][1][3]).toContain('{{mpris:length}}');
    });

    it('falls back to gdbus and accepts only a validated Spotify bus name', async () => {
        const execFile = createExecFileQueue([
            { error: errorWithCode('playerctl missing', 'ENOENT') },
            {
                stdout: "(['org.mpris.MediaPlayer2.spotify.instance42', 'org.mpris.MediaPlayer2.spotify', ':1.3'],)",
            },
            { stdout: GDBUS_PLAYBACK_OUTPUT },
        ]);
        const controller = createSpotifyLocalController({
            platform: 'linux',
            execFile: execFile as unknown as ExecFileLike,
            now: () => 888,
        });

        await expect(controller.getPlayback()).resolves.toMatchObject({
            playback: {
                id: '/com/spotify/track/abc',
                uri: 'spotify:track:abc',
                title: "Don't Stop",
                artist: 'Artist One, Artist Two',
                album: 'Test Album',
                coverUrl: 'https://image.test/cover.jpg',
                durationMs: 240_000,
                progressMs: 42_000,
                sampledAtMs: 888,
            },
        });

        expect(execFile).toHaveBeenCalledTimes(3);
        expect(execFile.mock.calls[1][0]).toBe('gdbus');
        expect(execFile.mock.calls[1][1]).toContain('org.freedesktop.DBus.ListNames');
        expect(execFile.mock.calls[2][0]).toBe('gdbus');
        expect(execFile.mock.calls[2][1]).toContain('org.mpris.MediaPlayer2.spotify');
        expect(execFile.mock.calls[2][1]).not.toContain('org.mpris.MediaPlayer2.spotify.instance42');
    });

    it('returns normal inactivity when neither playerctl nor D-Bus lists Spotify', async () => {
        const execFile = createExecFileQueue([
            { error: errorWithCode('no players', 1) },
            { stdout: "(['org.freedesktop.DBus', ':1.3'],)" },
        ]);
        const controller = createSpotifyLocalController({ platform: 'linux', execFile: execFile as unknown as ExecFileLike });

        await expect(controller.getPlayback()).resolves.toEqual({ playback: null, retryAfterMs: null });
        expect(execFile).toHaveBeenCalledTimes(2);
    });

    it('reports both unavailable Linux transports without throwing through IPC', async () => {
        const execFile = createExecFileQueue([
            { error: errorWithCode('playerctl missing', 'ENOENT') },
            { error: errorWithCode('gdbus missing', 'ENOENT') },
        ]);
        const controller = createSpotifyLocalController({ platform: 'linux', execFile: execFile as unknown as ExecFileLike });

        await expect(controller.getPlayback()).resolves.toMatchObject({
            playback: null,
            retryAfterMs: null,
            error: expect.stringMatching(/playerctl missing.*gdbus missing/),
        });
    });
});

describe('GVariant and platform safety helpers', () => {
    it('parses escaped GVariant metadata and microsecond timing', () => {
        expect(parseGdbusSpotifyOutput(
            GDBUS_PLAYBACK_OUTPUT,
            'org.mpris.MediaPlayer2.spotify',
        )).toMatchObject({
            state: 'Playing',
            id: '/com/spotify/track/abc',
            title: "Don't Stop",
            artist: 'Artist One, Artist Two',
            durationMs: 240_000,
            progressMs: 42_000,
        });
    });

    it('prefers the exact Spotify service and rejects injected bus-name suffixes', () => {
        expect(findSpotifyMprisService(
            "(['org.mpris.MediaPlayer2.spotify.instance9', 'org.mpris.MediaPlayer2.spotify'],)",
        )).toBe('org.mpris.MediaPlayer2.spotify');
        expect(findSpotifyMprisService(
            "(['org.mpris.MediaPlayer2.spotify;touch /tmp/bad'],)",
        )).toBeNull();
        expect(() => parseGdbusSpotifyOutput('{}', 'org.mpris.MediaPlayer2.spotify;bad')).toThrow(/invalid MPRIS/i);
    });

    it('rejects malformed command output as a bounded response error', async () => {
        expect(() => parsePlayerctlSpotifyOutput('only one field')).toThrow(/field count/i);
        const execFile = createExecFileQueue([{ stdout: 'not json' }]);
        const controller = createSpotifyLocalController({ platform: 'win32', execFile: execFile as unknown as ExecFileLike });

        await expect(controller.getPlayback()).resolves.toMatchObject({
            playback: null,
            retryAfterMs: null,
            error: expect.stringContaining('malformed JSON'),
        });
    });

    it('rejects structurally incomplete playback instead of creating a phantom track', async () => {
        expect(() => normalizeSpotifyLocalPlayback({ running: true, state: 'playing' }, 1)).toThrow(/track metadata/i);
        expect(() => normalizeSpotifyLocalPlayback({ running: true, title: 'Track' }, 1)).toThrow(/invalid state/i);
        expect(() => normalizeSpotifyLocalPlayback({ state: 'playing', title: 'Track' }, 1)).toThrow(/running session/i);

        const execFile = createExecFileQueue([{ stdout: '{}' }]);
        const controller = createSpotifyLocalController({
            platform: 'win32',
            execFile: execFile as unknown as ExecFileLike,
        });
        await expect(controller.getPlayback()).resolves.toMatchObject({
            playback: null,
            retryAfterMs: null,
            error: expect.stringContaining('running session'),
        });
    });

    it('surfaces cancellation and unsupported platforms in the response contract', async () => {
        const abortController = new AbortController();
        abortController.abort();
        const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
        const execFile = createExecFileQueue([{ error: abortError }]);
        const macController = createSpotifyLocalController({ platform: 'darwin', execFile: execFile as unknown as ExecFileLike });

        await expect(macController.getPlayback({ signal: abortController.signal })).resolves.toMatchObject({
            error: 'Spotify local playback request was cancelled.',
        });

        const unsupportedExec = vi.fn();
        const unsupportedController = createSpotifyLocalController({
            platform: 'freebsd',
            execFile: unsupportedExec as unknown as ExecFileLike,
        });
        await expect(unsupportedController.getPlayback()).resolves.toMatchObject({
            playback: null,
            retryAfterMs: null,
            error: expect.stringContaining('not supported on freebsd'),
        });
        expect(unsupportedExec).not.toHaveBeenCalled();
        expect(unsupportedController.getStatus()).toEqual({
            supported: false,
            platform: 'freebsd',
            backend: null,
        });
    });

    it('maps supported platforms to stable backend identifiers', () => {
        expect(resolveSpotifyLocalBackend('darwin')).toBe('applescript');
        expect(resolveSpotifyLocalBackend('win32')).toBe('gsmtc');
        expect(resolveSpotifyLocalBackend('linux')).toBe('playerctl');
        expect(resolveSpotifyLocalBackend('freebsd')).toBeNull();
    });
});
