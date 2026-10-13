// src/services/onlineMusic/zingApi.ts
// Zing MP3 API client with HMAC-SHA512 signing, audio stream retrieval, lyrics, and cookie management.

import type { LyricData, UnifiedSong } from '../../types';
import type { AudioQualityPreference, ProviderCollection, ProviderPage, ProviderUser } from '../../types/onlineMusic';
import { parseLRC } from '../../utils/lyrics/parserCore';
import i18n from 'i18next';

const ZING_API_KEY = 'X5BM3w8N7MKozC0B85o4KMlzLZKhV00y';
const ZING_SECRET_KEY = 'acOrvUS15XRW2o9JksiK1KgQ6Vbds8ZW';
const ZING_VERSION = '1.22.2';
const ZING_BASE_URL = 'https://zingmp3.vn';
const ZING_SUGGEST_URL = 'https://ac.zingmp3.vn/v1/web/ac-suggestions';
/** Timeout for all Zing API fetch calls (ms). */
const ZING_FETCH_TIMEOUT = 10_000;

const SIGN_KEYS = ['ctime', 'id', 'type', 'page', 'count', 'version'];

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
export async function getZingSignature(path: string, idOrParams: string | Record<string, any>, ctime?: string): Promise<string> {
    const params: Record<string, any> = typeof idOrParams === 'string'
        ? { id: idOrParams, ctime: ctime || String(Math.floor(Date.now() / 1000)), version: ZING_VERSION }
        : { ...idOrParams, ctime: idOrParams.ctime || ctime || String(Math.floor(Date.now() / 1000)), version: idOrParams.version || ZING_VERSION };

    const sortedKeys = Object.keys(params).sort();
    const filtered: Record<string, string> = {};
    for (const k of sortedKeys) {
        if (SIGN_KEYS.includes(k) && params[k] !== null && params[k] !== undefined && params[k] !== '') {
            filtered[k] = String(params[k]);
        }
    }
    const parts = Object.keys(filtered).map(k => {
        const val = encodeURIComponent(filtered[k]);
        return val.length > 5000 ? '' : `${encodeURIComponent(k)}=${val}`;
    }).filter(Boolean);

    const n = parts.join('');
    const sha256 = await getHash256(n);
    return getHmac512(`${path}${sha256}`, ZING_SECRET_KEY);
}

let inMemoryCookie: string | null = null;
let inMemoryProfile: ProviderUser | null = null;
let zingWriteVersion = 0;

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
    if (inMemoryCookie !== null) return inMemoryCookie;
    if (typeof localStorage === 'undefined') return '';
    const raw = localStorage.getItem(ZING_COOKIE_STORAGE_KEY) || '';
    if (raw.startsWith('enc:')) {
        if (typeof window !== 'undefined' && window.electron?.safeStorageDecryptSync) {
            try {
                const decrypted = window.electron.safeStorageDecryptSync(raw.slice(4));
                if (decrypted) {
                    inMemoryCookie = decrypted;
                    return decrypted;
                }
            } catch {
                // decrypt failed
            }
        }
        // Ciphertext not decryptable — treat as no cookie, don't leak ciphertext
        inMemoryCookie = '';
        return '';
    }
    inMemoryCookie = raw;
    return raw;
}

/**
 * Stores a user-provided Zing MP3 cookie in localStorage.
 */
export function setStoredZingCookie(cookie: string): void {
    const trimmed = cookie.trim();
    inMemoryCookie = trimmed || null;
    const writeId = ++zingWriteVersion;
    if (typeof localStorage === 'undefined') return;
    if (trimmed) {
        if (typeof window !== 'undefined' && window.electron?.safeStorageEncrypt) {
            void window.electron.safeStorageEncrypt(trimmed).then(encrypted => {
                if (writeId !== zingWriteVersion) return; // superseded by newer write or logout
                if (encrypted) {
                    localStorage.setItem(ZING_COOKIE_STORAGE_KEY, `enc:${encrypted}`);
                } else {
                    localStorage.setItem(ZING_COOKIE_STORAGE_KEY, trimmed);
                }
            }).catch(() => {
                if (writeId !== zingWriteVersion) return;
                localStorage.setItem(ZING_COOKIE_STORAGE_KEY, trimmed);
            });
        } else {
            localStorage.setItem(ZING_COOKIE_STORAGE_KEY, trimmed);
        }
    } else {
        localStorage.removeItem(ZING_COOKIE_STORAGE_KEY);
        setStoredZingProfile(null);
    }
}

function toZingWebProxyUrl(url: string): string {
    if (typeof window !== 'undefined' && !(window as any).electron) {
        return `/api/lyric-proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
}

function buildZingRequestHeaders(cookie?: string): Record<string, string> {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${ZING_BASE_URL}/`,
        ...(cookie ? { Cookie: cookie, 'x-zing-cookie': cookie } : {}),
    };
}

/**
 * Obtains a valid cookie for Zing MP3 requests, prioritizing user VIP cookie.
 */
async function resolveCookie(): Promise<string> {
    const userCookie = getStoredZingCookie();
    const now = Date.now();

    if (!cachedSessionCookie || now >= cookieExpiryTime) {
        try {
            const homeRes = await fetch(toZingWebProxyUrl(ZING_BASE_URL), {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(5000),
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

    const cookies: string[] = [];
    if (cachedSessionCookie) cookies.push(cachedSessionCookie);
    if (userCookie) cookies.push(userCookie);
    if (!cookies.some(c => c.includes('zmp3_rqid'))) {
        const syntheticRaw = `0|127.0.0.1|v${ZING_VERSION}|${Date.now()}`;
        const syntheticRqid = typeof Buffer !== 'undefined'
            ? Buffer.from(syntheticRaw).toString('base64')
            : (typeof btoa === 'function' ? btoa(syntheticRaw) : '');
        cookies.push(`zmp3_app_version.1=1222`);
        if (syntheticRqid) cookies.push(`zmp3_rqid=${syntheticRqid}`);
    }

    return cookies.filter(Boolean).join('; ');
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

    const res = await fetch(toZingWebProxyUrl(url.toString()), {
        headers: buildZingRequestHeaders(cookie),
        signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
    });

    if (!res.ok) {
        throw new Error(`Zing streaming HTTP error: ${res.status}`);
    }

    const json = await res.json();

    if (json.err === -1150 || (typeof json.msg === 'string' && json.msg.includes('VIP'))) {
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
        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });

        if (!res.ok) return null;
        const json = await res.json();
        if (json.err === 0 && json.data?.file) {
            const lyricRes = await fetch(toZingWebProxyUrl(json.data.file), { signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT) });
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
        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });

        if (!res.ok) return null;
        const json = await res.json();
        if (json.err === 0 && json.data) {
            const d = json.data;
            const artists = (d.artists || []).map((a: any, idx: number) => ({
                id: a.id || idx,
                name: a.name || 'Various Artists',
            }));

            const isVip = Boolean(
                d.streamingStatus === 2 ||
                d.playStatus === 3 ||
                (Array.isArray(d.playPrvl) && d.playPrvl.includes(2)) ||
                (Array.isArray(d.indicators) && d.indicators.includes('vip'))
            );

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
                fee: isVip ? 1 : 0,
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
        const res = await fetch(toZingWebProxyUrl(targetUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': `${ZING_BASE_URL}/`,
            },
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
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

                    const isVip = Boolean(
                        s.playStatus === 3 ||
                        (Array.isArray(s.playPrvl) && s.playPrvl.includes(2)) ||
                        (Array.isArray(s.downloadPrvl) && s.downloadPrvl.includes(3)) ||
                        s.streamingStatus === 2
                    );

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
                        fee: isVip ? 1 : 0,
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

                        const isVip = Boolean(
                            s.streamingStatus === 2 ||
                            s.playStatus === 3 ||
                            (Array.isArray(s.playPrvl) && s.playPrvl.includes(2))
                        );

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
                            fee: isVip ? 1 : 0,
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
    if (cached && cached.id && cached.id !== 'zing_user' && String(cached.id) !== '0') {
        return cached;
    }

    const mapRawZingProfile = (data: any): ProviderUser => {
        const hasVip = (
            Array.isArray(data.packages) && data.packages.some((p: any) =>
                typeof p === 'string' && (p.toUpperCase().includes('VIP') || p.toUpperCase().includes('PREMIUM'))
            )
        ) || Boolean(data.isVip);

        return {
            id: String(data.userid || data.id || 'zing_user'),
            nickname: data.displayName || data.username || (i18n.isInitialized ? i18n.t('zing.accountUser') : 'Zing MP3 User'),
            avatarUrl: data.avatar || undefined,
            vipType: hasVip ? 1 : 0,
        };
    };

    if (typeof window !== 'undefined' && (window as any).electron?.fetchZingProfile) {
        try {
            const ipcData = await (window as any).electron.fetchZingProfile(userCookie);
            if (ipcData && (ipcData.userid || ipcData.id) && ipcData.userid !== 0) {
                const profile = mapRawZingProfile(ipcData);
                setStoredZingProfile(profile);
                return profile;
            }
        } catch (err) {
            console.warn('[ZingApi] IPC fetchZingProfile failed:', err);
        }
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
        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': `${ZING_BASE_URL}/`,
                ...(cookie ? { Cookie: cookie, 'x-zing-cookie': cookie } : {}),
            },
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });

        if (res.ok) {
            const json = await res.json();
            if (json.err === 0 && json.data && (json.data.userid || json.data.id) && json.data.userid !== 0) {
                const profile = mapRawZingProfile(json.data);
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
        nickname: (i18n.isInitialized ? i18n.t('zing.accountUser') : 'Zing MP3 User'),
        vipType: 0,
    };
    return fallbackProfile;
}

/**
 * Searches curated playlists from Zing suggestions endpoint as a robust fallback.
 */
export async function fetchZingSuggestedPlaylists(query: string = 'top 100'): Promise<ProviderCollection[]> {
    try {
        const ctime = Date.now();
        const targetUrl = `${ZING_SUGGEST_URL}?num=20&query=${encodeURIComponent(query)}&language=vi&ctime=${ctime}`;
        const res = await fetch(toZingWebProxyUrl(targetUrl), { signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT) });
        if (!res.ok) return [];
        const data = await res.json();
        const collections: ProviderCollection[] = [];
        for (const group of data?.data?.items || []) {
            for (const s of group?.suggestions || []) {
                if (s.type === 3 && s.id && s.title) {
                    const cover = s.thumb
                        ? (s.thumb.startsWith('http')
                            ? s.thumb.replace(/w\d+_r\d+x\d+_jpeg/, 'w600_r1x1_jpeg')
                            : `https://photo-resize-zmp3.zmdcdn.me/w600_r1x1_jpeg/${s.thumb}`)
                        : undefined;
                    collections.push({
                        providerId: 'zing',
                        id: String(s.id),
                        name: String(s.title),
                        type: 'playlist',
                        coverUrl: cover,
                        description: s.preDesc || s.shortDesc || undefined,
                        trackCount: 0,
                        isOwned: false,
                    });
                }
            }
        }
        return collections;
    } catch (e) {
        console.warn('[ZingApi] fetchZingSuggestedPlaylists error:', e);
        return [];
    }
}

/**
 * Fetches popular and trending playlists from Zing MP3.
 * Prioritizes official curated Top 100 collections as playlists.
 */
export async function getZingHomePlaylists(): Promise<ProviderCollection[]> {
    try {
        const top100 = await getZingTop100Albums(50, 0);
        if (top100.items.length > 0) {
            return top100.items.map(item => ({
                ...item,
                type: 'playlist' as const,
            }));
        }
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch home playlists:', err);
    }
    const fallback = await fetchZingSuggestedPlaylists('top 100');
    return fallback;
}

let lastLikedCoverUrl: string | undefined;
let lastLikedCount: number | undefined;
let lastRecentCoverUrl: string | undefined;
let lastRecentCount: number | undefined;

function normalizeZingSong(s: any): UnifiedSong {
    const id = String(s.encodeId || s.id);
    const artists = Array.isArray(s.artists)
        ? s.artists.map((a: any, i: number) => ({ id: a.id || i, name: String(a.name || 'Zing MP3') }))
        : [{ id: 0, name: String(s.artistsNames || 'Zing MP3') }];

    const coverUrl = s.thumbnailM || s.thumbnail
        ? String(s.thumbnailM || s.thumbnail).replace('http:', 'https:')
        : undefined;

    const isVip = Boolean(
        s.streamingStatus === 2 ||
        s.playStatus === 3 ||
        (Array.isArray(s.playPrvl) && s.playPrvl.includes(2)) ||
        (Array.isArray(s.indicators) && s.indicators.includes('vip'))
    );

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
        fee: isVip ? 1 : 0,
        sourceRef: { kind: 'online' as const, providerId: 'zing' as const, mediaId: id },
    };
}

function normalizeZingCollection(item: any, type: 'playlist' | 'album' = 'playlist', isOwned = true): ProviderCollection {
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
        isOwned,
    };
}

/**
 * Fetches user's personal playlists from Zing MP3 library (/api/v2/user/playlist/get/list).
 * Falls back to curated Top 100 collections when not logged in or empty.
 */
export async function getUserZingPlaylists(
    limit: number = 30,
    offset: number = 0,
): Promise<ProviderPage<ProviderCollection>> {
    const userCookie = getStoredZingCookie();
    if (userCookie) {
        const path = '/api/v2/user/playlist/get/list';
        const page = Math.floor(offset / limit) + 1;
        const ctime = String(Math.floor(Date.now() / 1000));
        const sig = await getZingSignature(path, { type: 'library', page, count: limit, ctime });
        const cookie = await resolveCookie();

        const url = new URL(`${ZING_BASE_URL}${path}`);
        url.searchParams.set('type', 'library');
        url.searchParams.set('page', String(page));
        url.searchParams.set('count', String(limit));
        url.searchParams.set('ctime', ctime);
        url.searchParams.set('version', ZING_VERSION);
        url.searchParams.set('apiKey', ZING_API_KEY);
        url.searchParams.set('sig', sig);

        let isAuthError = false;
        try {
            const res = await fetch(toZingWebProxyUrl(url.toString()), {
                headers: buildZingRequestHeaders(cookie),
                signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
            });
            if (res.ok) {
                const json = await res.json();
                if (json.err === 0) {
                    const rawItems = Array.isArray(json.data?.items) ? json.data.items : [];
                    let userPlaylists = rawItems
                        .filter((item: any) => item && (item.encodeId || item.id))
                        .map((item: any) => normalizeZingCollection(item, 'playlist', true));

                    if (userPlaylists.length === 0 && offset === 0) {
                        try {
                            const syncPath = '/api/v2/user/sync/get/data';
                            const syncCtime = String(Math.floor(Date.now() / 1000));
                            const syncSig = await getZingSignature(syncPath, '', syncCtime);
                            const syncUrl = new URL(`${ZING_BASE_URL}${syncPath}`);
                            syncUrl.searchParams.set('ctime', syncCtime);
                            syncUrl.searchParams.set('version', ZING_VERSION);
                            syncUrl.searchParams.set('apiKey', ZING_API_KEY);
                            syncUrl.searchParams.set('sig', syncSig);
                            const syncRes = await fetch(toZingWebProxyUrl(syncUrl.toString()), {
                                headers: buildZingRequestHeaders(cookie),
                                signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
                            });
                            if (syncRes.ok) {
                                const syncJson = await syncRes.json();
                                if (syncJson.err === 0 && Array.isArray(syncJson.data?.library?.playlists)) {
                                    const syncPlaylists = syncJson.data.library.playlists
                                        .filter((item: any) => item && (item.encodeId || item.id))
                                        .map((item: any) => normalizeZingCollection(item, 'playlist', true));
                                    userPlaylists = syncPlaylists;
                                }
                            }
                        } catch {
                            // sync fallback non-fatal
                        }
                    }

                    let items = [...userPlaylists];

                    // On page 1 (offset === 0), prepend "Bài hát yêu thích" (isLiked: true) and "Nghe gần đây"
                    if (offset === 0) {
                        const specials: ProviderCollection[] = [
                            {
                                providerId: 'zing',
                                id: 'zing_liked_songs',
                                name: 'Bài hát yêu thích',
                                type: 'playlist',
                                coverUrl: lastLikedCoverUrl || 'https://photo-zmp3.zmdcdn.me/album_default.png',
                                description: '',
                                trackCount: lastLikedCount,
                                isLiked: true,
                                isOwned: true,
                            },
                            {
                                providerId: 'zing',
                                id: 'zing_recent_songs',
                                name: 'Nghe gần đây',
                                type: 'playlist',
                                coverUrl: lastRecentCoverUrl || 'https://photo-zmp3.zmdcdn.me/album_default.png',
                                description: '',
                                trackCount: lastRecentCount,
                                isOwned: true,
                            },
                        ];
                        items = [...specials, ...items];
                    }

                    const total = Number(json.data?.total ?? userPlaylists.length) + (offset === 0 ? 2 : 0);
                    return {
                        items,
                        total,
                        hasMore: offset + items.length < total,
                        nextOffset: offset + items.length,
                    };
                } else if (json.err === -801) {
                    console.warn('[ZingApi] User session expired or unauthenticated (-801)');
                    isAuthError = true;
                }
            }
        } catch (err) {
            console.warn('[ZingApi] Failed to fetch user playlists:', err);
        }

        // If not an explicit auth rejection and at offset 0, provide the specials with default cover
        if (!isAuthError && offset === 0) {
            return {
                items: [
                    {
                        providerId: 'zing',
                        id: 'zing_liked_songs',
                        name: 'Bài hát yêu thích',
                        type: 'playlist',
                        coverUrl: lastLikedCoverUrl || 'https://photo-zmp3.zmdcdn.me/album_default.png',
                        description: '',
                        trackCount: lastLikedCount,
                        isLiked: true,
                        isOwned: true,
                    },
                    {
                        providerId: 'zing',
                        id: 'zing_recent_songs',
                        name: 'Nghe gần đây',
                        type: 'playlist',
                        coverUrl: lastRecentCoverUrl || 'https://photo-zmp3.zmdcdn.me/album_default.png',
                        description: '',
                        trackCount: lastRecentCount,
                        isOwned: true,
                    },
                ],
                total: 2,
                hasMore: false,
                nextOffset: 2,
            };
        }
    }

    return { items: [], total: 0, hasMore: false, nextOffset: offset };
}

/**
 * Fetches user's favorite/liked songs from Zing MP3 library (/api/v2/user/song/get/list).
 */
export async function getZingLikedSongs(
    limit: number = 50,
    offset: number = 0,
): Promise<UnifiedSong[]> {
    const userCookie = getStoredZingCookie();
    if (!userCookie) return [];

    const path = '/api/v2/user/song/get/list';
    const page = Math.floor(offset / limit) + 1;
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, { type: 'library', page, count: limit, ctime });
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('type', 'library');
    url.searchParams.set('page', String(page));
    url.searchParams.set('count', String(limit));
    url.searchParams.set('sectionId', 'mFavSong');
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });
        if (res.ok) {
            const json = await res.json();
            if (json.err === 0 && Array.isArray(json.data?.items)) {
                const songs = json.data.items
                    .filter((s: any) => s && (s.encodeId || s.id) && (s.title || s.name))
                    .map((s: any) => normalizeZingSong(s));
                if (songs.length > 0) {
                    if (offset === 0 && songs[0]?.album?.coverUrl) {
                        lastLikedCoverUrl = songs[0].album.coverUrl;
                    }
                    lastLikedCount = Number(json.data?.total ?? songs.length);
                    return songs;
                }
            }
        }
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch liked songs:', err);
    }

    // Fallback: check /api/v2/user/sync/get/data when primary list returns empty on first page
    if (offset === 0) {
        try {
            const syncPath = '/api/v2/user/sync/get/data';
            const syncCtime = String(Math.floor(Date.now() / 1000));
            const syncSig = await getZingSignature(syncPath, '', syncCtime);
            const syncUrl = new URL(`${ZING_BASE_URL}${syncPath}`);
            syncUrl.searchParams.set('ctime', syncCtime);
            syncUrl.searchParams.set('version', ZING_VERSION);
            syncUrl.searchParams.set('apiKey', ZING_API_KEY);
            syncUrl.searchParams.set('sig', syncSig);
            const syncRes = await fetch(toZingWebProxyUrl(syncUrl.toString()), {
                headers: buildZingRequestHeaders(cookie),
                signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
            });
            if (syncRes.ok) {
                const syncJson = await syncRes.json();
                const rawSongs = syncJson.data?.library?.songs || syncJson.data?.songs;
                if (syncJson.err === 0 && Array.isArray(rawSongs)) {
                    const songs = rawSongs
                        .filter((s: any) => s && (s.encodeId || s.id) && (s.title || s.name))
                        .map((s: any) => normalizeZingSong(s));
                    if (songs.length > 0) {
                        if (songs[0]?.album?.coverUrl) {
                            lastLikedCoverUrl = songs[0].album.coverUrl;
                        }
                        lastLikedCount = songs.length;
                        return songs.slice(0, limit);
                    }
                }
            }
        } catch {
            // fallback non-fatal
        }
    }

    return [];
}

/**
 * Fetches user's library albums from Zing MP3 (/api/v2/user/album/get/list).
 * Falls back to curated albums when unauthenticated or empty.
 */
export async function getUserZingAlbums(
    limit: number = 30,
    offset: number = 0,
): Promise<ProviderPage<ProviderCollection>> {
    const userCookie = getStoredZingCookie();
    if (userCookie) {
        const path = '/api/v2/user/album/get/list';
        const page = Math.floor(offset / limit) + 1;
        const ctime = String(Math.floor(Date.now() / 1000));
        const sig = await getZingSignature(path, { type: 'library', page, count: limit, ctime });
        const cookie = await resolveCookie();

        const url = new URL(`${ZING_BASE_URL}${path}`);
        url.searchParams.set('type', 'library');
        url.searchParams.set('page', String(page));
        url.searchParams.set('count', String(limit));
        url.searchParams.set('sectionId', 'mAlbum');
        url.searchParams.set('ctime', ctime);
        url.searchParams.set('version', ZING_VERSION);
        url.searchParams.set('apiKey', ZING_API_KEY);
        url.searchParams.set('sig', sig);

        try {
            const res = await fetch(toZingWebProxyUrl(url.toString()), {
                headers: buildZingRequestHeaders(cookie),
                signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
            });
            if (res.ok) {
                const json = await res.json();
                if (json.err === 0 && Array.isArray(json.data?.items)) {
                    const items = json.data.items
                        .filter((item: any) => item && (item.encodeId || item.id))
                        .map((item: any) => normalizeZingCollection(item, 'album', true));
                    const total = Number(json.data.total ?? items.length);
                    if (items.length > 0) {
                        return {
                            items,
                            total,
                            hasMore: offset + items.length < total,
                            nextOffset: offset + items.length,
                        };
                    }
                }
            }
        } catch (err) {
            console.warn('[ZingApi] Failed to fetch user albums:', err);
        }
    }

    return { items: [], total: 0, hasMore: false, nextOffset: offset };
}

/**
 * Fetches user's recent listening history from Zing MP3 (/api/v2/user/song/get/list with type: recentListen).
 */
export async function getZingRecentSongs(limit: number = 30): Promise<UnifiedSong[]> {
    const userCookie = getStoredZingCookie();
    if (!userCookie) return [];

    const path = '/api/v2/user/song/get/list';
    const cookie = await resolveCookie();

    const fetchRecentPage = async (page: number, count: number): Promise<UnifiedSong[]> => {
        const ctime = String(Math.floor(Date.now() / 1000));
        const sig = await getZingSignature(path, { type: 'recentListen', page, count, ctime });
        const url = new URL(`${ZING_BASE_URL}${path}`);
        url.searchParams.set('type', 'recentListen');
        url.searchParams.set('page', String(page));
        url.searchParams.set('count', String(count));
        url.searchParams.set('sectionId', 'mRecent');
        url.searchParams.set('ctime', ctime);
        url.searchParams.set('version', ZING_VERSION);
        url.searchParams.set('apiKey', ZING_API_KEY);
        url.searchParams.set('sig', sig);

        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });
        if (!res.ok) return [];
        const json = await res.json();
        if (json.err === 0 && Array.isArray(json.data?.items)) {
            const songs = json.data.items
                .filter((s: any) => s && (s.encodeId || s.id) && (s.title || s.name))
                .map((s: any) => normalizeZingSong(s));
            if (songs.length > 0) {
                if (songs[0]?.album?.coverUrl) {
                    lastRecentCoverUrl = songs[0].album.coverUrl;
                }
                lastRecentCount = Number(json.data?.total ?? songs.length);
            }
            return songs;
        }
        return [];
    };

    try {
        const primarySongs = await fetchRecentPage(1, limit);
        if (primarySongs.length > 0) {
            return primarySongs;
        }
        // Zing MP3 web client requests count=20 on page=1 for recentListen
        if (limit !== 20) {
            const fallback20 = await fetchRecentPage(1, 20);
            if (fallback20.length > 0) {
                return fallback20;
            }
        }
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch recent songs:', err);
    }

    // Fallback: /api/v2/user/lasplaying/get/lasplaying
    try {
        const lpPath = '/api/v2/user/lasplaying/get/lasplaying';
        const lpCtime = String(Math.floor(Date.now() / 1000));
        const lpSig = await getZingSignature(lpPath, '', lpCtime);
        const lpUrl = new URL(`${ZING_BASE_URL}${lpPath}`);
        lpUrl.searchParams.set('ctime', lpCtime);
        lpUrl.searchParams.set('version', ZING_VERSION);
        lpUrl.searchParams.set('apiKey', ZING_API_KEY);
        lpUrl.searchParams.set('sig', lpSig);

        const lpRes = await fetch(toZingWebProxyUrl(lpUrl.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });
        if (lpRes.ok) {
            const lpJson = await lpRes.json();
            const rawSongs = lpJson.data?.items || lpJson.data?.songs || (Array.isArray(lpJson.data) ? lpJson.data : []);
            if (lpJson.err === 0 && Array.isArray(rawSongs)) {
                const songs = rawSongs
                    .filter((s: any) => s && (s.encodeId || s.id) && (s.title || s.name))
                    .map((s: any) => normalizeZingSong(s));
                if (songs.length > 0) {
                    if (songs[0]?.album?.coverUrl) {
                        lastRecentCoverUrl = songs[0].album.coverUrl;
                    }
                    lastRecentCount = songs.length;
                    return songs.slice(0, limit);
                }
            }
        }
    } catch {
        // non-fatal
    }

    return [];
}

/**
 * Retrieves details for a Zing MP3 playlist or virtual library collection.
 */
export async function getZingPlaylistDetail(
    playlistId: string,
    existingCollection?: ProviderCollection,
): Promise<ProviderCollection | null> {
    if (playlistId === 'zing_liked_songs' || playlistId === 'liked') {
        const defaultCover = 'https://photo-zmp3.zmdcdn.me/album_default.png';
        const existingCover = existingCollection?.coverUrl && existingCollection.coverUrl !== defaultCover
            ? existingCollection.coverUrl
            : undefined;
        return {
            providerId: 'zing',
            id: 'zing_liked_songs',
            name: 'Bài hát yêu thích',
            type: 'playlist',
            coverUrl: lastLikedCoverUrl || existingCover || defaultCover,
            description: existingCollection?.description || '',
            trackCount: lastLikedCount ?? existingCollection?.trackCount,
            isLiked: true,
            isOwned: true,
        };
    }
    if (playlistId === 'zing_recent_songs' || playlistId === 'recent') {
        const defaultCover = 'https://photo-zmp3.zmdcdn.me/album_default.png';
        const existingCover = existingCollection?.coverUrl && existingCollection.coverUrl !== defaultCover
            ? existingCollection.coverUrl
            : undefined;
        return {
            providerId: 'zing',
            id: 'zing_recent_songs',
            name: 'Nghe gần đây',
            type: 'playlist',
            coverUrl: lastRecentCoverUrl || existingCover || defaultCover,
            description: existingCollection?.description || '',
            trackCount: lastRecentCount ?? existingCollection?.trackCount,
            isOwned: true,
        };
    }
    const albumDetail = await getZingAlbumDetail(playlistId);
    return albumDetail || existingCollection || null;
}

/**
 * Fetches tracks belonging to a Zing MP3 playlist.
 */
export async function getZingPlaylistTracks(
    playlistId: string,
    limit: number = 50,
    offset: number = 0,
): Promise<ProviderPage<UnifiedSong>> {
    // Handle special user library collections
    if (playlistId === 'zing_liked_songs' || playlistId === 'liked') {
        const songs = await getZingLikedSongs(Math.max(limit, 100), 0);
        const paged = songs.slice(offset, offset + limit);
        return {
            items: paged,
            total: songs.length,
            hasMore: offset + limit < songs.length,
            nextOffset: offset + limit,
        };
    }
    if (playlistId === 'zing_recent_songs' || playlistId === 'recent') {
        const songs = await getZingRecentSongs(Math.max(limit, 50));
        const paged = songs.slice(offset, offset + limit);
        return {
            items: paged,
            total: songs.length,
            hasMore: offset + limit < songs.length,
            nextOffset: offset + limit,
        };
    }

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
        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
            const json = await res.json();
            const rawSongs = (json.data?.song?.items || json.data?.items || []) as any[];
            if (rawSongs.length > 0) {
                const songs: UnifiedSong[] = rawSongs
                    .filter(s => s && (s.encodeId || s.id) && (s.title || s.name))
                    .map(s => normalizeZingSong(s));

                const paged = songs.slice(offset, offset + limit);
                return {
                    items: paged,
                    total: songs.length,
                    hasMore: offset + limit < songs.length,
                    nextOffset: offset + limit,
                };
            }
        }
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch playlist tracks:', err);
    }

    // Fallback for radio stations, empty genres, or specialized collections
    const ZING_RADIO_GENRE_MAP: Record<string, string> = {
        'ZXbG0QKBQSA9': 'k-pop',
        'Bo6sd787Kr2M': 'bolero',
        'YddW1sgdpXYc': 'edm',
        'yUEDI0z9aMs': 'nhạc trẻ',
        'd8f3nFfU2P67': 'us-uk',
        'IkWw5m7rbC5A': 'rap việt',
        'o0FXZvZaF6Vp': 'nhạc hoa',
        'z7cXHNUEp8c3': 'acoustic',
        's2WSjK0DAJwC': 'chạm',
        'cEtv3PxRbkQg': 'nhạc không lời',
    };
    const fallbackQuery = ZING_RADIO_GENRE_MAP[playlistId];
    if (fallbackQuery) {
        try {
            const fallbackSongs = await searchZingSongs(fallbackQuery, limit);
            if (fallbackSongs.length > 0) {
                return {
                    items: fallbackSongs,
                    total: fallbackSongs.length,
                    hasMore: false,
                    nextOffset: offset + fallbackSongs.length,
                };
            }
        } catch {
            // ignore
        }
    }

    return { items: [], total: 0, hasMore: false, nextOffset: offset };
}

/**
 * Fetches details for a Zing MP3 Album.
 */
export async function getZingAlbumDetail(albumId: string): Promise<ProviderCollection | null> {
    const path = '/api/v2/page/get/playlist';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, { id: albumId, ctime });
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('id', albumId);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });
        if (!res.ok) return null;
        const json = await res.json();
        if (json.err !== 0 || !json.data) return null;

        const data = json.data;
        const coverUrl = data.thumbnailM || data.thumbnail;
        return {
            providerId: 'zing',
            id: String(data.encodeId || albumId),
            name: String(data.title || 'Zing MP3 Album'),
            type: 'album',
            coverUrl: coverUrl ? String(coverUrl).replace('http:', 'https:') : undefined,
            description: data.description || data.sortDescription || data.artistsNames || undefined,
            trackCount: Number(data.song?.total || data.song?.items?.length || 0),
            isOwned: false,
        };
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch album detail:', err);
        return null;
    }
}

/**
 * In-memory cache for Top 100 results (TTL: 5 minutes).
 * Prevents triple-fetching when Albums, Playlists, and Recommendations load concurrently.
 */
let top100Cache: { data: ProviderPage<ProviderCollection>; fetchedAt: number } | null = null;
const TOP_100_CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetches curated Top 100 official albums/playlists from Zing MP3.
 */
export async function getZingTop100Albums(
    limit: number = 30,
    offset: number = 0,
): Promise<ProviderPage<ProviderCollection>> {
    // Return cached full result and apply pagination locally
    if (top100Cache && Date.now() - top100Cache.fetchedAt < TOP_100_CACHE_TTL) {
        const allItems = top100Cache.data.items;
        const paged = allItems.slice(offset, offset + limit);
        return {
            items: paged,
            total: allItems.length,
            hasMore: offset + limit < allItems.length,
            nextOffset: offset + limit,
        };
    }
    const path = '/api/v2/page/get/top-100';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, { ctime });
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const headers = buildZingRequestHeaders(cookie);
        const res = await fetch(toZingWebProxyUrl(url.toString()), { headers, signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT) });

        if (!res.ok) return { items: [], total: 0, hasMore: false, nextOffset: offset };
        const json = await res.json();
        if (json.err !== 0 || !json.data) {
            return { items: [], total: 0, hasMore: false, nextOffset: offset };
        }

        const sections = Array.isArray(json.data)
            ? json.data
            : (typeof json.data === 'object' ? Object.values(json.data) : []);

        const albumMap = new Map<string, ProviderCollection>();
        for (const section of sections as any[]) {
            if (Array.isArray(section?.items)) {
                for (const item of section.items) {
                    const albumId = item?.encodeId || item?.id;
                    const title = item?.title || item?.name;
                    if (albumId && title && !albumMap.has(String(albumId))) {
                        const cover = item.thumbnailM || item.thumbnail || item.thumbnailR;
                        albumMap.set(String(albumId), {
                            providerId: 'zing',
                            id: String(albumId),
                            name: String(title),
                            type: 'album',
                            coverUrl: cover ? String(cover).replace('http:', 'https:') : undefined,
                            description: item.sortDescription || item.description || item.artistsNames || undefined,
                            trackCount: Number(item.song?.total || item.songCount || 100),
                            isOwned: false,
                        });
                    }
                }
            }
        }

        const allAlbums = Array.from(albumMap.values());
        // Cache the full result for subsequent calls
        if (allAlbums.length > 0) {
            top100Cache = {
                data: { items: allAlbums, total: allAlbums.length, hasMore: false, nextOffset: allAlbums.length },
                fetchedAt: Date.now(),
            };
        }
        const paged = allAlbums.slice(offset, offset + limit);
        return {
            items: paged,
            total: allAlbums.length,
            hasMore: offset + limit < allAlbums.length,
            nextOffset: offset + limit,
        };
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch top-100 albums:', err);
        return { items: [], total: 0, hasMore: false, nextOffset: offset };
    }
}

/**
 * Fetches real albums from Zing MP3 (Top 100 collections and trending releases).
 */
export async function getZingAlbums(
    limit: number = 30,
    offset: number = 0,
): Promise<ProviderPage<ProviderCollection>> {
    // 1. Prioritize Top 100 curated collections
    const top100 = await getZingTop100Albums(limit, offset);
    if (top100.items.length > 0) {
        return top100;
    }

    // 2. Fallback to new release chart extraction
    const path = '/api/v2/page/get/newrelease-chart';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, { ctime });
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });

        if (!res.ok) return { items: [], total: 0, hasMore: false, nextOffset: offset };
        const json = await res.json();
        if (json.err !== 0 || !Array.isArray(json.data?.items)) {
            return { items: [], total: 0, hasMore: false, nextOffset: offset };
        }

        const albumMap = new Map<string, ProviderCollection>();
        for (const item of json.data.items) {
            const album = item.album;
            const albumId = album?.encodeId || (item.isAlbum ? (item.encodeId || item.id) : null);
            const title = album?.title || (item.isAlbum ? item.title : null);
            if (albumId && title && !albumMap.has(String(albumId))) {
                const cover = album?.thumbnailM || album?.thumbnail || item.thumbnailM || item.thumbnail;
                albumMap.set(String(albumId), {
                    providerId: 'zing',
                    id: String(albumId),
                    name: String(title),
                    type: 'album',
                    coverUrl: cover ? String(cover).replace('http:', 'https:') : undefined,
                    description: album?.artistsNames || item.artistsNames || undefined,
                    trackCount: Number(album?.song?.total || item.duration ? 1 : 10),
                    isOwned: false,
                });
            }
        }

        const allAlbums = Array.from(albumMap.values());
        if (allAlbums.length > 0) {
            const paged = allAlbums.slice(offset, offset + limit);
            return {
                items: paged,
                total: allAlbums.length,
                hasMore: offset + limit < allAlbums.length,
                nextOffset: offset + limit,
            };
        }
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch albums:', err);
    }

    const fallback = await fetchZingSuggestedPlaylists('album');
    const albumItems = fallback.map(item => ({ ...item, type: 'album' as const }));
    const paged = albumItems.slice(offset, offset + limit);
    return {
        items: paged,
        total: albumItems.length,
        hasMore: offset + limit < albumItems.length,
        nextOffset: offset + limit,
    };
}

/**
 * Fetches top trending chart songs from #zingchart.
 */
export async function getZingChartSongs(limit: number = 50): Promise<UnifiedSong[]> {
    const path = '/api/v2/page/get/chart-home';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, { ctime });
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });

        if (!res.ok) return [];
        const json = await res.json();
        if (json.err !== 0 || !json.data?.RTChart?.items) return [];

        const rawSongs = (json.data.RTChart.items as any[]).slice(0, limit);
        return rawSongs
            .filter(s => s && (s.encodeId || s.id) && (s.title || s.name))
            .map(s => normalizeZingSong(s));
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch chart songs:', err);
        return [];
    }
}

/**
 * Fetches live radio and stream stations from Zing MP3.
 */
export async function getZingRadioStations(limit: number = 20): Promise<ProviderCollection[]> {
    const path = '/api/v2/page/get/radio';
    const ctime = String(Math.floor(Date.now() / 1000));
    const sig = await getZingSignature(path, { ctime });
    const cookie = await resolveCookie();

    const url = new URL(`${ZING_BASE_URL}${path}`);
    url.searchParams.set('ctime', ctime);
    url.searchParams.set('version', ZING_VERSION);
    url.searchParams.set('apiKey', ZING_API_KEY);
    url.searchParams.set('sig', sig);

    try {
        const res = await fetch(toZingWebProxyUrl(url.toString()), {
            headers: buildZingRequestHeaders(cookie),
            signal: AbortSignal.timeout(ZING_FETCH_TIMEOUT),
        });

        if (!res.ok) return [];
        const json = await res.json();
        if (json.err !== 0 || !Array.isArray(json.data?.items)) return [];

        const stations: ProviderCollection[] = [];
        for (const section of json.data.items) {
            if (Array.isArray(section?.items)) {
                for (const item of section.items) {
                    const id = item?.encodeId || item?.id;
                    const title = item?.title || item?.name;
                    if (id && title) {
                        const cover = item.thumbnailM || item.thumbnail || item.thumbnailH;
                        stations.push({
                            providerId: 'zing',
                            id: String(id),
                            name: String(title),
                            type: 'radio',
                            coverUrl: cover ? String(cover).replace('http:', 'https:') : undefined,
                            description: item.host?.name ? `Host: ${item.host.name}` : (item.description || 'Radio Zing MP3'),
                            trackCount: Number(item.activeUsers || 1),
                            isOwned: false,
                        });
                    }
                }
            }
        }

        return stations.slice(0, limit);
    } catch (err) {
        console.warn('[ZingApi] Failed to fetch radio stations:', err);
        return [];
    }
}


