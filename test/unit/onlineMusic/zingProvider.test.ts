// test/unit/onlineMusic/zingProvider.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { zingProvider } from '@/services/onlineMusic/zingProvider';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import * as zingApi from '@/services/onlineMusic/zingApi';
import { searchZingSongs as searchZingLyricSongs } from '@/utils/lyrics/providers/zingLyricProvider';

describe('zingProvider', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('is registered in providerRegistry', () => {
        const provider = getOnlineMusicProvider('zing');
        expect(provider).toBeDefined();
        expect(provider?.id).toBe('zing');
        expect(provider?.displayName).toBe('Zing MP3');
    });

    it('has required capabilities enabled', () => {
        expect(zingProvider.capabilities.playback).toBe(true);
        expect(zingProvider.capabilities.search).toBe(true);
        expect(zingProvider.capabilities.lyrics).toBe(true);
    });

    it('gets audio source successfully for non-VIP songs', async () => {
        vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValue({
            url: 'https://cdn.zingmp3.vn/mock-audio.mp3',
            quality: 'standard',
        });

        const song = {
            id: 'ZW78DIEO',
            name: 'Lạc Trôi',
            artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
            album: { id: 1, name: 'Lạc Trôi' },
            durationMs: 233000,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZW78DIEO' },
        };

        const result = await zingProvider.playback?.getAudioSource(song, 'standard');
        expect(result).toBeDefined();
        expect(result?.url).toBe('https://cdn.zingmp3.vn/mock-audio.mp3');
        expect(result?.quality).toBe('standard');
    });

    it('throws vip-only error when song is VIP only', async () => {
        vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValue({
            url: '',
            quality: 'standard',
            isVipOnly: true,
        });

        const song = {
            id: 'ZZAF09FD',
            name: 'VIP Song',
            artists: [{ id: 1, name: 'VIP Artist' }],
            album: { id: 1, name: 'VIP Album' },
            durationMs: 200000,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZZAF09FD' },
        };

        await expect(zingProvider.playback?.getAudioSource(song, 'standard')).rejects.toThrow(
            /VIP Zing MP3/
        );
    });

    it('throws vip-only error when song has fee === 1 even if stream returns null', async () => {
        vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValue(null);

        const song = {
            id: 'ZZZBIW69',
            name: 'See Tình',
            artists: [{ id: 1, name: 'Hoàng Thùy Linh' }],
            album: { id: 1, name: 'LINK' },
            durationMs: 180000,
            fee: 1,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZZZBIW69' },
        };

        await expect(zingProvider.playback?.getAudioSource(song, 'standard')).rejects.toThrow(
            /VIP Zing MP3/
        );
    });

    it('fetches lyrics via zingApi', async () => {
        const mockLyricData: any = {
            lines: [{ startTime: 1000, endTime: 3000, words: [], fullText: 'Người theo hương hoa mây mù giăng lối' }],
            format: 'lrc' as const,
        };
        vi.spyOn(zingApi, 'getZingLyric').mockResolvedValue(mockLyricData);

        const song = {
            id: 'ZW78DIEO',
            name: 'Lạc Trôi',
            artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
            album: { id: 1, name: 'Lạc Trôi' },
            durationMs: 233000,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZW78DIEO' },
        };

        const lyrics = await zingProvider.lyrics?.getLyrics(song);
        expect(lyrics?.lyrics).toEqual(mockLyricData);
    });

    it('manages cookie in auth correctly and defaults to non-VIP', async () => {
        expect(await zingProvider.auth?.getLoginStatus()).toBeNull();

        zingApi.setStoredZingCookie('zpsid=test12345');
        const status = await zingProvider.auth?.getLoginStatus();
        expect(status?.nickname).toBe('Tài khoản Zing MP3');
        expect(status?.vipType).toBe(0);

        // When verified VIP profile is stored
        zingApi.setStoredZingProfile({
            id: '12345',
            nickname: 'Nguyễn Văn A',
            vipType: 1,
        });
        const vipStatus = await zingProvider.auth?.getLoginStatus();
        expect(vipStatus?.nickname).toBe('Nguyễn Văn A');
        expect(vipStatus?.vipType).toBe(1);

        await zingProvider.auth?.logout();
        expect(await zingProvider.auth?.getLoginStatus()).toBeNull();
    });

    it('has album capabilities enabled', () => {
        expect(zingProvider.capabilities.albums).toBe(true);
        expect(zingProvider.capabilities.userAlbums).toBe(true);
    });

    it('fetches album detail and tracks via catalog', async () => {
        const mockAlbum: any = {
            providerId: 'zing',
            id: 'DeIuKsXvwKHA',
            name: 'Album Nhạc Bất Hủ 8X, 9X',
            type: 'album',
            trackCount: 8,
            isOwned: false,
        };
        vi.spyOn(zingApi, 'getZingAlbumDetail').mockResolvedValue(mockAlbum);
        vi.spyOn(zingApi, 'getZingPlaylistTracks').mockResolvedValue({
            items: [
                {
                    id: 'cZbKGpQ3YPob',
                    name: 'Dấu Chấm Hết (Remake)',
                    artists: [{ id: 1, name: 'Địa Hải' }],
                    album: { id: 'DeIuKsXvwKHA', name: 'Album Nhạc Bất Hủ 8X, 9X' },
                    durationMs: 275000,
                    sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'cZbKGpQ3YPob' },
                },
            ],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        });

        const detail = await zingProvider.catalog?.getAlbumDetail?.('DeIuKsXvwKHA');
        expect(detail).toEqual(mockAlbum);
        expect(detail?.type).toBe('album');

        const tracks = await zingProvider.catalog?.getAlbumTracks?.('DeIuKsXvwKHA', 20, 0);
        expect(tracks?.items).toHaveLength(1);
        expect(tracks?.items[0].name).toBe('Dấu Chấm Hết (Remake)');
    });

    it('fetches user albums via library.getUserAlbums', async () => {
        const mockAlbumPage = {
            items: [
                {
                    providerId: 'zing' as const,
                    id: 'YnsBe9dlQfNB',
                    name: 'CHUNG KẾT (Anh Trai Vượt Ngàn Chông Gai 2026)',
                    type: 'album' as const,
                    trackCount: 6,
                    isOwned: false,
                },
            ],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        };
        vi.spyOn(zingApi, 'getZingAlbums').mockResolvedValue(mockAlbumPage);

        const result = await zingProvider.library?.getUserAlbums?.('zing_user', 30, 0);
        expect(result?.items).toHaveLength(1);
        expect(result?.items[0].type).toBe('album');
        expect(result?.items[0].name).toBe('CHUNG KẾT (Anh Trai Vượt Ngàn Chông Gai 2026)');
    });

    it('correctly sets fee=1 on VIP songs in searchZingLyricSongs', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    items: [
                        {
                            suggestions: [
                                {
                                    type: 1,
                                    id: 'vip-song-id',
                                    title: 'VIP Track',
                                    playStatus: 3,
                                    playPrvl: [2],
                                },
                                {
                                    type: 1,
                                    id: 'free-song-id',
                                    title: 'Free Track',
                                    playStatus: 2,
                                },
                            ],
                        },
                    ],
                },
            }),
        } as any);

        const results = await searchZingLyricSongs('test', 10);
        expect(results).toHaveLength(2);
        expect(results[0].fee).toBe(1);
        expect(results[1].fee).toBe(0);
    });

    it('implements recommendations for radio, personal FM, and collections', async () => {
        expect(zingProvider.recommendations).toBeDefined();

        const mockChartSongs = [
            {
                id: 'CaBURT2uECZr',
                name: 'Giá Như Anh Là Em',
                artists: [{ id: 1, name: 'Lệ Quyên' }],
                album: { id: 1, name: 'Giá Như Anh Là Em' },
                durationMs: 240000,
                sourceRef: { kind: 'online' as const, providerId: 'zing' as const, mediaId: 'CaBURT2uECZr' },
            },
        ];
        vi.spyOn(zingApi, 'getZingChartSongs').mockResolvedValue(mockChartSongs);

        const fmSongs = await zingProvider.recommendations?.getPersonalFm?.();
        expect(fmSongs).toHaveLength(1);
        expect(fmSongs?.[0].name).toBe('Giá Như Anh Là Em');

        const dailySongs = await zingProvider.recommendations?.getDailySongs?.();
        expect(dailySongs).toHaveLength(1);
        expect(dailySongs?.[0].id).toBe('CaBURT2uECZr');

        const mockTop100 = {
            items: [
                {
                    providerId: 'zing' as const,
                    id: 'CasHsDNUCujg',
                    name: 'Top 100 Nhạc Trẻ',
                    type: 'album' as const,
                    trackCount: 100,
                    isOwned: false,
                },
            ],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        };
        const mockRadioStations = [
            {
                providerId: 'zing' as const,
                id: 'yUEDI0z9aMs',
                name: 'V-POP Radio',
                type: 'radio' as const,
                trackCount: 1,
                isOwned: false,
            },
        ];
        vi.spyOn(zingApi, 'getZingTop100Albums').mockResolvedValue(mockTop100);
        vi.spyOn(zingApi, 'getZingRadioStations').mockResolvedValue(mockRadioStations);

        const collections = await zingProvider.recommendations?.getRecommendedCollections?.(20);
        expect(collections).toHaveLength(2);
        expect(collections?.[0].type).toBe('radio');
        expect(collections?.[1].type).toBe('album');
    });

    it('falls back to getZingTop100Albums when getZingHomePlaylists returns empty', async () => {
        vi.spyOn(zingApi, 'getZingHomePlaylists').mockResolvedValue([]);
        const mockTop100 = {
            items: [
                {
                    providerId: 'zing' as const,
                    id: 'CasHsDNUCujg',
                    name: 'Top 100 Nhạc Trẻ',
                    type: 'album' as const,
                    trackCount: 100,
                    isOwned: false,
                },
            ],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        };
        vi.spyOn(zingApi, 'getZingTop100Albums').mockResolvedValue(mockTop100);

        const result = await zingProvider.library?.getUserPlaylists('zing_user', 30, 0);
        expect(result?.items).toHaveLength(1);
        expect(result?.items[0].name).toBe('Top 100 Nhạc Trẻ');
    });
});
