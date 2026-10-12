// src/services/onlineMusic/youtube/youtubeApi.ts
// Native YouTube Music InnerTube Web client for Folia.
// No API key required, directly queries official YouTube Music InnerTube endpoint.

import type { UnifiedSong } from '../../../types';

export interface YouTubeSearchResult {
    items: UnifiedSong[];
    total: number;
    hasMore: boolean;
    nextOffset: number;
}

function parseDurationToMs(text?: string): number {
    if (!text) return 0;
    const parts = text.trim().split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 2) {
        return (parts[0] * 60 + parts[1]) * 1000;
    }
    if (parts.length === 3) {
        return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }
    return 0;
}

/**
 * Searches songs on YouTube Music using the official InnerTube WEB_REMIX API.
 */
export async function searchYouTubeMusic(query: string, limit: number = 30, offset: number = 0): Promise<YouTubeSearchResult> {
    const trimmed = query.trim();
    if (!trimmed) {
        return { items: [], total: 0, hasMore: false, nextOffset: 0 };
    }

    try {
        const payload = {
            context: {
                client: {
                    clientName: 'WEB_REMIX',
                    clientVersion: '1.20240101.01.00',
                },
            },
            query: trimmed,
            params: 'EgWKAQIIAWoQEAQQAxAFEAoQCRAREBAQFQ%3D%3D', // Songs filter
        };

        const res = await fetch('https://music.youtube.com/youtubei/v1/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            console.warn('[YouTubeApi] Search request failed:', res.status);
            return { items: [], total: 0, hasMore: false, nextOffset: 0 };
        }

        const data = await res.json();
        const contents = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        const items: UnifiedSong[] = [];

        for (const section of contents) {
            const list = section.musicShelfRenderer?.contents
                || section.itemSectionRenderer?.contents
                || (section.musicCardShelfRenderer ? [section.musicCardShelfRenderer] : []);

            for (const item of list) {
                const renderer = item.musicResponsiveListItemRenderer;
                if (!renderer) continue;

                const flexCols = renderer.flexColumns || [];
                const titleRun = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0];
                const title = titleRun?.text;

                const col2Runs = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                const runTexts = col2Runs.map((r: any) => r.text).filter((t: string) => t !== ' • ' && t !== ' & ');
                
                // First non-delimiter run in column 2 is typically the artist, or fallback to type
                const artistName = runTexts[0] || 'YouTube';
                const albumName = runTexts[1] || 'YouTube';
                const durationText = runTexts[runTexts.length - 1];
                const durationMs = parseDurationToMs(durationText);

                const playNav = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
                const videoId = playNav?.watchEndpoint?.videoId || renderer.playlistItemData?.videoId;
                const coverUrl = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;

                if (title && videoId) {
                    items.push({
                        id: videoId,
                        name: title,
                        artists: [{ id: 0, name: artistName }],
                        album: { id: 0, name: albumName, coverUrl },
                        durationMs,
                        sourceRef: {
                            kind: 'online',
                            providerId: 'youtube',
                            mediaId: videoId,
                        },
                    });
                }
            }
        }

        const sliced = items.slice(offset, offset + limit);
        return {
            items: sliced,
            total: items.length,
            hasMore: offset + limit < items.length,
            nextOffset: offset + sliced.length,
        };
    } catch (err) {
        console.warn('[YouTubeApi] Search error:', err);
        return { items: [], total: 0, hasMore: false, nextOffset: 0 };
    }
}

let cachedApiKey = '';

const DEFAULT_INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4usbuLznTmPcwjzp4-Ns4';

async function getApiKey(): Promise<string> {
    if (cachedApiKey) return cachedApiKey;
    try {
        const res = await fetch('https://www.youtube.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
        });
        const html = await res.text();
        const match = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
        if (match && match[1]) {
            cachedApiKey = match[1];
            return cachedApiKey;
        }
    } catch (err) {
        console.warn('[YouTubeApi] Failed to extract API key:', err);
    }
    return DEFAULT_INNERTUBE_KEY;
}

export async function getYouTubeAudioStream(videoId: string): Promise<{ url: string; expiresAt?: number } | null> {
    try {
        const apiKey = await getApiKey();
        const endpoint = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
        const body = {
            context: {
                client: {
                    clientName: 'ANDROID',
                    clientVersion: '20.10.38',
                    androidSdkVersion: 31,
                    hl: 'vi',
                    gl: 'VN',
                },
            },
            videoId,
        };

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 12; GB)',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) return null;
        const data = await res.json();
        const formats = [...(data.streamingData?.formats || []), ...(data.streamingData?.adaptiveFormats || [])];
        const audioFormats = formats.filter(f => f.mimeType && f.mimeType.startsWith('audio/') && f.url);
        if (audioFormats.length === 0) return null;

        audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const bestAudio = audioFormats[0];
        const streamUrl = (typeof window !== 'undefined' && !(window as any).electron)
            ? `/api/lyric-proxy?url=${encodeURIComponent(bestAudio.url)}`
            : bestAudio.url;

        return {
            url: streamUrl,
            expiresAt: Date.now() + 5 * 3600 * 1000,
        };
    } catch (err) {
        console.warn('[YouTubeApi] getYouTubeAudioStream error:', err);
        return null;
    }
}
