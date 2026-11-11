// test/unit/onlineMusic/zingExplorePlaybackAndUI.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { zingProvider } from '@/services/onlineMusic/zingProvider';
import { zingExplore } from '@/services/onlineMusic/zingExplore';
import * as zingApi from '@/services/onlineMusic/zingApi';
import { omni } from '@/services/onlineMusic/omni';
import { OnlineProviderError } from '@/types/onlineMusic';
import { onlineFailureOf } from '@/services/onlineMusic/failure/onlineFailureCase';
import { faceOf } from '@/components/app/home/explore/exploreFace';
import type { SongResult, UnifiedSong } from '@/types';
import type { OmniCollection, OmniExploreItem, OmniExploreSection } from '@/types/onlineMusic';

describe('Zing Explore Playback & UI Interaction Verification', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('1. Audio Playback Pipeline from Explore Items', () => {
        it('normalizes songs in zingExplore with valid sourceRef routing to omni and zingProvider.playback', async () => {
            const mockHomeResponse: zingApi.ZingHomeResponse = {
                err: 0,
                msg: 'Success',
                data: {
                    items: [
                        {
                            sectionType: 'banner',
                            sectionId: 'sec-banner',
                            title: 'Tiêu Điểm',
                            items: [
                                {
                                    type: 1,
                                    encodeId: 'BANNER_SONG_1',
                                    title: 'Em Của Ngày Hôm Qua',
                                    banner: 'https://photo-zmp3.zmdcdn.me/banner1.jpg',
                                    artists: [{ id: '1', name: 'Sơn Tùng M-TP' }],
                                    duration: 230,
                                },
                            ],
                        },
                        {
                            sectionType: 'new-release',
                            sectionId: 'sec-new-release',
                            title: 'Mới Phát Hành',
                            items: [
                                {
                                    encodeId: 'EXPLORE_SONG_1',
                                    title: 'Đừng Làm Trái Tim Anh Đau',
                                    artists: [{ id: '1', name: 'Sơn Tùng M-TP' }],
                                    duration: 315,
                                    thumbnailM: 'http://photo-zmp3.zmdcdn.me/song1.jpg',
                                    streamingStatus: 1,
                                },
                            ],
                        },
                        {
                            sectionType: 'RTChart',
                            sectionId: 'sec-rtchart',
                            title: '#zingchart',
                            items: [
                                {
                                    encodeId: 'CHART_SONG_1',
                                    title: 'Cắt Đôi Nỗi Sầu',
                                    artistsNames: 'Tăng Duy Tân',
                                    duration: 185,
                                },
                            ],
                        },
                    ],
                },
            };

            vi.spyOn(zingApi, 'getZingHome').mockResolvedValue(mockHomeResponse);
            const feed = await zingExplore.getFeed();
            expect(feed.sections).toHaveLength(3);

            // Check banner song
            const bannerItem = feed.sections[0].items[0];
            expect(bannerItem.kind).toBe('song');
            if (bannerItem.kind === 'song') {
                expect(bannerItem.song.sourceRef).toEqual({
                    kind: 'online',
                    providerId: 'zing',
                    mediaId: 'BANNER_SONG_1',
                });
                expect(bannerItem.wideCoverUrl).toBe('https://photo-zmp3.zmdcdn.me/banner1.jpg');
            }

            // Check trending song
            const trendingItem = feed.sections[1].items[0];
            expect(trendingItem.kind).toBe('song');
            if (trendingItem.kind === 'song') {
                expect(trendingItem.song.sourceRef).toEqual({
                    kind: 'online',
                    providerId: 'zing',
                    mediaId: 'EXPLORE_SONG_1',
                });
                expect(trendingItem.song.album.coverUrl).toBe('https://photo-zmp3.zmdcdn.me/song1.jpg');

                // Route through omni.getAudioSource
                vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValueOnce({
                    url: 'https://mstream.zingmp3.vn/standard/song1.mp3',
                    quality: 'standard',
                });

                const standardSource = await omni.getAudioSource(trendingItem.song, 'standard');
                expect(standardSource).toBeDefined();
                expect(standardSource?.url).toBe('https://mstream.zingmp3.vn/standard/song1.mp3');
                expect(standardSource?.quality).toBe('standard');

                // Test high quality (320kbps)
                vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValueOnce({
                    url: 'https://mstream.zingmp3.vn/high/song1.mp3',
                    quality: 'high',
                });

                const highSource = await omni.getAudioSource(trendingItem.song, 'high');
                expect(highSource).toBeDefined();
                expect(highSource?.url).toBe('https://mstream.zingmp3.vn/high/song1.mp3');
                expect(highSource?.quality).toBe('high');
            }
        });

        it('handles 128kbps (standard) and 320kbps (high) fallback correctly in getZingAudioSource', async () => {
            const origFetch = globalThis.fetch;
            try {
                // Mock response containing both 128 and 320 streams
                globalThis.fetch = vi.fn().mockResolvedValue({
                    ok: true,
                    json: async () => ({
                        err: 0,
                        msg: 'Success',
                        data: {
                            '128': 'https://mstream.zingmp3.vn/128/track.mp3',
                            '320': 'https://mstream.zingmp3.vn/320/track.mp3',
                        },
                    }),
                });

                // Request standard quality
                const standardRes = await zingApi.getZingAudioSource('SONG_128_320', 'standard');
                expect(standardRes).toEqual({
                    url: 'https://mstream.zingmp3.vn/128/track.mp3',
                    quality: 'standard',
                });

                // Request high quality
                const highRes = await zingApi.getZingAudioSource('SONG_128_320', 'high');
                expect(highRes).toEqual({
                    url: 'https://mstream.zingmp3.vn/320/track.mp3',
                    quality: 'high',
                });

                // When 320 is "VIP", it should fallback to 128 if available
                globalThis.fetch = vi.fn().mockResolvedValue({
                    ok: true,
                    json: async () => ({
                        err: 0,
                        msg: 'Success',
                        data: {
                            '128': 'https://mstream.zingmp3.vn/128/track.mp3',
                            '320': 'VIP',
                        },
                    }),
                });

                const fallbackRes = await zingApi.getZingAudioSource('SONG_VIP_320', 'high');
                expect(fallbackRes).toEqual({
                    url: 'https://mstream.zingmp3.vn/128/track.mp3',
                    quality: 'standard',
                });
            } finally {
                globalThis.fetch = origFetch;
            }
        });

        it('handles isVipOnly logic without breaking the queue, mapped to subscription-required failure', async () => {
            // Case A: stream returns isVipOnly flag
            vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValueOnce({
                url: '',
                quality: 'standard',
                isVipOnly: true,
            });

            const vipSong: UnifiedSong = {
                id: 'VIP_TRACK_1',
                name: 'Vip Only Song',
                artists: [{ id: 1, name: 'VIP Artist' }],
                album: { id: 1, name: 'VIP Album' },
                durationMs: 200000,
                sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'VIP_TRACK_1' },
            };

            let thrownError: any = null;
            try {
                await zingProvider.playback!.getAudioSource(vipSong, 'standard');
            } catch (err) {
                thrownError = err;
            }

            expect(thrownError).toBeInstanceOf(OnlineProviderError);
            expect(thrownError.code).toBe('vip-only');
            expect(thrownError.providerId).toBe('zing');

            // Verify mapping to onlineFailure: must categorize as subscription-required
            const failure = onlineFailureOf({ operation: 'audio', providerId: 'zing' }, { error: thrownError });
            expect(failure.case).toBe('subscription-required');
            expect(failure.facts.errorCode).toBe('vip-only');

            // Case B: Song marked with fee === 1 (VIP) throws vip-only immediately
            const feeVipSong: UnifiedSong = {
                id: 'VIP_TRACK_2',
                name: 'Fee 1 Song',
                artists: [{ id: 1, name: 'Artist' }],
                album: { id: 1, name: 'Album' },
                durationMs: 180000,
                fee: 1,
                sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'VIP_TRACK_2' },
            };

            vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValueOnce(null);
            await expect(zingProvider.playback!.getAudioSource(feeVipSong, 'standard')).rejects.toThrow(
                /VIP Zing MP3/
            );
        });
    });

    describe('2. Explore Surface UI Components & Interactions', () => {
        it('faceOf accurately formats wide banner cards, suggestion rows, playlist shelves, and #zingchart cards with rank indicators', () => {
            const t = (k: string) => k;

            // 1. Wide Banner Card
            const bannerSongItem: OmniExploreItem = {
                kind: 'song',
                song: {
                    id: 'BN_1',
                    name: 'Spotlight Banner Song',
                    artists: [{ id: 1, name: 'Main Artist' }],
                    album: { id: 1, name: 'Main Album', coverUrl: 'https://img.com/sq.jpg' },
                    durationMs: 210000,
                    sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'BN_1' },
                },
                wideCoverUrl: 'https://img.com/wide-banner.jpg',
                subtitle: 'Spotlight Subtitle',
            };
            const bannerFace = faceOf(bannerSongItem, t);
            expect(bannerFace.shape).toBe('wide');
            expect(bannerFace.pictureUrl).toBe('https://img.com/wide-banner.jpg');
            expect(bannerFace.coverUrl).toBe('https://img.com/sq.jpg');
            expect(bannerFace.title).toBe('Spotlight Banner Song');
            expect(bannerFace.subtitle).toBe('Spotlight Subtitle');

            // 2. Playlist Shelf
            const playlistItem: OmniExploreItem = {
                kind: 'collection',
                collection: {
                    providerId: 'zing',
                    id: 'PL_1',
                    name: 'V-Pop Hot Hits',
                    type: 'playlist',
                    coverUrl: 'https://img.com/playlist.jpg',
                    description: 'Tập hợp các bản hit V-Pop hay nhất',
                },
            };
            const playlistFace = faceOf(playlistItem, t);
            expect(playlistFace.shape).toBe('square');
            expect(playlistFace.pictureUrl).toBe('https://img.com/playlist.jpg');
            expect(playlistFace.title).toBe('V-Pop Hot Hits');
            expect(playlistFace.kind).toBe('playlist');

            // 3. #zingchart Song with Rank Indicator
            const chartSongItem: OmniExploreItem = {
                kind: 'song',
                song: {
                    id: 'CHART_1',
                    name: 'Top 1 Trending Hit',
                    artists: [{ id: 1, name: 'Star Singer' }],
                    album: { id: 1, name: 'Hit Album', coverUrl: 'https://img.com/top1.jpg' },
                    durationMs: 195000,
                    sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'CHART_1' },
                },
                subtitle: '#1 · Star Singer',
            };
            const chartFace = faceOf(chartSongItem, t);
            expect(chartFace.shape).toBe('square');
            expect(chartFace.title).toBe('Top 1 Trending Hit');
            expect(chartFace.subtitle).toBe('#1 · Star Singer');
            expect(chartFace.durationMs).toBe(195000);
        });

        it('verifies onPlaySong queues all section songs while onOpenCollection triggers for playlists', () => {
            const song1: UnifiedSong = {
                id: 'S1',
                name: 'Song 1',
                artists: [{ id: 1, name: 'A1' }],
                album: { id: 1, name: 'Album 1' },
                durationMs: 180000,
                sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'S1' },
            };
            const song2: UnifiedSong = {
                id: 'S2',
                name: 'Song 2',
                artists: [{ id: 2, name: 'A2' }],
                album: { id: 2, name: 'Album 2' },
                durationMs: 200000,
                sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'S2' },
            };
            const collection1: OmniCollection = {
                providerId: 'zing',
                id: 'COL_1',
                name: 'Top 100 Nhạc Trẻ',
                type: 'playlist',
            };

            const section: OmniExploreSection = {
                id: 'sec-zing-hot',
                title: 'Zing MP3 Hot Tracks',
                items: [
                    { kind: 'song', song: song1 },
                    { kind: 'song', song: song2 },
                    { kind: 'collection', collection: collection1 },
                ],
            };

            // Mimic ExploreSections selection logic
            const playedSongs: Array<{ song: SongResult; queue: SongResult[] }> = [];
            const openedCollections: OmniCollection[] = [];

            const onPlaySong = (song: SongResult, queue: SongResult[]) => {
                playedSongs.push({ song, queue });
            };

            const onOpenCollection = (col: OmniCollection) => {
                openedCollections.push(col);
            };

            const handleSelect = (item: OmniExploreItem, sec: OmniExploreSection) => {
                if (item.kind === 'collection') {
                    onOpenCollection(item.collection);
                    return;
                }
                onPlaySong(item.song, sec.items.flatMap(entry => (entry.kind === 'song' ? [entry.song] : [])));
            };

            // 1. Select song1: plays song1 with all songs in the section as queue ([song1, song2])
            handleSelect(section.items[0], section);
            expect(playedSongs).toHaveLength(1);
            expect(playedSongs[0].song).toEqual(song1);
            expect(playedSongs[0].queue).toEqual([song1, song2]);
            expect(openedCollections).toHaveLength(0);

            // 2. Select song2: plays song2 with the same queue
            handleSelect(section.items[1], section);
            expect(playedSongs).toHaveLength(2);
            expect(playedSongs[1].song).toEqual(song2);
            expect(playedSongs[1].queue).toEqual([song1, song2]);

            // 3. Select collection item: triggers onOpenCollection with collection1, does NOT trigger onPlaySong
            handleSelect(section.items[2], section);
            expect(playedSongs).toHaveLength(2);
            expect(openedCollections).toHaveLength(1);
            expect(openedCollections[0]).toEqual(collection1);
        });
    });
});
