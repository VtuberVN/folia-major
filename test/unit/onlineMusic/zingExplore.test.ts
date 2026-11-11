// test/unit/onlineMusic/zingExplore.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { zingExplore } from '@/services/onlineMusic/zingExplore';
import * as zingApi from '@/services/onlineMusic/zingApi';
import type { ProviderExploreItem, ProviderExploreSection } from '@/types/onlineMusic';

describe('zingExplore canonical suite', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('implements OnlineExploreProvider interface with getFeed', () => {
        expect(zingExplore).toBeDefined();
        expect(typeof zingExplore.getFeed).toBe('function');
    });

    it('loads explore sections on getFeed() including banner, trending songs, mood playlists, and chart', async () => {
        const mockHome: zingApi.ZingHomeResponse = {
            err: 0,
            msg: 'Success',
            data: {
                hasMore: true,
                total: 2,
                items: [
                    {
                        sectionType: 'banner',
                        sectionId: 'sec-banner',
                        title: 'Banner Highlights',
                        items: [
                            {
                                type: 1,
                                encodeId: 'BANNER_SONG',
                                title: 'Banner Track',
                                banner: 'http://photo-zmp3.zmdcdn.me/banner.jpg',
                                artists: [{ id: '1', name: 'Artist 1' }],
                                duration: 200,
                            },
                        ],
                    },
                    {
                        sectionType: 'new-release',
                        sectionId: 'sec-new-release',
                        title: 'Mới Phát Hành',
                        items: [
                            {
                                encodeId: 'NEW_SONG',
                                title: 'New Song',
                                artists: [{ id: '2', name: 'Artist 2' }],
                                duration: 180,
                                thumbnailM: 'http://photo-zmp3.zmdcdn.me/song.jpg',
                            },
                        ],
                    },
                    {
                        sectionType: 'playlist',
                        sectionId: 'sec-playlist',
                        title: 'Tâm Trạng & Hoạt Động',
                        items: [
                            {
                                encodeId: 'PLAYLIST_1',
                                title: 'Giai Điệu Thư Giãn',
                                thumbnailM: 'http://photo-zmp3.zmdcdn.me/pl1.jpg',
                                artists: [{ id: '3', name: 'Various Artists' }],
                            },
                        ],
                    },
                    {
                        sectionType: 'RTChart',
                        sectionId: 'sec-chart',
                        title: '#zingchart',
                        items: [
                            {
                                encodeId: 'CHART_SONG',
                                title: 'Chart Topper',
                                artists: [{ id: '4', name: 'Artist 4' }],
                                duration: 210,
                                thumbnailM: 'http://photo-zmp3.zmdcdn.me/chart.jpg',
                            },
                        ],
                    },
                ],
            },
        };

        vi.spyOn(zingApi, 'getZingHome').mockResolvedValue(mockHome);

        const page = await zingExplore.getFeed();
        expect(page).toBeDefined();
        expect(page.sections.length).toBe(4);

        const bannerSec = page.sections.find(s => s.id === 'sec-banner');
        expect(bannerSec).toBeDefined();
        expect(bannerSec?.title).toBe('Banner Highlights');
        expect(bannerSec?.items.length).toBe(1);
        expect(bannerSec?.items[0].kind).toBe('song');
        if (bannerSec?.items[0].kind === 'song') {
            expect(bannerSec.items[0].song.id).toBe('BANNER_SONG');
            expect(bannerSec.items[0].wideCoverUrl).toBe('https://photo-zmp3.zmdcdn.me/banner.jpg');
        }

        const newReleaseSec = page.sections.find(s => s.id === 'sec-new-release');
        expect(newReleaseSec).toBeDefined();
        expect(newReleaseSec?.title).toBe('Mới Phát Hành');
        expect(newReleaseSec?.items.length).toBe(1);
        expect(newReleaseSec?.items[0].kind).toBe('song');
        if (newReleaseSec?.items[0].kind === 'song') {
            expect(newReleaseSec.items[0].song.id).toBe('NEW_SONG');
        }

        const playlistSec = page.sections.find(s => s.id === 'sec-playlist');
        expect(playlistSec).toBeDefined();
        expect(playlistSec?.items.length).toBe(1);
        expect(playlistSec?.items[0].kind).toBe('collection');
        if (playlistSec?.items[0].kind === 'collection') {
            expect(playlistSec.items[0].collection.id).toBe('PLAYLIST_1');
        }

        const chartSec = page.sections.find(s => s.id === 'sec-chart');
        expect(chartSec).toBeDefined();
        expect(chartSec?.title).toBe('#zingchart');
        expect(chartSec?.items.length).toBe(1);
        expect(chartSec?.items[0].kind).toBe('song');
        if (chartSec?.items[0].kind === 'song') {
            expect(chartSec.items[0].song.id).toBe('CHART_SONG');
        }

        expect(page.refreshReadsAnew).toBe(true);
    });

    it('falls back cleanly to chart, top 100, and radio when getZingHome returns null', async () => {
        vi.spyOn(zingApi, 'getZingHome').mockResolvedValue(null);
        vi.spyOn(zingApi, 'getZingChartSongs').mockResolvedValue([
            {
                id: 'FALLBACK_CHART_1',
                name: 'Fallback Song',
                artists: [{ id: 1, name: 'Fallback Artist' }],
                album: { id: 1, name: 'Fallback Album' },
                durationMs: 200000,
                sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'FALLBACK_CHART_1' },
            },
        ]);
        vi.spyOn(zingApi, 'getZingTop100Albums').mockResolvedValue({
            items: [
                {
                    providerId: 'zing',
                    id: 'TOP100_1',
                    name: 'Top 100 V-Pop',
                    type: 'playlist',
                },
            ],
            hasMore: false,
            nextOffset: 0,
        });
        vi.spyOn(zingApi, 'getZingRadioStations').mockResolvedValue([
            {
                providerId: 'zing',
                id: 'RADIO_1',
                name: 'Radio Xone',
                type: 'playlist',
            },
        ]);

        const page = await zingExplore.getFeed();
        expect(page.sections.length).toBe(3);

        const chartSec = page.sections.find(s => s.id === 'zing-chart-section');
        expect(chartSec).toBeDefined();
        expect(chartSec?.items[0].kind === 'song' && chartSec.items[0].song.id).toBe('FALLBACK_CHART_1');

        const top100Sec = page.sections.find(s => s.id === 'zing-top100-section');
        expect(top100Sec).toBeDefined();
        expect(top100Sec?.items[0].kind === 'collection' && top100Sec.items[0].collection.id).toBe('TOP100_1');

        const radioSec = page.sections.find(s => s.id === 'zing-radio-section');
        expect(radioSec).toBeDefined();
        expect(radioSec?.items[0].kind === 'collection' && radioSec.items[0].collection.id).toBe('RADIO_1');
    });

    it('returns empty sections if all sources fail and throw errors', async () => {
        vi.spyOn(zingApi, 'getZingHome').mockRejectedValue(new Error('Fatal API crash'));
        vi.spyOn(zingApi, 'getZingChartSongs').mockRejectedValue(new Error('Chart failed'));
        vi.spyOn(zingApi, 'getZingTop100Albums').mockRejectedValue(new Error('Top100 failed'));
        vi.spyOn(zingApi, 'getZingRadioStations').mockRejectedValue(new Error('Radio failed'));

        const page = await zingExplore.getFeed();
        expect(page.sections).toEqual([]);
        expect(page.refreshReadsAnew).toBe(true);
    });
});
