// src/services/onlineMusic/zingExplore.ts
// Explore adapter for Zing MP3 in Folia Major.
// Provides structured, rich explore sections modeled after Zing MP3 Web Home:
//  1. Banner Slider / Spotlight (`sectionType === 'banner'`)
//  2. Trending Songs / Gợi ý bài hát (`sectionType === 'new-release'` / `songStation` / trending)
//  3..N. Mood, Genre & Curated Playlists (`sectionType === 'playlist'`)
//  4. Realtime Chart #zingchart (`sectionType === 'RTChart'`)
// Supports graceful fallback to Top 100, Chart, and Radio if getZingHome fails.

import type { UnifiedSong } from '../../types';
import type {
    OnlineExploreProvider,
    ProviderCollection,
    ProviderExploreItem,
    ProviderExplorePage,
    ProviderExploreSection,
} from '../../types/onlineMusic';
import {
    getZingChartSongs,
    getZingHome,
    getZingRadioStations,
    getZingTop100Albums,
    type ZingHomeBannerItem,
    type ZingHomeSection,
} from './zingApi';

const ZING_BANNER_SECTION_ID = 'zing-banner-section';
const ZING_NEW_RELEASE_SECTION_ID = 'zing-new-release-section';
const ZING_CHART_SECTION_ID = 'zing-chart-section';
const ZING_TOP100_SECTION_ID = 'zing-top100-section';
const ZING_RADIO_SECTION_ID = 'zing-radio-section';

function normalizeZingSongItem(s: any): UnifiedSong {
    const id = String(s.encodeId || s.id);
    const artists = Array.isArray(s.artists)
        ? s.artists.map((a: any, i: number) => ({ id: a.id || i, name: String(a.name || 'Zing MP3') }))
        : [{ id: 0, name: String(s.artistsNames || 'Zing MP3') }];

    const coverUrl = s.thumbnailM || s.thumbnail || s.thumbnailR
        ? String(s.thumbnailM || s.thumbnail || s.thumbnailR).replace('http:', 'https:')
        : undefined;

    const isVip = Boolean(
        s.streamingStatus === 2 ||
        s.playStatus === 3 ||
        (Array.isArray(s.playPrvl) && s.playPrvl.includes(2)) ||
        (Array.isArray(s.indicators) && s.indicators.includes('vip'))
    );

    return {
        id,
        name: String(s.title || s.name || 'Bài hát'),
        artists,
        album: {
            id: s.album?.encodeId || 0,
            name: String(s.album?.title || s.title || 'Zing MP3'),
            coverUrl,
        },
        durationMs: (Number(s.duration) || 0) * 1000,
        fee: isVip ? 1 : 0,
        sourceRef: { kind: 'online' as const, providerId: 'zing' as const, mediaId: id },
    };
}

function normalizeZingPlaylistItem(item: any, type: 'playlist' | 'album' = 'playlist'): ProviderCollection {
    const id = String(item.encodeId || item.id);
    const title = String(item.title || item.name || 'Zing Playlist');
    const cover = item.thumbnailM || item.thumbnail || item.thumbnailR;
    return {
        providerId: 'zing',
        id,
        name: title,
        type,
        coverUrl: cover ? String(cover).replace('http:', 'https:') : undefined,
        description: item.sortDescription || item.description || item.artistsNames || undefined,
        trackCount: Number(item.song?.total || item.songCount || 0),
        isOwned: false,
    };
}

function songToExploreItem(song: UnifiedSong, wideCoverUrl?: string, subtitle?: string): ProviderExploreItem {
    return {
        kind: 'song',
        song,
        wideCoverUrl: wideCoverUrl ? wideCoverUrl.replace('http:', 'https:') : undefined,
        subtitle: subtitle || (song.artists?.map((a: { name: string }) => a.name).join(', ') || 'Zing MP3'),
    };
}

function collectionToExploreItem(collection: ProviderCollection, wideCoverUrl?: string, subtitle?: string): ProviderExploreItem {
    return {
        kind: 'collection',
        collection,
        wideCoverUrl: wideCoverUrl ? wideCoverUrl.replace('http:', 'https:') : undefined,
        subtitle: subtitle || collection.description || collection.name,
    };
}

function mapBannerItemToExploreItem(bannerItem: ZingHomeBannerItem): ProviderExploreItem | null {
    const bannerUrl = bannerItem.banner || bannerItem.cover || bannerItem.thumbnailM || bannerItem.thumbnail;
    const title = bannerItem.title || bannerItem.description || 'Zing Spotlight';
    const subtitle = bannerItem.description || bannerItem.artistsNames || 'Zing MP3';

    // Type 1 is song, Type 4 is playlist/album
    if (bannerItem.type === 1 || bannerItem.song || (bannerItem.encodeId && !bannerItem.album && bannerItem.type !== 4)) {
        const songRaw = bannerItem.song || bannerItem;
        const song = normalizeZingSongItem(songRaw);
        return songToExploreItem(song, bannerUrl, subtitle);
    }

    const playlistRaw = bannerItem.album || bannerItem;
    const collection = normalizeZingPlaylistItem(playlistRaw, 'playlist');
    return collectionToExploreItem(collection, bannerUrl, subtitle);
}

function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export const zingExplore: OnlineExploreProvider = {
    async getFeed(_cursor?: string, _listened?: UnifiedSong[]): Promise<ProviderExplorePage> {
        try {
            // Attempt to fetch native Zing Home sections
            const homeResponse = await getZingHome(1).catch(err => {
                console.warn('[ZingExplore] getZingHome failed, falling back:', err);
                return null;
            });

            const sections: ProviderExploreSection[] = [];
            const homeSections = homeResponse?.data?.items || [];

            if (homeSections.length > 0) {
                let bannerSectionFound = false;
                let newReleaseSectionFound = false;
                let chartSectionFound = false;

                for (const rawSec of homeSections) {
                    const secType = rawSec.sectionType;

                    // Section 1: Banner Slider / Spotlight
                    if (secType === 'banner' && Array.isArray(rawSec.items) && rawSec.items.length > 0) {
                        const bannerItems: ProviderExploreItem[] = rawSec.items
                            .map(mapBannerItemToExploreItem)
                            .filter((item): item is ProviderExploreItem => item !== null);

                        if (bannerItems.length > 0) {
                            sections.push({
                                id: rawSec.sectionId || ZING_BANNER_SECTION_ID,
                                title: rawSec.title || 'Tiêu Điểm & Nổi Bật',
                                items: bannerItems,
                                changesWithRead: true,
                            });
                            bannerSectionFound = true;
                        }
                        continue;
                    }

                    // Section 2: Trending Songs / Gợi ý bài hát / Mới phát hành
                    if ((secType === 'new-release' || secType === 'songStation') && !newReleaseSectionFound) {
                        let rawSongs: any[] = [];
                        if (Array.isArray(rawSec.items)) {
                            // new-release section sometimes has sub-tabs (all, vPop, others) in items or directly
                            if (rawSec.items.length > 0 && Array.isArray((rawSec.items[0] as any)?.song)) {
                                rawSongs = (rawSec.items[0] as any).song;
                            } else {
                                rawSongs = rawSec.items;
                            }
                        } else if (rawSec.items && typeof rawSec.items === 'object') {
                            const obj = rawSec.items as Record<string, any>;
                            rawSongs = obj.all || obj.vPop || Object.values(obj).find(v => Array.isArray(v)) || [];
                        }

                        const songs = rawSongs
                            .filter(s => s && (s.encodeId || s.id) && (s.title || s.name))
                            .map(s => songToExploreItem(normalizeZingSongItem(s)));

                        if (songs.length > 0) {
                            sections.push({
                                id: rawSec.sectionId || ZING_NEW_RELEASE_SECTION_ID,
                                title: rawSec.title || 'Mới Phát Hành & Gợi Ý Thịnh Hành',
                                items: songs.slice(0, 20),
                                changesWithRead: true,
                            });
                            newReleaseSectionFound = true;
                        }
                        continue;
                    }

                    // Section 4: Realtime Chart #zingchart
                    if ((secType === 'RTChart' || secType === 'chart') && !chartSectionFound) {
                        let chartSongs: any[] = [];
                        if (Array.isArray(rawSec.items)) {
                            chartSongs = rawSec.items;
                        } else if (rawSec.chart?.items) {
                            chartSongs = rawSec.chart.items;
                        }

                        const songs = chartSongs
                            .slice(0, 10)
                            .filter(s => s && (s.encodeId || s.id) && (s.title || s.name))
                            .map((s, idx) => {
                                const song = normalizeZingSongItem(s);
                                const rank = idx + 1;
                                const rankPrefix = `#${rank}`;
                                const subtitle = `${rankPrefix} · ${song.artists?.map(a => a.name).join(', ') || 'Zing MP3'}`;
                                return songToExploreItem(song, undefined, subtitle);
                            });

                        if (songs.length > 0) {
                            sections.push({
                                id: rawSec.sectionId || ZING_CHART_SECTION_ID,
                                title: rawSec.title || '#zingchart · Bảng Xếp Hạng Realtime',
                                items: songs,
                                changesWithRead: true,
                            });
                            chartSectionFound = true;
                        }
                        continue;
                    }

                    // Section 3..N: Mood & Genre Playlists
                    if (secType === 'playlist' && Array.isArray(rawSec.items) && rawSec.items.length > 0) {
                        const playlists = rawSec.items
                            .filter(p => p && (p.encodeId || p.id) && (p.title || p.name))
                            .map(p => collectionToExploreItem(normalizeZingPlaylistItem(p, 'playlist')));

                        if (playlists.length > 0) {
                            sections.push({
                                id: rawSec.sectionId || `zing-playlist-${sections.length}`,
                                title: rawSec.title || 'Tuyển Tập Hay Nhất',
                                items: playlists.slice(0, 16),
                                changesWithRead: false,
                            });
                        }
                    }
                }

                // If home response returned meaningful sections, return it
                if (sections.length >= 2) {
                    return {
                        sections,
                        refreshReadsAnew: true,
                    };
                }
            }

            // Fallback strategy: getZingChartSongs, getZingTop100Albums, getZingRadioStations
            const [chartSongs, top100Data, radioStations] = await Promise.all([
                getZingChartSongs(30).catch(err => {
                    console.warn('[ZingExplore] Fallback: Failed to get chart songs:', err);
                    return [] as UnifiedSong[];
                }),
                getZingTop100Albums(40, 0).catch(err => {
                    console.warn('[ZingExplore] Fallback: Failed to get top 100 albums:', err);
                    return { items: [] };
                }),
                getZingRadioStations(15).catch(err => {
                    console.warn('[ZingExplore] Fallback: Failed to get radio stations:', err);
                    return [];
                }),
            ]);

            const fallbackSections: ProviderExploreSection[] = [];

            // 1. Lead Section: #zingchart Trending Hits
            if (chartSongs.length > 0) {
                const shuffledChart = [chartSongs[0], ...shuffleArray(chartSongs.slice(1))];
                fallbackSections.push({
                    id: ZING_CHART_SECTION_ID,
                    title: '#zingchart · Bảng Xếp Hạng Thịnh Hành',
                    items: shuffledChart.slice(0, 15).map(s => songToExploreItem(s)),
                    changesWithRead: true,
                });
            }

            // 2. Shelf: Top 100 Tuyển Chọn (Vietnamese & International albums/playlists)
            if (top100Data.items && top100Data.items.length > 0) {
                const randomizedTop100 = shuffleArray(top100Data.items);
                fallbackSections.push({
                    id: ZING_TOP100_SECTION_ID,
                    title: 'Top 100 Tuyển Chọn · Zing MP3',
                    items: randomizedTop100.slice(0, 16).map(collection => collectionToExploreItem(collection)),
                    changesWithRead: true,
                });
            }

            // 3. Shelf: Trực Tuyến & Radio Zing MP3
            if (radioStations.length > 0) {
                fallbackSections.push({
                    id: ZING_RADIO_SECTION_ID,
                    title: 'Radio & Phòng Nhạc Trực Tuyến',
                    items: radioStations.map(station => collectionToExploreItem(station)),
                });
            }

            return {
                sections: fallbackSections,
                refreshReadsAnew: true,
            };
        } catch (error) {
            console.error('[ZingExplore] Error assembling explore feed:', error);
            return {
                sections: [],
                refreshReadsAnew: true,
            };
        }
    },
};
