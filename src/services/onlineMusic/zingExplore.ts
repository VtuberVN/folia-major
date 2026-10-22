// src/services/onlineMusic/zingExplore.ts
// Explore adapter for Zing MP3 in Folia Major.
// Provides curated sections:
//  1. #zingchart trending hits (Lead section)
//  2. Top 100 collections (Vietnam & International playlists)
//  3. Live Radio & Featured stations
// Supports "Refresh / Đổi lượt khác" with randomized seeds and caching.

import type { UnifiedSong } from '../../types';
import type {
    OnlineExploreProvider,
    ProviderExploreItem,
    ProviderExplorePage,
    ProviderExploreSection,
} from '../../types/onlineMusic';
import {
    getZingChartSongs,
    getZingRadioStations,
    getZingTop100Albums,
} from './zingApi';

const ZING_CHART_SECTION_ID = 'zing-chart-section';
const ZING_TOP100_SECTION_ID = 'zing-top100-section';
const ZING_RADIO_SECTION_ID = 'zing-radio-section';

function songToExploreItem(song: UnifiedSong): ProviderExploreItem {
    return {
        kind: 'song',
        song,
        subtitle: song.artists?.map((a: { name: string }) => a.name).join(', ') || 'Zing MP3',
    };
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
            const [chartSongs, top100Data, radioStations] = await Promise.all([
                getZingChartSongs(30).catch(err => {
                    console.warn('[ZingExplore] Failed to get chart songs:', err);
                    return [] as UnifiedSong[];
                }),
                getZingTop100Albums(40, 0).catch(err => {
                    console.warn('[ZingExplore] Failed to get top 100 albums:', err);
                    return { items: [] };
                }),
                getZingRadioStations(15).catch(err => {
                    console.warn('[ZingExplore] Failed to get radio stations:', err);
                    return [];
                }),
            ]);

            const sections: ProviderExploreSection[] = [];

            // 1. Lead Section: #zingchart Trending Hits
            if (chartSongs.length > 0) {
                // Shuffle slightly to give variety when refreshed
                const shuffledChart = [chartSongs[0], ...shuffleArray(chartSongs.slice(1))];
                sections.push({
                    id: ZING_CHART_SECTION_ID,
                    title: '#zingchart · Bảng Xếp Hạng Thịnh Hành',
                    items: shuffledChart.slice(0, 15).map(songToExploreItem),
                    changesWithRead: true,
                });
            }

            // 2. Shelf: Top 100 Tuyển Chọn (Vietnamese & International albums/playlists)
            if (top100Data.items && top100Data.items.length > 0) {
                const randomizedTop100 = shuffleArray(top100Data.items);
                sections.push({
                    id: ZING_TOP100_SECTION_ID,
                    title: 'Top 100 Tuyển Chọn · Zing MP3',
                    items: randomizedTop100.slice(0, 16).map(collection => ({
                        kind: 'collection',
                        collection,
                        subtitle: collection.description || collection.name,
                    })),
                    changesWithRead: true,
                });
            }

            // 3. Shelf: Trực Tuyến & Radio Zing MP3
            if (radioStations.length > 0) {
                sections.push({
                    id: ZING_RADIO_SECTION_ID,
                    title: 'Radio & Phòng Nhạc Trực Tuyến',
                    items: radioStations.map(station => ({
                        kind: 'collection',
                        collection: station,
                        subtitle: station.description || 'Zing Radio',
                    })),
                });
            }

            return {
                sections,
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
