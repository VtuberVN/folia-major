// src/services/onlineMusic/zingApi.ts
// Zing MP3 API client with HMAC-SHA512 signing, audio stream retrieval, lyrics, and cookie management.

import type { LyricData, UnifiedSong } from '../../types';
import type { AudioQualityPreference, ProviderCollection, ProviderPage, ProviderUser } from '../../types/onlineMusic';
import { parseLRC } from '../../utils/lyrics/parserCore';

const ZING_API_KEY = '88265e23d4284f25963e6eedac8fbfa3';
const ZING_SECRET_KEY = '2aa2d1c561e809b267f3638c4a307aab';
const ZING_VERSION = '1.6.34';
const ZING_BASE_URL = 'https://zingmp3.vn';
const ZING_SUGGEST_URL = 'https://ac.zingmp3.vn/v1/web/ac-suggestions';

export const ZING_COOKIE_STORAGE_KEY = 'folia_zing_cookie';
export const ZING_PROFILE_STORAGE_KEY = 'folia_zing_profile';

let cachedSessionCookie = '';
let cookieExpiryTime = 0;

/**
 * Calculates SHA256 digest in hex using Web Crypto API.
 */
async function getHash256(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Calculates HMAC-SHA512 in hex using Web Crypto API.
 */
async function getHmac512(str: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(str));
    return Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Generates HMAC-SHA512 signature for Zing MP3 API path and parameters.
 */
export async function getZingSignature(path: string, id: string, ctime: string): Promise<string> {
    const hashParams = id ? `ctime=${ctime}id=${id}version=${ZING_VERSION}` : `ctime=${ctime}version=${ZING_VERSION}`;
    const sha256 = await getHash256(hashParams);
    return getHmac512(`${path}${sha256}`, ZING_SECRET_KEY);
}

let inMemoryCookie = '';
let inMemoryProfile: ProviderUser | null = null;

/**
 * Retrieves the user profile if stored in localStorage.
 */
export function getStoredZingProfile(): ProviderUser | null {
    if (typeof localStorage === 'undefined') return inMemoryProfile;
    try {
        const raw = localStorage.getItem(ZING_PROFILE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : inMemoryProfile;
    } catch {
        return inMemoryProfile;
    }
}

/**
 * Stores the user profile in localStorage.
 */
export function setStoredZingProfile(profile: ProviderUser | null): void {
    inMemoryProfile = profile;
    if (typeof localStorage === 'undefined') return;
    if (profile) {
        localStorage.setItem(ZING_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } else {
        localStorage.removeItem(ZING_PROFILE_STORAGE_KEY);
    }
}

/**
 * Retrieves the user-provided Zing MP3 cookie if stored in localStorage.
 */
export function getStoredZingCookie(): string {
    if (typeof localStorage === 'undefined') return inMemoryCookie;
    return localStorage.getItem(ZING_COOKIE_STORAGE_KEY) || inMemoryCookie;
}

/**
 * Stores a user-provided Zing MP3 cookie in localStorage.
 */
export function setStoredZingCookie(cookie: string): void {
    inMemoryCookie = cookie.trim();
    if (typeof localStorage === 'undefined') return;
    if (cookie.trim()) {
        localStorage.setItem(ZING_COOKIE_STORAGE_KEY, cookie.trim());
    } else {
        localStorage.removeItem(ZING_COOKIE_STORAGE_KEY);
        setStoredZingProfile(null);
    }
}

/**
 * Obtains a valid cookie for Zing MP3 requests, prioritizing user VIP cookie.
 */
async function resolveCookie(): Promise<string> {
    const userCookie = getStoredZingCookie();
    const now = Date.now();

    if (!cachedSessionCookie || now >= cookieExpiryTime) {
        try {
            const homeRes = await fetch(ZING_BASE_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                },
            });
            const getSetCookie = (homeRes.headers as any).getSetCookie;
            if (typeof getSetCookie === 'function') {
                const rawCookies = getSetCookie.call(homeRes.headers) as string[];
                cachedSessionCookie = rawCookies.map(c => c.split(';')[0]).join('; ');
            } else {
                cachedSessionCookie = homeRes.headers.get('set-cookie') || '';
            }
            cookieExpiryTime = now + 3600 * 1000; // cache for 1 hour
        } catch (e) {
            console.warn('[ZingApi] Failed to fetch session cookie from home page:', e);
        }
    }

    return [cachedSessionCookie, userCookie].filter(Boolean).join('; ');
}

export interface ZingStreamResult {
    url: string;
    quality: 'standard' | 'high' | 'lossless';
    isVipOnly?: boolean;
}

/**
 * Fetches the direct audio streaming URL for a song from Zing MP3.
 */
export async function getZingAudioSource(
    songId: string,
    quality?: AudioQualityPreference,
): Promise<ZingStreamResult | null> {
    if (typeof window !== 'undefined' && window.electron?.getZingAudioSource) {
        try {
            const stream = await window.electron.getZingAudioSource(songId, getStoredZingCookie(), quality);
            if (stream) return stream;
        } catch (err) {
            console.warn('[ZingApi] Electron IPC stream fetch failed, falling back to fetch:', err);
        }
    }

    const path = '/api/v2/song/get/streaming';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, songId, ctime);
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('id', songId);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    const res = await fetch(url.toString(), {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': `${ZING_BASE_URL}/`,
            ...(cookie ? { Cookie: cookie } : {}),
        },
    });

    if (!res.ok) {
        throw new Error(`Zing streaming HTTP error: ${res.status}`);
    }

    const json = await res.json();

    if (json.err === -1150) {
        return {
            url: '',
            quality: 'standard',
            isVipOnly: true,
        };
    }

    if (json.err !== 0 || !json.data) {
        console.warn('[ZingApi] Stream request error:', json.err, json.msg);
        return null;
    }

    const data = json.data;
    const isStandard = quality === 'standard';

    if (isStandard && data['128']) {
        return {
            url: data['128'],
            quality: 'standard',
        };
    }

    if (data['320'] && data['320'] !== 'VIP') {
        return {
            url: data['320'],
            quality: 'high',
        };
    }

    if (data['128']) {
        return {
            url: data['128'],
            quality: 'standard',
        };
    }

    return null;
}

/**
 * Fetches the synchronized .lrc lyric from Zing MP3.
 */
export async function getZingLyric(songId: string): Promise<LyricData | null> {
    const path = '/api/v2/lyric/get/lyric';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, songId, ctime);
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('id', songId);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(url.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': `${ZING_BASE_URL}/`,
                ...(cookie ? { Cookie: cookie } : {}),
            },
        });

        if (!res.ok) return null;
        const json = await res.json();
        if (json.err === 0 && json.data?.file) {
            const lyricRes = await fetch(json.data.file);
            if (lyricRes.ok) {
                const lrcText = await lyricRes.text();
                return parseLRC(lrcText);
            }
        }
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch lyrics:', err);
    }

    return null;
}

/**
 * Fetches song details by song ID.
 */
export async function getZingSongDetail(songId: string): Promise<UnifiedSong | null> {
    const path = '/api/v2/song/get/info';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, songId, ctime);
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('id', songId);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(url.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': `${ZING_BASE_URL}/`,
                ...(cookie ? { Cookie: cookie } : {}),
            },
        });

        if (!res.ok) return null;
        const json = await res.json();
        if (json.err === 0 && json.data) {
            const d = json.data;
            const artists = (d.artists || []).map((a: any, idx: number) => ({
                id: a.id || idx,
                name: a.name || 'Various Artists',
            }));

            return {
                id: d.encodeId || songId,
                name: d.title || '',
                artists: artists.length > 0 ? artists : [{ id: 0, name: d.artistsNames || 'Zing MP3' }],
                album: {
                    id: 0,
                    name: d.album?.title || 'Zing MP3',
                    coverUrl: d.thumbnailM || d.thumbnail,
                },
                durationMs: (d.duration || 0) * 1000,
                sourceRef: { kind: 'online', providerId: 'zing', mediaId: d.encodeId || songId },
            };
        }
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch song detail:', err);
    }

    return null;
}

/**
 * Searches songs on Zing MP3 suggestions endpoint.
 */
export async function searchZingSongs(query: string, limit: number = 20): Promise<UnifiedSong[]> {
    if (!query || !query.trim()) return [];

    try {
        const ctime = Date.now();
        const targetUrl = `${ZING_SUGGEST_URL}?num=${Math.max(10, limit)}&query=${encodeURIComponent(query.trim())}&language=vi&ctime=${ctime}`;
        const res = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': `${ZING_BASE_URL}/`,
            },
        });

        if (!res.ok) return [];
        const data = await res.json();
        const items = data?.data?.items || [];
        const results: UnifiedSong[] = [];

        // Format 1: ac-suggestions with items[].suggestions
        for (const group of items) {
            const suggestions = group?.suggestions || [];
            for (const s of suggestions) {
                if ((s.type === 1 || !s.type) && s.id && (s.title || s.name)) {
                    const artists = (s.artists || []).map((a: any, idx: number) => ({
                        id: a.id || idx,
                        name: a.name || 'Various Artists',
                    }));

                    const coverUrl = s.thumb
                        ? (s.thumb.startsWith('http')
                            ? s.thumb.replace(/w\d+_r\d+x\d+_jpeg/, 'w600_r1x1_jpeg')
                            : `https://photo-resize-zmp3.zmdcdn.me/w600_r1x1_jpeg/${s.thumb}`)
                        : undefined;

                    results.push({
                        id: s.id,
                        name: s.title || s.name,
                        artists: artists.length > 0 ? artists : [{ id: 0, name: s.artist || 'Zing MP3' }],
                        album: {
                            id: 0,
                            name: 'Zing MP3',
                            coverUrl,
                        },
                        durationMs: (Number(s.duration) || 0) * 1000,
                        sourceRef: { kind: 'online', providerId: 'zing', mediaId: s.id },
                    });

                    if (results.length >= limit) break;
                }
            }
            if (results.length >= limit) break;
        }

        // Format 2: complete fallback with data[].song
        if (results.length === 0 && Array.isArray(data?.data)) {
            for (const group of data.data) {
                const songs = group?.song || [];
                for (const s of songs) {
                    if (s.id && (s.name || s.title)) {
                        const coverUrl = s.thumb
                            ? (s.thumb.startsWith('http')
                                ? s.thumb.replace(/w\d+_r\d+x\d+_jpeg/, 'w600_r1x1_jpeg')
                                : `https://photo-resize-zmp3.zmdcdn.me/w600_r1x1_jpeg/${s.thumb}`)
                            : undefined;

                        results.push({
                            id: s.id,
                            name: s.name || s.title,
                            artists: [{ id: 0, name: s.artist || 'Zing MP3' }],
                            album: {
                                id: 0,
                                name: 'Zing MP3',
                                coverUrl,
                            },
                            durationMs: (Number(s.duration) || 0) * 1000,
                            sourceRef: { kind: 'online', providerId: 'zing', mediaId: s.id },
                        });

                        if (results.length >= limit) break;
                    }
                }
                if (results.length >= limit) break;
            }
        }

        return results;
    } catch (err) {
        console.warn('[ZingApi] Search error:', err);
        return [];
    }
}

/**
 * Fetches the logged-in user profile from Zing MP3 to determine identity and VIP status.
 * Never defaults to VIP unless explicitly verified from user package info or isVip.
 */
export async function getZingUserProfile(): Promise<ProviderUser | null> {
    const userCookie = getStoredZingCookie();
    if (!userCookie) {
        setStoredZingProfile(null);
        return null;
    }

    const cached = getStoredZingProfile();
    if (cached) {
        return cached;
    }

    const path = '/api/v2/user/profile/get/info';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, '', ctime);
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(url.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': `${ZING_BASE_URL}/`,
                ...(cookie ? { Cookie: cookie } : {}),
            },
        });

        if (res.ok) {
            const json = await res.json();
            if (json.err === 0 && json.data) {
                const data = json.data;
                const hasVip = (
                    Array.isArray(data.packages) && data.packages.some((p: any) =>
                        typeof p === 'string' && (p.toUpperCase().includes('VIP') || p.toUpperCase().includes('PREMIUM'))
                    )
                ) || Boolean(data.isVip);

                const profile: ProviderUser = {
                    id: String(data.userid || 'zing_user'),
                    nickname: data.displayName || data.username || 'Tài khoản Zing MP3',
                    avatarUrl: data.avatar || undefined,
                    vipType: hasVip ? 1 : 0,
                };
                setStoredZingProfile(profile);
                return profile;
            }
        }
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch user profile:', err);
    }

    if (cached) {
        return cached;
    }

    // Default neutral profile for standard users with vipType: 0 (NOT VIP)
    const fallbackProfile: ProviderUser = {
        id: 'zing_user',
        nickname: 'Tài khoản Zing MP3',
        vipType: 0,
    };
    return fallbackProfile;
}

/**
 * Fetches popular and trending playlists from Zing MP3 home page.
 */
export async function getZingHomePlaylists(): Promise<ProviderCollection[]> {
    const path = '/api/v2/page/get/home';
    const ctime = String(Math.floor(Date.now() / 1000));
    const hashParams = `ctime=${ctime}page=1version=${ZING_VERSION}`;
    const sha256 = await getHash256(hashParams);
    const sig = await getHmac512(`${path}${sha256}`, ZING_SECRET_KEY);
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('page', '1');
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(url.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': `${ZING_BASE_URL}/`,
                ...(cookie ? { Cookie: cookie } : {}),
            },
        });

        if (!res.ok) return [];
        const json = await res.json();
        if (json.err !== 0 || !Array.isArray(json.data?.items)) return [];

        const collections: ProviderCollection[] = [];
        for (const section of json.data.items) {
            if (Array.isArray(section.items)) {
                for (const item of section.items) {
                    const id = item.id || item.encodeId;
                    if (id && item.title) {
                        const coverUrl = item.thumbnailM || item.thumbnail;
                        collections.push({
                            providerId: 'zing',
                            id: String(id),
                            name: String(item.title),
                            type: 'playlist',
                            coverUrl: coverUrl ? String(coverUrl) : undefined,
                            description: item.description || item.sortDescription || item.artistsNames || undefined,
                            trackCount: Number(item.song?.total || item.songCount || 100),
                            isOwned: false,
                        });
                    }
                }
            }
        }

        const uniqueMap = new Map<string, ProviderCollection>();
        for (const col of collections) {
            if (!uniqueMap.has(String(col.id))) {
                uniqueMap.set(String(col.id), col);
            }
        }
        return Array.from(uniqueMap.values());
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch home playlists:', err);
        return [];
    }
}

/**
 * Fetches tracks belonging to a Zing MP3 playlist.
 */
export async function getZingPlaylistTracks(
    playlistId: string,
    limit: number = 50,
    offset: number = 0,
): Promise<ProviderPage<UnifiedSong>> {
    const path = '/api/v2/page/get/playlist';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, playlistId, ctime);
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('id', playlistId);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(url.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': `${ZING_BASE_URL}/`,
                ...(cookie ? { Cookie: cookie } : {}),
            },
        });

        if (!res.ok) {
            return { items: [], total: 0, hasMore: false, nextOffset: offset };
        }

        const json = await res.json();
        if (json.err !== 0 || !json.data?.song?.items) {
            return { items: [], total: 0, hasMore: false, nextOffset: offset };
        }

        const rawSongs = json.data.song.items as any[];
        const songs: UnifiedSong[] = rawSongs
            .filter(s => s && (s.encodeId || s.id) && (s.title || s.name))
            .map(s => {
                const id = String(s.encodeId || s.id);
                const artists = Array.isArray(s.artists)
                    ? s.artists.map((a: any, i: number) => ({ id: a.id || i, name: String(a.name || 'Zing MP3') }))
                    : [{ id: 0, name: String(s.artistsNames || 'Zing MP3') }];

                const coverUrl = s.thumbnailM || s.thumbnail
                    ? String(s.thumbnailM || s.thumbnail).replace('http:', 'https:')
                    : undefined;

                return {
                    id,
                    name: String(s.title || s.name),
                    artists,
                    album: {
                        id: s.album?.encodeId || 0,
                        name: String(s.album?.title || s.title || 'Zing MP3'),
                        coverUrl,
                    },
                    durationMs: (Number(s.duration) || 0) * 1000,
                    sourceRef: { kind: 'online' as const, providerId: 'zing' as const, mediaId: id },
                };
            });

        const paged = songs.slice(offset, offset + limit);
        return {
            items: paged,
            total: songs.length,
            hasMore: offset + limit < songs.length,
            nextOffset: offset + limit,
        };
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch playlist tracks:', err);
        return { items: [], total: 0, hasMore: false, nextOffset: offset };
    }
}

