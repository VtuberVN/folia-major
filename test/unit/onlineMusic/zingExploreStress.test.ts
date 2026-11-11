import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as zingApi from '../../../src/services/onlineMusic/zingApi';
import { zingExplore } from '../../../src/services/onlineMusic/zingExplore';
import { zingProvider } from '../../../src/services/onlineMusic/zingProvider';

describe('Adversarial Stress Testing: Zing Home & Explore', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('1. API Failure & Session Scenarios (getZingHome)', () => {
        it('handles { err: -201, msg: "Session expired" } by logging warning and returning null', async () => {
            vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
                const url = String(input);
                if (url.includes('/api/v2/page/get/home')) {
                    return {
                        ok: true,
                        headers: { get: () => '' },
                        json: async () => ({ err: -201, msg: 'Session expired' }),
                    } as any;
                }
                return {
                    ok: true,
                    headers: { get: (name: string) => (name.toLowerCase() === 'set-cookie' ? 'zmp3_app_version=1' : '') },
                    json: async () => ({}),
                } as any;
            });

            const result = await zingApi.getZingHome(1);
            expect(result).toBeNull();
        });

        it('handles { data: null, err: 0 } gracefully by returning null', async () => {
            vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
                const url = String(input);
                if (url.includes('/api/v2/page/get/home')) {
                    return {
                        ok: true,
                        headers: { get: () => '' },
                        json: async () => ({ err: 0, data: null }),
                    } as any;
                }
                return {
                    ok: true,
                    headers: { get: () => '' },
                    json: async () => ({}),
                } as any;
            });

            const result = await zingApi.getZingHome(1);
            expect(result).toBeNull();
        });

        it('handles HTTP 500 / 403 network failures by returning null', async () => {
            vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
                const url = String(input);
                if (url.includes('/api/v2/page/get/home')) {
                    return {
                        ok: false,
                        status: 500,
                        headers: { get: () => '' },
                    } as any;
                }
                return {
                    ok: true,
                    headers: { get: () => '' },
                    json: async () => ({}),
                } as any;
            });

            const result = await zingApi.getZingHome(1);
            expect(result).toBeNull();
        });

        it('handles fetch exception / network timeout by returning null', async () => {
            vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
                const url = String(input);
                if (url.includes('/api/v2/page/get/home')) {
                    throw new Error('Network timeout');
                }
                return {
                    ok: true,
                    headers: { get: () => '' },
                    json: async () => ({}),
                } as any;
            });

            const result = await zingApi.getZingHome(1);
            expect(result).toBeNull();
        });
    });

    describe('2. Graceful Fallback in zingExplore when getZingHome returns null / err', () => {
        it('falls back to Chart, Top100, and Radio when getZingHome returns { err: -201 }', async () => {
            vi.spyOn(zingApi, 'getZingHome').mockResolvedValue(null);

            vi.spyOn(zingApi, 'getZingChartSongs').mockResolvedValueOnce([
                {
                    id: 'CHART_1',
                    name: 'Fallback Song',
                    artists: [{ id: 1, name: 'Fallback Artist' }],
                    album: { id: 1, name: 'Fallback Album' },
                    durationMs: 180000,
                    sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'CHART_1' },
                },
            ]);
            vi.spyOn(zingApi, 'getZingTop100Albums').mockResolvedValueOnce({
                items: [
                    {
                        providerId: 'zing',
                        id: 'TOP100_1',
                        name: 'Top 100 V-Pop',
                        type: 'album',
                        trackCount: 100,
                        isOwned: false,
                    },
                ],
                total: 1,
                hasMore: false,
                nextOffset: 1,
            });
            vi.spyOn(zingApi, 'getZingRadioStations').mockResolvedValueOnce([
                {
                    providerId: 'zing',
                    id: 'RADIO_1',
                    name: 'V-Pop Radio',
                    type: 'radio',
                    trackCount: 20,
                    isOwned: false,
                },
            ]);

            const feed = await zingExplore.getFeed();
            expect(feed).toBeDefined();
            expect(feed.sections.length).toBe(3);
            expect(feed.sections[0].id).toBe('zing-chart-section');
            expect(feed.sections[1].id).toBe('zing-top100-section');
            expect(feed.sections[2].id).toBe('zing-radio-section');
        });

        it('falls back if getZingHome returns fewer than 2 meaningful sections', async () => {
            vi.spyOn(zingApi, 'getZingHome').mockResolvedValueOnce({
                err: 0,
                data: {
                    items: [
                        {
                            sectionType: 'playlist',
                            title: 'Lonely Playlist',
                            items: [
                                { encodeId: 'PL1', title: 'Single Playlist' },
                            ],
                        },
                    ],
                },
            });

            vi.spyOn(zingApi, 'getZingChartSongs').mockResolvedValueOnce([
                {
                    id: 'CHART_1',
                    name: 'Fallback Song',
                    artists: [{ id: 1, name: 'Fallback Artist' }],
                    album: { id: 1, name: 'Fallback Album' },
                    durationMs: 180000,
                    sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'CHART_1' },
                },
            ]);
            vi.spyOn(zingApi, 'getZingTop100Albums').mockResolvedValueOnce({ items: [], total: 0, hasMore: false, nextOffset: 0 });
            vi.spyOn(zingApi, 'getZingRadioStations').mockResolvedValueOnce([]);

            const feed = await zingExplore.getFeed();
            expect(feed).toBeDefined();
            expect(feed.sections[0].id).toBe('zing-chart-section');
        });
    });

    describe('3. Corner Cases: Malformed Banners & Links', () => {
        it('handles banner items with missing URLs, null fields, and invalid links without crashing', async () => {
            vi.spyOn(zingApi, 'getZingHome').mockResolvedValueOnce({
                err: 0,
                data: {
                    items: [
                        {
                            sectionType: 'banner',
                            sectionId: 'test-banner',
                            items: [
                                // Item 1: completely empty object
                                {},
                                // Item 2: missing banner/cover url, weird type
                                {
                                    encodeId: 'BANN_1',
                                    title: 'No Image Banner',
                                    type: 999,
                                    link: 'invalid-url-schema://test',
                                },
                                // Item 3: http URL that should convert to https
                                {
                                    encodeId: 'BANN_2',
                                    title: 'HTTP Image Banner',
                                    banner: 'http://photo-zmp3.zmdcdn.me/banner.jpg',
                                    type: 1, // Song type
                                },
                                // Item 4: type 4 collection with missing album object
                                {
                                    id: 'BANN_4',
                                    type: 4,
                                    description: 'Playlist Banner',
                                    cover: 'https://photo-zmp3.zmdcdn.me/cover.jpg',
                                },
                            ],
                        },
                        {
                            sectionType: 'new-release',
                            sectionId: 'test-nr',
                            items: [
                                { encodeId: 'NR_1', title: 'NR Song', duration: 120 },
                            ],
                        },
                    ],
                },
            });

            const feed = await zingExplore.getFeed();
            expect(feed).toBeDefined();
            const bannerSection = feed.sections.find(s => s.id === 'test-banner');
            expect(bannerSection).toBeDefined();
            expect(bannerSection?.items.length).toBe(4);

            const item1 = bannerSection?.items[0];
            expect(item1).toBeDefined();
            expect(item1?.wideCoverUrl).toBeUndefined();

            const item3 = bannerSection?.items[2];
            expect(item3?.kind).toBe('song');
            expect(item3?.wideCoverUrl).toBe('https://photo-zmp3.zmdcdn.me/banner.jpg');
        });
    });

    describe('4. Formatting of Song Items: duration, artists, album, sourceRef', () => {
        it('strictly validates song normalization across new-release and chart sections', async () => {
            vi.spyOn(zingApi, 'getZingHome').mockResolvedValueOnce({
                err: 0,
                data: {
                    items: [
                        {
                            sectionType: 'new-release',
                            sectionId: 'nr-sec',
                            title: 'Mới Phát Hành',
                            items: [
                                {
                                    encodeId: 'SONG_DETAIL_1',
                                    title: 'Hit Song Complete',
                                    artists: [
                                        { id: 'art1', name: 'Singer A' },
                                        { id: 'art2', name: 'Singer B' },
                                    ],
                                    album: {
                                        encodeId: 'ALBUM_1',
                                        title: 'Hit Album',
                                    },
                                    duration: 215,
                                    thumbnailM: 'http://img.zing.vn/song.jpg',
                                    streamingStatus: 2, // VIP
                                },
                                {
                                    encodeId: 'SONG_DETAIL_2',
                                    name: 'Hit Song Fallbacks',
                                    artistsNames: 'Solo Artist',
                                    duration: '185',
                                    streamingStatus: 1, // Non-vip
                                },
                                {
                                    // Missing title/name: should be filtered out by line 179 filter!
                                    // Filter checks: s && (s.encodeId || s.id) && (s.title || s.name)
                                    id: 'SONG_DETAIL_3',
                                },
                            ],
                        },
                        {
                            sectionType: 'RTChart',
                            sectionId: 'chart-sec',
                            title: '#zingchart',
                            items: [
                                {
                                    encodeId: 'CHART_SONG_1',
                                    title: 'Number 1 Song',
                                    duration: 300,
                                    artists: [{ name: 'Top Artist' }],
                                },
                            ],
                        },
                    ],
                },
            });

            const feed = await zingExplore.getFeed();
            const nrSec = feed.sections.find(s => s.id === 'nr-sec');
            expect(nrSec).toBeDefined();
            // SONG_DETAIL_3 has no title or name, so filter properly drops it (length = 2)
            expect(nrSec?.items.length).toBe(2);

            // Verify Song 1: Complete fields
            const song1Item = nrSec?.items[0];
            expect(song1Item?.kind).toBe('song');
            if (song1Item?.kind === 'song') {
                const s = song1Item.song;
                expect(s.id).toBe('SONG_DETAIL_1');
                expect(s.name).toBe('Hit Song Complete');
                expect(s.durationMs).toBe(215000);
                expect(s.artists).toHaveLength(2);
                expect(s.artists[0].name).toBe('Singer A');
                expect(s.artists[1].name).toBe('Singer B');
                expect(s.album?.id).toBe('ALBUM_1');
                expect(s.album?.name).toBe('Hit Album');
                expect(s.album?.coverUrl).toBe('https://img.zing.vn/song.jpg');
                expect(s.fee).toBe(1);
                expect(s.sourceRef).toEqual({
                    kind: 'online',
                    providerId: 'zing',
                    mediaId: 'SONG_DETAIL_1',
                });
            }

            // Verify Song 2: String duration, artistsNames fallback
            const song2Item = nrSec?.items[1];
            expect(song2Item?.kind).toBe('song');
            if (song2Item?.kind === 'song') {
                const s = song2Item.song;
                expect(s.id).toBe('SONG_DETAIL_2');
                expect(s.name).toBe('Hit Song Fallbacks');
                expect(s.durationMs).toBe(185000);
                expect(s.artists).toEqual([{ id: 0, name: 'Solo Artist' }]);
                expect(s.album?.name).toBe('Zing MP3');
                expect(s.fee).toBe(0);
                expect(s.sourceRef).toEqual({
                    kind: 'online',
                    providerId: 'zing',
                    mediaId: 'SONG_DETAIL_2',
                });
            }

            // Verify Chart Song 1: Rank formatting in subtitle
            const chartSec = feed.sections.find(s => s.id === 'chart-sec');
            expect(chartSec).toBeDefined();
            const chartItem1 = chartSec?.items[0];
            expect(chartItem1?.subtitle).toBe('#1 · Top Artist');
        });
    });

    describe('5. Provider Integration', () => {
        it('zingProvider exports explore provider correctly', () => {
            expect(zingProvider.explore).toBeDefined();
            expect(zingProvider.explore?.getFeed).toBeTypeOf('function');
        });
    });
});
