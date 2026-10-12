// src/services/onlineMusic/youtube/youtubeApi.ts
// Native YouTube InnerTube client for Folia.
// No API key required, directly queries official YouTube InnerTube endpoint.

import type { UnifiedSong } from '../../../types';
import type { ProviderCollection } from '../../../types/onlineMusic';

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

export function extractPlaylistId(input?: string | null): string | null {
    if (!input || typeof input !== 'string') return null;
    const str = input.trim();
    const match = str.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    if (match) return match[1];
    if (/^(?:PL|RD|OLAK5uy|VL)[a-zA-Z0-9_-]+$/i.test(str)) {
        return str.startsWith('VL') ? str.slice(2) : str;
    }
    return null;
}

const YOUTUBE_COOKIE_STORAGE_KEY = 'folia_youtube_cookie';
let inMemoryYouTubeCookie: string | null = null;
let youtubeWriteVersion = 0;

export function getStoredYouTubeCookie(): string {
    if (inMemoryYouTubeCookie !== null) return inMemoryYouTubeCookie;
    if (typeof localStorage === 'undefined') return '';
    const raw = localStorage.getItem(YOUTUBE_COOKIE_STORAGE_KEY) || '';
    if (raw.startsWith('enc:')) {
        if (typeof window !== 'undefined' && window.electron?.safeStorageDecryptSync) {
            try {
                const decrypted = window.electron.safeStorageDecryptSync(raw.slice(4));
                if (decrypted) {
                    inMemoryYouTubeCookie = decrypted;
                    return decrypted;
                }
            } catch {
                // decrypt failed
            }
        }
        // Ciphertext not decryptable — treat as no cookie, don't leak ciphertext
        inMemoryYouTubeCookie = '';
        return '';
    }
    inMemoryYouTubeCookie = raw;
    return raw;
}

export function setStoredYouTubeCookie(cookie: string): void {
    const trimmed = cookie.trim();
    inMemoryYouTubeCookie = trimmed || null;
    const writeId = ++youtubeWriteVersion;
    if (typeof localStorage === 'undefined') return;
    if (!trimmed) {
        localStorage.removeItem(YOUTUBE_COOKIE_STORAGE_KEY);
    } else {
        if (typeof window !== 'undefined' && window.electron?.safeStorageEncrypt) {
            void window.electron.safeStorageEncrypt(trimmed).then(encrypted => {
                if (writeId !== youtubeWriteVersion) return; // superseded by newer write or logout
                if (encrypted) {
                    localStorage.setItem(YOUTUBE_COOKIE_STORAGE_KEY, `enc:${encrypted}`);
                } else {
                    localStorage.setItem(YOUTUBE_COOKIE_STORAGE_KEY, trimmed);
                }
            }).catch(() => {
                if (writeId !== youtubeWriteVersion) return;
                localStorage.setItem(YOUTUBE_COOKIE_STORAGE_KEY, trimmed);
            });
        } else {
            localStorage.setItem(YOUTUBE_COOKIE_STORAGE_KEY, trimmed);
        }
    }
}

const YOUTUBE_PROFILE_STORAGE_KEY = 'folia_youtube_profile';

export interface YouTubeUserProfile {
    id: string;
    nickname: string;
    avatarUrl?: string;
    vipType?: number;
}

export function getStoredYouTubeProfile(): YouTubeUserProfile | null {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(YOUTUBE_PROFILE_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function setStoredYouTubeProfile(profile: YouTubeUserProfile | null): void {
    if (typeof localStorage === 'undefined') return;
    if (!profile) {
        localStorage.removeItem(YOUTUBE_PROFILE_STORAGE_KEY);
    } else {
        localStorage.setItem(YOUTUBE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    }
}

export function clearStoredYouTubeProfile(): void {
    setStoredYouTubeProfile(null);
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
    if (directVideoId && (directVideoId === trimmed || trimmed.includes('youtube.') || trimmed.includes('youtu.be')) && !trimmed.includes('list=')) {
        const directSong = await getVideoInfo(directVideoId);
        if (directSong) {
            return { items: [directSong], total: 1, hasMore: false, nextOffset: 1 };
        }
    }

    // Direct playlist link or playlist ID lookup
    const directPlaylistId = extractPlaylistId(trimmed);
    if (directPlaylistId && (trimmed.includes('list=') || trimmed.startsWith('PL') || trimmed.startsWith('RD') || trimmed.startsWith('VL'))) {
        const pl = await getYouTubePlaylist(directPlaylistId);
        if (pl && pl.items.length > 0) {
            return {
                items: pl.items.slice(offset, offset + limit),
                total: pl.items.length,
                hasMore: offset + limit < pl.items.length,
                nextOffset: offset + limit,
            };
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

export interface YouTubePlaylistResult {
    id: string;
    name: string;
    coverUrl?: string;
    description?: string;
    trackCount: number;
    items: UnifiedSong[];
}

function extractSapisid(cookie: string): string | null {
    const match = cookie.match(/(?:^|;\s*)(?:__Secure-3PAPISID|SAPISID)=([^;]+)/);
    return match ? match[1].trim() : null;
}

async function getSapisidHash(sapisid: string, origin: string = 'https://music.youtube.com'): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const text = `${timestamp} ${sapisid} ${origin}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuf = await crypto.subtle.digest('SHA-1', data);
    const hash = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return `SAPISIDHASH ${timestamp}_${hash}`;
}

export async function getYouTubePlaylist(playlistIdInput: string): Promise<YouTubePlaylistResult | null> {
    const playlistId = extractPlaylistId(playlistIdInput) || playlistIdInput;
    if (!playlistId) return null;

    const cleanId = playlistId.replace(/^VL/, '');
    const browseId = `VL${cleanId}`;
    const cookie = getStoredYouTubeCookie();

    // 1. Try YouTube Music client (WEB_REMIX)
    try {
        const apiKey = await getApiKey();
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://music.youtube.com/',
            'Origin': 'https://music.youtube.com',
        };
        if (cookie) {
            headers['Cookie'] = cookie;
            const sapisid = extractSapisid(cookie);
            if (sapisid) {
                headers['Authorization'] = await getSapisidHash(sapisid);
                headers['X-Origin'] = 'https://music.youtube.com';
            }
        }

        const res = await fetch(`https://music.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'WEB_REMIX',
                        clientVersion: '1.20240101.01.00',
                        hl: 'vi',
                        gl: 'VN',
                    },
                },
                browseId,
            }),
            signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
            const data = await res.json();
            const secondaryContents = data.contents?.twoColumnBrowseResultsRenderer?.secondaryContents;
            const tabContent = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
                || data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content;
            const firstSec = secondaryContents?.sectionListRenderer?.contents?.[0]
                || tabContent?.sectionListRenderer?.contents?.[0];
            const shelf = firstSec?.musicPlaylistShelfRenderer || firstSec?.musicShelfRenderer;
            const rawItems = shelf?.contents || [];

            const respHeader = tabContent?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer
                || data.header?.musicResponsiveHeaderRenderer
                || data.header?.musicDetailHeaderRenderer;
            const playlistName = respHeader?.title?.runs?.[0]?.text
                || respHeader?.title?.simpleText
                || 'YouTube Playlist';
            const playlistDescription = respHeader?.description?.runs?.[0]?.text
                || respHeader?.description?.simpleText
                || '';
            const coverUrl = respHeader?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;

            if (rawItems.length > 0) {
                const items: UnifiedSong[] = [];
                for (const raw of rawItems) {
                    const v = raw.musicResponsiveListItemRenderer;
                    if (!v) continue;
                    const videoId = v.playlistItemData?.videoId
                        || v.menu?.menuRenderer?.topLevelButtons?.[0]?.likeButtonRenderer?.target?.videoId
                        || v.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
                    if (!videoId) continue;

                    const title = v.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'YouTube Track';
                    const artist = v.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'YouTube Artist';
                    const durationText = v.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text;
                    const thumb = v.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url
                        || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                    items.push({
                        id: `youtube:${videoId}`,
                        name: title,
                        artists: [{ id: 0, name: artist }],
                        album: { id: 0, name: playlistName, coverUrl: thumb },
                        durationMs: parseDurationToMs(durationText),
                        sourceRef: { kind: 'online', providerId: 'youtube', mediaId: videoId },
                    });
                }

                // Continuation pagination for large playlists (>100 tracks)
                let continuationToken = shelf?.continuations?.[0]?.nextContinuationData?.continuation
                    || rawItems[rawItems.length - 1]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
                let contPages = 0;
                while (continuationToken && contPages < 4 && items.length < 500) {
                    contPages++;
                    try {
                        const contRes = await fetch(`https://music.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                                context: {
                                    client: {
                                        clientName: 'WEB_REMIX',
                                        clientVersion: '1.20240101.01.00',
                                        hl: 'vi',
                                        gl: 'VN',
                                    },
                                },
                                continuation: continuationToken,
                            }),
                            signal: AbortSignal.timeout(8000),
                        });
                        if (!contRes.ok) break;
                        const contData = await contRes.json();
                        const nextItems = contData.continuationContents?.musicPlaylistShelfContinuation?.contents
                            || contData.continuationContents?.musicShelfContinuation?.contents
                            || [];
                        if (!nextItems.length) break;
                        for (const raw of nextItems) {
                            const v = raw.musicResponsiveListItemRenderer;
                            if (!v) continue;
                            const videoId = v.playlistItemData?.videoId
                                || v.menu?.menuRenderer?.topLevelButtons?.[0]?.likeButtonRenderer?.target?.videoId
                                || v.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
                            if (!videoId) continue;
                            const title = v.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'YouTube Track';
                            const artist = v.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'YouTube Artist';
                            const durationText = v.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text;
                            const thumb = v.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url
                                || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                            items.push({
                                id: `youtube:${videoId}`,
                                name: title,
                                artists: [{ id: 0, name: artist }],
                                album: { id: 0, name: playlistName, coverUrl: thumb },
                                durationMs: parseDurationToMs(durationText),
                                sourceRef: { kind: 'online', providerId: 'youtube', mediaId: videoId },
                            });
                        }
                        continuationToken = contData.continuationContents?.musicPlaylistShelfContinuation?.continuations?.[0]?.nextContinuationData?.continuation
                            || nextItems[nextItems.length - 1]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
                    } catch {
                        break;
                    }
                }

                if (items.length > 0) {
                    return {
                        id: cleanId,
                        name: playlistName,
                        coverUrl,
                        description: playlistDescription,
                        trackCount: items.length,
                        items,
                    };
                }
            }
        }
    } catch (err) {
        console.warn('[YouTubeApi] WEB_REMIX browse error:', err);
    }

    // 2. Fallback to desktop YouTube WEB client
    try {
        const apiKey = await getApiKey();
        const res = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: '2.20240101.00.00',
                        hl: 'vi',
                        gl: 'VN',
                    },
                },
                browseId,
            }),
            signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
            const data = await res.json();
            const sidebarTitle = data.sidebar?.playlistSidebarRenderer?.items?.[0]?.playlistSidebarPrimaryInfoRenderer?.title?.runs?.[0]?.text;
            const headerTitle = data.header?.playlistHeaderRenderer?.title?.simpleText || data.header?.playlistHeaderRenderer?.title?.runs?.[0]?.text;
            const playlistName = sidebarTitle || headerTitle || 'YouTube Playlist';

            const sidebarThumb = data.sidebar?.playlistSidebarRenderer?.items?.[0]?.playlistSidebarPrimaryInfoRenderer?.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
            const headerThumb = data.header?.playlistHeaderRenderer?.playlistHeaderBanner?.heroPlaylistThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;
            const coverUrl = sidebarThumb || headerThumb;

            const section = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
            const rawVideos = section?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents || [];

            const items: UnifiedSong[] = [];
            for (const raw of rawVideos) {
                const v = raw?.playlistVideoRenderer;
                if (!v || !v.videoId) continue;

                const title = v.title?.runs?.[0]?.text || v.title?.simpleText || 'YouTube Track';
                const artist = v.shortBylineText?.runs?.[0]?.text || 'YouTube Artist';
                const durationMs = (parseInt(v.lengthSeconds || '0', 10) || 0) * 1000;
                const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

                items.push({
                    id: `youtube:${v.videoId}`,
                    name: title,
                    artists: [{ id: 0, name: artist }],
                    album: { id: 0, name: playlistName, coverUrl: thumb },
                    durationMs,
                    sourceRef: { kind: 'online', providerId: 'youtube', mediaId: v.videoId },
                });
            }

            // Continuation for desktop WEB
            let webContinuation = rawVideos[rawVideos.length - 1]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
            let webPages = 0;
            while (webContinuation && webPages < 4 && items.length < 500) {
                webPages++;
                try {
                    const contRes = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                            'Referer': 'https://www.youtube.com/',
                        },
                        body: JSON.stringify({
                            context: {
                                client: {
                                    clientName: 'WEB',
                                    clientVersion: '2.20240101.00.00',
                                    hl: 'vi',
                                    gl: 'VN',
                                },
                            },
                            continuation: webContinuation,
                        }),
                        signal: AbortSignal.timeout(8000),
                    });
                    if (!contRes.ok) break;
                    const contData = await contRes.json();
                    const nextVideos = contData.continuationContents?.playlistVideoListContinuation?.contents || [];
                    if (!nextVideos.length) break;
                    for (const raw of nextVideos) {
                        const v = raw?.playlistVideoRenderer;
                        if (!v || !v.videoId) continue;
                        const title = v.title?.runs?.[0]?.text || v.title?.simpleText || 'YouTube Track';
                        const artist = v.shortBylineText?.runs?.[0]?.text || 'YouTube Artist';
                        const durationMs = (parseInt(v.lengthSeconds || '0', 10) || 0) * 1000;
                        const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
                        items.push({
                            id: `youtube:${v.videoId}`,
                            name: title,
                            artists: [{ id: 0, name: artist }],
                            album: { id: 0, name: playlistName, coverUrl: thumb },
                            durationMs,
                            sourceRef: { kind: 'online', providerId: 'youtube', mediaId: v.videoId },
                        });
                    }
                    webContinuation = contData.continuationContents?.playlistVideoListContinuation?.continuations?.[0]?.nextContinuationData?.continuation
                        || nextVideos[nextVideos.length - 1]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
                } catch {
                    break;
                }
            }

            const fallbackDescription = data.sidebar?.playlistSidebarRenderer?.items?.[0]?.playlistSidebarPrimaryInfoRenderer?.description?.runs?.[0]?.text
                || data.header?.playlistHeaderRenderer?.description?.simpleText
                || '';
            return {
                id: cleanId,
                name: playlistName,
                coverUrl,
                description: fallbackDescription,
                trackCount: items.length,
                items,
            };
        }
    } catch (err) {
        console.warn('[YouTubeApi] WEB fallback browse error:', err);
    }

    return null;
}

export async function getYouTubeTrendingSongs(limit = 30): Promise<UnifiedSong[]> {
    try {
        const apiKey = await getApiKey();
        const res = await fetch(`https://music.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://music.youtube.com/',
                'Origin': 'https://music.youtube.com',
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'WEB_REMIX',
                        clientVersion: '1.20240101.01.00',
                        hl: 'vi',
                        gl: 'VN',
                    },
                },
                browseId: 'FEmusic_charts',
            }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`Charts browse failed: ${res.status}`);
        const data = await res.json();

        // Extract song items from chart sections
        const sections = data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        const songs: UnifiedSong[] = [];
        for (const section of sections) {
            const items = section?.musicShelfRenderer?.contents
                || section?.musicCarouselShelfRenderer?.contents
                || [];
            for (const item of items) {
                const renderer = item?.musicResponsiveListItemRenderer;
                if (!renderer) continue;
                const videoId = renderer.playlistItemData?.videoId
                    || renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
                if (!videoId) continue;
                const title = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'YouTube Track';
                const artist = renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'YouTube Artist';
                const thumb = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url
                    || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                songs.push({
                    id: `youtube:${videoId}`,
                    name: title,
                    artists: [{ id: 0, name: artist }],
                    album: { id: 0, name: 'YouTube Charts', coverUrl: thumb },
                    durationMs: 0,
                    sourceRef: { kind: 'online', providerId: 'youtube', mediaId: videoId },
                });
                if (songs.length >= limit) break;
            }
            if (songs.length >= limit) break;
        }
        if (songs.length > 0) return songs;
    } catch {
        // fallback to search
    }
    // Fallback: search for trending (language-neutral keyword)
    try {
        const res = await searchYouTubeMusic('trending', limit, 0);
        return res?.items || [];
    } catch {
        return [];
    }
}

export async function getUserYouTubePlaylists(limit = 50, offset = 0): Promise<{ items: ProviderCollection[]; total: number; hasMore: boolean; nextOffset: number }> {
    const cookie = getStoredYouTubeCookie();
    try {
        const apiKey = await getApiKey();
        const sapisid = cookie ? extractSapisid(cookie) : null;
        const authHeader = sapisid ? await getSapisidHash(sapisid) : null;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': 'https://music.youtube.com/',
            'Origin': 'https://music.youtube.com',
        };
        if (cookie) {
            headers['Cookie'] = cookie;
        }
        if (authHeader) {
            headers['Authorization'] = authHeader;
            headers['X-Origin'] = 'https://music.youtube.com';
        }

        const fetchBrowse = async (targetBrowseId: string) => {
            const res = await fetch(`https://music.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    context: {
                        client: {
                            clientName: 'WEB_REMIX',
                            clientVersion: '1.20240101.01.00',
                            hl: 'vi',
                            gl: 'VN',
                        },
                    },
                    browseId: targetBrowseId,
                }),
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) return [];
            const data = await res.json();
            const collected: ProviderCollection[] = [];
            const rawSections = data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents
                || data.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents
                || [];
            for (const sec of rawSections) {
                const gridItems = sec?.gridRenderer?.items
                    || sec?.musicShelfRenderer?.contents
                    || sec?.musicCarouselShelfRenderer?.contents
                    || [];
                for (const g of gridItems) {
                    const renderer = g?.musicTwoRowItemRenderer || g?.gridPlaylistRenderer;
                    if (!renderer) continue;
                    const title = renderer.title?.runs?.[0]?.text || renderer.title?.simpleText;
                    const nav = renderer.navigationEndpoint?.browseEndpoint;
                    const plId = nav?.browseId?.replace(/^VL/, '') || renderer.playlistId;
                    if (!title || !plId) continue;
                    const thumb = renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url
                        || renderer.thumbnail?.thumbnails?.slice(-1)[0]?.url;
                    collected.push({
                        providerId: 'youtube',
                        id: String(plId),
                        name: String(title),
                        type: 'playlist',
                        coverUrl: thumb,
                        description: renderer.subtitle?.runs?.[0]?.text || '',
                        trackCount: 0,
                        isOwned: Boolean(cookie && targetBrowseId !== 'FEmusic_charts'),
                    });
                }
            }
            return collected;
        };

        const playlists: ProviderCollection[] = [];
        if (cookie) {
            // When user is authenticated, add Liked Music playlist
            playlists.push({
                providerId: 'youtube',
                id: 'LM',
                name: 'Liked Music',
                type: 'playlist',
                coverUrl: 'https://www.gstatic.com/youtube/media/ytm/images/pbg/liked-music-@1200.png',
                description: '',
                trackCount: 100,
                isOwned: true,
                isLiked: true,
            });

            const likedPlaylists = await fetchBrowse('FEmusic_liked_playlists');
            for (const p of likedPlaylists) {
                if (!playlists.some(x => x.id === p.id)) {
                    playlists.push(p);
                }
            }

            if (playlists.length <= 1) {
                const libraryPlaylists = await fetchBrowse('FEmusic_library_landing');
                for (const p of libraryPlaylists) {
                    if (!playlists.some(x => x.id === p.id)) {
                        playlists.push(p);
                    }
                }
            }
        }

        // If no user playlists or guest mode, load charts
        if (playlists.length === 0) {
            const chartPlaylists = await fetchBrowse('FEmusic_charts');
            playlists.push(...chartPlaylists);
        }

        const sliced = playlists.slice(offset, offset + limit);
        return {
            items: sliced,
            total: playlists.length,
            hasMore: offset + limit < playlists.length,
            nextOffset: offset + sliced.length,
        };
    } catch (err) {
        console.warn('[YouTubeApi] getUserYouTubePlaylists error:', err);
        return { items: [], total: 0, hasMore: false, nextOffset: offset };
    }
}


