import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStableUrlSaltCache, getNavidromeAudioQualityInfo, navidromeApi, saveNavidromeConfig } from '@/services/navidromeService';
import type { NavidromeConfig, SubsonicSong } from '@/types/navidrome';
import { buildUnifiedNavidromeSong } from '@/services/playbackAdapters';
import { buildNavidromeSourceRevision } from '@/services/playbackRecovery/sourceRevision';

// test/unit/navidrome/navidromeService.test.ts
// Covers P0 Navidrome discovery and playback-report API wiring.

const config: NavidromeConfig = {
    serverUrl: 'https://navidrome.test',
    username: 'folio',
    passwordHash: 'secret',
};

const okResponse = (payload: unknown) => ({
    ok: true,
    json: async () => payload,
});

const subsonicOk = (payload: Record<string, unknown> = {}) => ({
    'subsonic-response': {
        status: 'ok',
        version: '1.16.1',
        type: 'navidrome',
        serverVersion: '0.58.0',
        openSubsonic: true,
        ...payload,
    },
});

const stubIncrementingCrypto = () => {
    let saltSeed = 0;
    vi.stubGlobal('crypto', {
        getRandomValues: (array: Uint8Array) => {
            saltSeed += 1;
            for (let index = 0; index < array.length; index += 1) {
                array[index] = (saltSeed >> ((index % 4) * 8)) & 0xff;
            }
            return array;
        },
    });
};

describe('navidromeService P0 endpoints', () => {
    beforeEach(() => {
        vi.stubGlobal('crypto', {
            getRandomValues: (array: Uint8Array) => {
                array.fill(1);
                return array;
            },
        });
    });

    afterEach(() => {
        clearStableUrlSaltCache();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('sends scrobble boolean and time parameters', async () => {
        const fetchMock = vi.fn(async () => okResponse(subsonicOk())) as any;
        vi.stubGlobal('fetch', fetchMock);

        const success = await navidromeApi.scrobble(config, 'song-1', {
            submission: false,
            time: 123456,
        });

        expect(success).toBe(true);
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.pathname).toBe('/rest/scrobble');
        expect(url.searchParams.get('id')).toBe('song-1');
        expect(url.searchParams.get('submission')).toBe('false');
        expect(url.searchParams.get('time')).toBe('123456');
    });

    it('serializes array and boolean parameters for playlist updates', async () => {
        const fetchMock = vi.fn(async () => okResponse(subsonicOk())) as any;
        vi.stubGlobal('fetch', fetchMock);

        const success = await navidromeApi.updatePlaylist(config, 'playlist-1', {
            public: false,
            songIdsToAdd: ['a', 'b'],
            songIndexesToRemove: [0, 2],
        });

        expect(success).toBe(true);
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.pathname).toBe('/rest/updatePlaylist');
        expect(url.searchParams.get('public')).toBe('false');
        expect(url.searchParams.getAll('songIdToAdd')).toEqual(['a', 'b']);
        expect(url.searchParams.getAll('songIndexToRemove')).toEqual(['0', '2']);
    });

    it('requests enhanced songLyrics so Navidrome returns word cue timing', async () => {
        const fetchMock = vi.fn(async () => okResponse(subsonicOk({
            lyricsList: {
                structuredLyrics: [{
                    line: [{ start: 1000, value: 'One' }],
                    cueLine: [{ index: 0, start: 1000, end: 1200, value: 'One', cue: [{ start: 1000, end: 1200, value: 'One' }] }],
                }],
            },
        }))) as any;
        vi.stubGlobal('fetch', fetchMock);

        const lyrics = await navidromeApi.getLyricsBySongId(config, 'song-1');

        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.pathname).toBe('/rest/getLyricsBySongId');
        expect(url.searchParams.get('id')).toBe('song-1');
        expect(url.searchParams.get('enhanced')).toBe('true');
        expect(lyrics?.[0].cueLine?.[0].cue?.[0].start).toBe(1000);
    });

    it('returns enhanced-LRC text embedded in the legacy getLyrics value field', async () => {
        const enhancedLrc = '<00:00.000>恋<00:00.608>の<00:00.912>う<00:01.216>た';
        const fetchMock = vi.fn(async () => okResponse(subsonicOk({
            lyrics: { artist: 'Yunomi', title: '恋のうた', value: enhancedLrc },
        }))) as any;
        vi.stubGlobal('fetch', fetchMock);

        await expect(navidromeApi.getLyrics(config, 'Yunomi', '恋のうた')).resolves.toBe(enhancedLrc);
        expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/rest/getLyrics');
    });

    it('loads ReplayGain from the getSong OpenSubsonic payload', async () => {
        const fetchMock = vi.fn(async () => okResponse(subsonicOk({
            song: {
                id: 'song-1',
                replayGain: { trackGain: -7.2, albumGain: -6.4, trackPeak: 0.9, albumPeak: 0.95 },
            },
        }))) as any;
        vi.stubGlobal('fetch', fetchMock);

        const song = await navidromeApi.getSong(config, 'song-1');

        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.pathname).toBe('/rest/getSong');
        expect(url.searchParams.get('id')).toBe('song-1');
        expect(song?.replayGain).toEqual({ trackGain: -7.2, albumGain: -6.4, trackPeak: 0.9, albumPeak: 0.95 });
    });

    it('keeps generated media URLs stable across repeated renders', () => {
        stubIncrementingCrypto();

        const stableConfig = { ...config, username: 'stable-media-url' };

        const firstCoverUrl = navidromeApi.getCoverArtUrl(stableConfig, 'cover-1', 600);
        const secondCoverUrl = navidromeApi.getCoverArtUrl(stableConfig, 'cover-1', 600);
        const otherCoverUrl = navidromeApi.getCoverArtUrl(stableConfig, 'cover-2', 600);
        const firstStreamUrl = navidromeApi.getStreamUrl(stableConfig, 'song-1');
        const secondStreamUrl = navidromeApi.getStreamUrl(stableConfig, 'song-1');

        expect(secondCoverUrl).toBe(firstCoverUrl);
        expect(secondStreamUrl).toBe(firstStreamUrl);
        expect(new URL(otherCoverUrl).searchParams.get('s')).not.toBe(new URL(firstCoverUrl).searchParams.get('s'));
    });

    it('clears stable media URL salts when config is saved', () => {
        stubIncrementingCrypto();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        });

        const firstCoverUrl = navidromeApi.getCoverArtUrl(config, 'cover-1', 600);
        saveNavidromeConfig(config);
        const secondCoverUrl = navidromeApi.getCoverArtUrl(config, 'cover-1', 600);

        expect(new URL(secondCoverUrl).searchParams.get('s')).not.toBe(new URL(firstCoverUrl).searchParams.get('s'));
    });

    it('evicts old stable media URL salts after many unique media URLs', () => {
        stubIncrementingCrypto();
        const stableConfig = { ...config, username: 'bounded-media-url-cache' };

        const firstCoverUrl = navidromeApi.getCoverArtUrl(stableConfig, 'cover-0', 600);
        for (let index = 1; index <= 600; index += 1) {
            navidromeApi.getCoverArtUrl(stableConfig, `cover-${index}`, 600);
        }
        const refreshedCoverUrl = navidromeApi.getCoverArtUrl(stableConfig, 'cover-0', 600);

        expect(new URL(refreshedCoverUrl).searchParams.get('s')).not.toBe(new URL(firstCoverUrl).searchParams.get('s'));
    });

    it('builds a server profile even when extension discovery fails', async () => {
        const fetchMock = vi.fn(async (rawUrl: string) => {
            const url = new URL(rawUrl);
            const endpoint = url.pathname.replace('/rest/', '');

            if (endpoint === 'getOpenSubsonicExtensions') {
                return { ok: false, status: 404, json: async () => ({}) };
            }

            if (endpoint === 'getUser') {
                return okResponse(subsonicOk({ user: { username: 'folio', scrobblingEnabled: true } }));
            }

            if (endpoint === 'getMusicFolders') {
                return okResponse(subsonicOk({
                    musicFolders: {
                        musicFolder: [{ id: 'music', name: 'Music' }],
                    },
                }));
            }

            if (endpoint === 'getLicense') {
                return okResponse(subsonicOk({ license: { valid: true } }));
            }

            return okResponse(subsonicOk());
        }) as any;
        vi.stubGlobal('fetch', fetchMock);

        const profile = await navidromeApi.getServerProfile(config);

        expect(profile.serverVersion).toBe('0.58.0');
        expect(profile.user?.username).toBe('folio');
        expect(profile.musicFolders).toEqual([{ id: 'music', name: 'Music' }]);
        expect(profile.license?.valid).toBe(true);
        expect(profile.openSubsonicExtensions).toEqual([]);
        expect(profile.capabilities.supportsFormPost).toBe(false);
    });

    it('converts source kbps to bps and keeps OpenSubsonic precision through queue conversion', () => {
        const song: SubsonicSong = {
            id: 'song-42', isDir: false, title: 'Source track', album: 'Album', artist: 'Artist',
            size: 1234, contentType: 'audio/flac', suffix: 'flac', duration: 120,
            bitRate: 1411, samplingRate: 96000, bitDepth: 24, path: 'Artist/track.flac',
            created: '2026-10-11', albumId: 'album-1', artistId: 'artist-1', type: 'music', isVideo: false,
        };
        const converted = navidromeApi.toNavidromeSong(config, song);
        expect(converted.audioQualityInfo).toEqual({
            bitrate: 1411000, sampleRate: 96000, bitDepth: 24, codec: 'flac', provenance: 'source',
        });
        expect(converted.navidromeData.bitRate).toBe(1411);
        expect(new URL(converted.navidromeData.streamUrl).searchParams.has('format')).toBe(false);
        const unified = buildUnifiedNavidromeSong(converted);
        expect(unified.audioQualityInfo).toEqual(converted.audioQualityInfo);
        expect(unified.playbackSourceRevision).toBe(buildNavidromeSourceRevision(unified, converted.navidromeData.streamUrl));
        expect(unified.sourceRef).toEqual({ kind: 'navidrome', mediaId: song.id });
    });

    it.each([
        { transcodedSuffix: 'mp3' },
        { transcodedContentType: 'audio/mpeg' },
        { transcodedSuffix: 'flac' },
    ])('does not label original precision as the quality of an advertised transcoded stream %j', (transcoding) => {
        const metadata = { bitRate: 1411, samplingRate: 96000, bitDepth: 24, suffix: 'flac', ...transcoding };
        expect(getNavidromeAudioQualityInfo(metadata, 'https://navidrome.test/rest/stream?id=42')).toBeUndefined();
        // raw explicitly bypasses the advertised server transcode policy.
        expect(getNavidromeAudioQualityInfo(metadata, 'https://navidrome.test/rest/stream?id=42&format=raw'))
            .toEqual({ bitrate: 1411000, sampleRate: 96000, bitDepth: 24, codec: 'flac', provenance: 'stream' });
    });

    it('drops stale source quality when the selected stream requests a different format or bitrate cap', () => {
        const metadata = { bitRate: 1411, suffix: 'flac' };
        expect(getNavidromeAudioQualityInfo(metadata, 'https://navidrome.test/rest/stream?id=42&format=mp3')).toBeUndefined();
        expect(getNavidromeAudioQualityInfo(metadata, 'https://navidrome.test/rest/stream?id=42&maxBitRate=192')).toBeUndefined();
    });

    it('does not retain nonpositive or invalid source precision', () => {
        expect(getNavidromeAudioQualityInfo({ bitRate: -1, samplingRate: NaN, bitDepth: 0, suffix: '' },
            'https://navidrome.test/rest/stream?id=42')).toBeUndefined();
    });
});
