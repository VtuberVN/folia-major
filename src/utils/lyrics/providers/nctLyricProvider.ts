// src/utils/lyrics/providers/nctLyricProvider.ts
// NhacCuaTui (NCT) lyrics provider for Folia.
// Fetches song metadata, encrypted .lrc streams, and decrypts them with RC4.

import type { LyricData, SongResult } from '../../../types';
import { parseLRC } from '../parserCore';
import { decryptNctLyric } from './nctDecrypt';

const isElectron = typeof window !== 'undefined' && Boolean((window as any).electron);

function resolveFetchUrl(targetUrl: string): string {
    if (typeof window === 'undefined' || isElectron) {
        return targetUrl;
    }
    return `/api/lyric-proxy?url=${encodeURIComponent(targetUrl)}`;
}

interface NctRawSong {
    id?: string | number;
    name?: string;
    key?: string;
    url?: string;
    duration?: number;
    singer?: Array<{ name?: string }>;
}

/**
 * Extracts the NCT 12-character key from song.key or song.url.
 * e.g. "https://www.nhaccuatui.com/bai-hat/see-tinh-hoang-thuy-linh.FacSqbcPGZAl.html" -> "FacSqbcPGZAl"
 */
export function extractNctSongKey(song: { key?: string; url?: string; id?: string | number }): string {
    if (song.key && typeof song.key === 'string' && song.key.trim()) {
        return song.key.trim();
    }
    if (song.url && typeof song.url === 'string') {
        const match = song.url.match(/\.([a-zA-Z0-9_-]{10,16})\.html/i);
        if (match) return match[1];
    }
    if (song.id && typeof song.id === 'string' && /^[a-zA-Z0-9_-]{10,16}$/.test(song.id)) {
        return song.id;
    }
    return String(song.id || '');
}

/**
 * Searches songs on NhacCuaTui.
 */
export async function searchNctSongs(
    query: string,
    limit: number = 10,
): Promise<SongResult[]> {
    if (!query || !query.trim()) return [];

    try {
        const targetUrl = `https://www.nhaccuatui.com/ajax/search?q=${encodeURIComponent(query.trim())}`;
        const url = resolveFetchUrl(targetUrl);

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.nhaccuatui.com/',
            },
        });

        if (!res.ok) {
            console.warn(`[NCT] Search failed with HTTP ${res.status}`);
            return [];
        }

        const data = await res.json();
        const rawSongs: NctRawSong[] = data?.data?.song || [];

        return rawSongs.slice(0, limit).map((s): SongResult => {
            const songKey = extractNctSongKey(s);
            const artists = (s.singer || []).map((singer, idx) => ({
                id: idx,
                name: singer.name || 'Various Artists',
            }));

            return {
                id: songKey,
                name: s.name || 'Unknown Song',
                artists: artists.length > 0 ? artists : [{ id: 0, name: 'NhacCuaTui' }],
                album: { id: 0, name: 'NhacCuaTui' },
                durationMs: (s.duration || 0) * 1000,
                sourceRef: { kind: 'online', providerId: 'nct', mediaId: songKey },
            };
        });
    } catch (err) {
        console.warn(`[NCT] Search error for query "${query}":`, err);
        return [];
    }
}

/**
 * Fetches and decrypts synced LRC lyrics for an NCT song.
 */
export async function fetchNctLyrics(
    song: Pick<SongResult, 'id'> & { sourceRef?: { mediaId?: string }; key?: string; url?: string },
): Promise<LyricData | null> {
    const songKey = song.sourceRef?.mediaId || extractNctSongKey(song);
    if (!songKey) return null;

    try {
        const detailTargetUrl = `https://graph.nhaccuatui.com/api/v1/song/lyric/detail?songKey=${encodeURIComponent(songKey)}`;
        const detailUrl = resolveFetchUrl(detailTargetUrl);

        const res = await fetch(detailUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.nhaccuatui.com/',
            },
        });

        if (!res.ok) return null;
        const detail = await res.json();
        if (detail.code !== 0 || !detail.data) return null;

        const timedLyricUrl = detail.data.timedLyric;
        if (!timedLyricUrl || typeof timedLyricUrl !== 'string') {
            return null;
        }

        // Fetch encrypted .lrc file
        const lrcFetchUrl = resolveFetchUrl(timedLyricUrl);
        const lrcRes = await fetch(lrcFetchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.nhaccuatui.com/',
            },
        });

        if (!lrcRes.ok) return null;
        const cipherHex = await lrcRes.text();
        if (!cipherHex || !cipherHex.trim()) return null;

        const decryptKey = detail.data.keyDecryptLyric || 'Lyr1cjust4nct';
        const decryptedLrc = decryptNctLyric(cipherHex, decryptKey);

        if (!decryptedLrc || !decryptedLrc.trim()) return null;

        const parsed = parseLRC(decryptedLrc);
        return parsed && parsed.lines.length > 0 ? parsed : null;
    } catch (err) {
        console.warn(`[NCT] Failed to fetch lyrics for song key "${songKey}":`, err);
        return null;
    }
}
