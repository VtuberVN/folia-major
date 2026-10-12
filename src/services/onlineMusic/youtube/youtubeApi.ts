// src/services/onlineMusic/youtube/youtubeApi.ts
// Native YouTube InnerTube client for Folia.
// No API key required, directly queries official YouTube InnerTube endpoint.

import type { UnifiedSong } from '../../../types';

export interface YouTubeSearchResult {
    items: UnifiedSong[];
    total: number;
    hasMore: boolean;
    nextOffset: number;
}

export interface YouTubeStreamInfo {
    url: string;
    expiresAt?: number;
    details?: {
        title?: string;
        author?: string;
        durationMs?: number;
        coverUrl?: string;
    };
}

export function extractVideoId(input?: string | null): string | null {
    if (!input || typeof input !== 'string') return null;
    const str = input.trim();
    const urlMatch = str.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^"&?\/\s]{11})/i);
    if (urlMatch) return urlMatch[1];
    const prefixMatch = str.match(/(?:^|[:#\/])([a-zA-Z0-9_-]{11})(?:[#?&/]|$)/);
    if (prefixMatch) return prefixMatch[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    return null;
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
        if (res?.ok && typeof res.text === 'function') {
            const html = await res.text();
            const match = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
            if (match && match[1]) {
                cachedApiKey = match[1];
                return cachedApiKey;
            }
        }
    } catch (err) {
        console.warn('[YouTubeApi] Failed to extract API key:', err);
    }
    return DEFAULT_INNERTUBE_KEY;
}

export async function getVideoInfo(videoId: string): Promise<UnifiedSong | null> {
    const vid = extractVideoId(videoId) || videoId;
    if (!vid) return null;
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
            videoId: vid,
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
        const details = data.videoDetails;
        if (!details) return null;

        const durationSec = parseInt(details.lengthSeconds || '0', 10);
        const thumb = details.thumbnail?.thumbnails?.slice(-1)[0]?.url
            || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

        return {
            id: vid,
            name: details.title || 'YouTube Track',
            artists: [{ id: 0, name: details.author || 'YouTube Artist' }],
            album: { id: 0, name: 'YouTube', coverUrl: thumb },
            durationMs: durationSec > 0 ? durationSec * 1000 : 0,
            sourceRef: {
                kind: 'online',
                providerId: 'youtube',
                mediaId: vid,
            },
        };
    } catch (err) {
        console.warn('[YouTubeApi] getVideoInfo error:', err);
        return null;
    }
}

/**
 * Searches songs on YouTube Music with fallback to YouTube Android search.
 */
export async function searchYouTubeMusic(query: string, limit: number = 30, offset: number = 0): Promise<YouTubeSearchResult> {
    const trimmed = query.trim();
    if (!trimmed) {
        return { items: [], total: 0, hasMore: false, nextOffset: 0 };
    }

    // Direct link or video ID lookup
    const directVideoId = extractVideoId(trimmed);
    if (directVideoId && (directVideoId === trimmed || trimmed.includes('youtube.') || trimmed.includes('youtu.be'))) {
        const directSong = await getVideoInfo(directVideoId);
        if (directSong) {
            return { items: [directSong], total: 1, hasMore: false, nextOffset: 1 };
        }
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

        const items: UnifiedSong[] = [];

        if (res.ok) {
            const data = await res.json();
            const contents = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

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
                    
                    const artistName = runTexts[0] || 'YouTube';
                    const albumName = runTexts[1] || 'YouTube';
                    const durationText = runTexts[runTexts.length - 1];
                    const durationMs = parseDurationToMs(durationText);

                    const playNav = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
                    const videoId = playNav?.watchEndpoint?.videoId || renderer.playlistItemData?.videoId;
                    const coverUrl = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;

                    if (title && videoId && !items.find(x => x.id === videoId)) {
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
        }

        // Fallback to standard YouTube Android search if YouTube Music returns nothing
        if (items.length === 0) {
            const apiKey = await getApiKey();
            const fallbackRes = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 12; GB)',
                },
                body: JSON.stringify({
                    context: {
                        client: {
                            clientName: 'ANDROID',
                            clientVersion: '20.10.38',
                            hl: 'vi',
                            gl: 'VN',
                        },
                    },
                    query: trimmed,
                }),
            });

            if (fallbackRes.ok) {
                const fallbackData = await fallbackRes.json();
                const walk = (node: any) => {
                    if (!node || typeof node !== 'object') return;
                    const r = node.compactVideoRenderer || node.videoRenderer;
                    if (r && r.videoId) {
                        const vid = r.videoId;
                        const vTitle = r.title?.runs?.map((x: any) => x.text).join('') || r.title?.simpleText || 'YouTube Track';
                        const vArtist = r.shortBylineText?.runs?.map((x: any) => x.text).join('')
                            || r.bylineText?.runs?.map((x: any) => x.text).join('')
                            || 'YouTube Artist';
                        const vThumb = r.thumbnail?.thumbnails?.slice(-1)[0]?.url
                            || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
                        const vDur = parseDurationToMs(r.lengthText?.runs?.[0]?.text || r.lengthText?.simpleText);

                        if (!items.find(x => x.id === vid)) {
                            items.push({
                                id: vid,
                                name: vTitle,
                                artists: [{ id: 0, name: vArtist }],
                                album: { id: 0, name: 'YouTube', coverUrl: vThumb },
                                durationMs: vDur,
                                sourceRef: {
                                    kind: 'online',
                                    providerId: 'youtube',
                                    mediaId: vid,
                                },
                            });
                        }
                    }
                    for (const key of Object.keys(node)) {
                        walk(node[key]);
                    }
                };
                walk(fallbackData);
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

/**
 * Resolves a direct audio stream URL for a YouTube video.
 * Prioritizes Progressive format (ITAG 18: 360p MP4) because it can be natively decoded
 * by HTML5 <audio> without SABR chunking and is not blocked with 403 Forbidden by Google Video CDN.
 */
export async function getYouTubeAudioStream(videoId: string): Promise<YouTubeStreamInfo | null> {
    try {
        const vid = extractVideoId(videoId) || videoId;
        if (!vid) return null;

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
            videoId: vid,
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
        const formats = data.streamingData?.formats || [];
        
        // 1. Ưu tiên Progressive format (ITAG 18: 360p MP4) - định dạng duy nhất giải mã trực tiếp ổn định không bị 403 CDN
        const progressive = formats.find((f: any) => f.itag === 18 && f.url) || formats.find((f: any) => f.url);
        // 2. Dự phòng sang adaptive format nếu không có progressive
        const chosenFormat = progressive || (data.streamingData?.adaptiveFormats || []).find((f: any) => f.url);
        if (!chosenFormat) return null;

        const rawUrl = chosenFormat.url;
        const streamUrl = (typeof window !== 'undefined' && !(window as any).electron)
            ? `/api/lyric-proxy?url=${encodeURIComponent(rawUrl)}`
            : rawUrl;

        const details = data.videoDetails ? {
            title: data.videoDetails.title || 'YouTube Track',
            author: data.videoDetails.author || 'YouTube Artist',
            durationMs: parseInt(data.videoDetails.lengthSeconds || '0', 10) * 1000,
            coverUrl: data.videoDetails.thumbnail?.thumbnails?.slice(-1)[0]?.url,
        } : undefined;

        return {
            url: streamUrl,
            expiresAt: Date.now() + 5 * 3600 * 1000,
            details,
        };
    } catch (err) {
        console.warn('[YouTubeApi] getYouTubeAudioStream error:', err);
        return null;
    }
}

