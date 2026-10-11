// src/utils/lyrics/providers/zingLyricProvider.ts
// Zing MP3 lyrics provider for Folia.
// Uses Zing MP3's suggestions & direct CDN lyric endpoint to fetch synchronized .lrc files.

import type { LyricData, SongResult } from '../../../types';
import { parseLRC } from '../parserCore';

const isElectron = typeof window !== 'undefined' && Boolean((window as any).electron);

function resolveFetchUrl(targetUrl: string): string {
    if (typeof window === 'undefined' || isElectron) {
        return targetUrl;
    }
    return `/api/lyric-proxy?url=${encodeURIComponent(targetUrl)}`;
}

interface ZingRawSuggestion {
    type?: number;
    title?: string;
    id?: string;
    thumb?: string;
    duration?: number;
    link?: string;
    lyricLink?: string;
    lyricId?: string | number;
    artists?: Array<{ id?: string | number; name?: string }>;
    artist?: string;
}

const zingLyricUrlCache = new Map<string, string>();
const ZING_CACHE_LIMIT = 500;

function rememberLyricUrl(songId: string, lyricUrl: string) {
    if (!songId || !lyricUrl) return;
    zingLyricUrlCache.set(songId, lyricUrl);
    if (zingLyricUrlCache.size > ZING_CACHE_LIMIT) {
        const firstKey = zingLyricUrlCache.keys().next().value;
        if (firstKey) zingLyricUrlCache.delete(firstKey);
    }
}

/**
 * Searches songs on Zing MP3 via the web suggestion service.
 */
export async function searchZingSongs(
    query: string,
    limit: number = 10,
): Promise<SongResult[]> {
    if (!query || !query.trim()) return [];

    try {
        const ctime = Date.now();
        const targetUrl = `https://ac.zingmp3.vn/v1/web/ac-suggestions?num=${Math.max(10, limit)}&query=${encodeURIComponent(query.trim())}&language=vi&ctime=${ctime}`;
        const url = resolveFetchUrl(targetUrl);

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://zingmp3.vn/',
            },
        });

        if (!res.ok) {
            console.warn(`[Zing] Search failed with HTTP ${res.status}`);
            return [];
        }

        const data = await res.json();
        const items = data?.data?.items || [];
        const results: SongResult[] = [];

        for (const group of items) {
            const suggestions: ZingRawSuggestion[] = group?.suggestions || [];
            for (const s of suggestions) {
                // type 1 represents songs on Zing MP3
                if ((s.type === 1 || !s.type) && s.id && s.title) {
                    if (s.lyricLink) {
                        rememberLyricUrl(s.id, s.lyricLink);
                    }

                    const artists = (s.artists || []).map((a, idx) => ({
                        id: a.id || idx,
                        name: a.name || 'Various Artists',
                    }));

                    results.push({
                        id: s.id,
                        name: s.title,
                        artists: artists.length > 0 ? artists : [{ id: 0, name: s.artist || 'Zing MP3' }],
                        album: {
                            id: 0,
                            name: 'Zing MP3',
                            ...(s.thumb ? { coverUrl: s.thumb.replace(/w\d+_r\d+x\d+_jpeg/, 'w600_r1x1_jpeg') } : {}),
                        },
                        durationMs: (s.duration || 0) * 1000,
                        sourceRef: { kind: 'online', providerId: 'zing', mediaId: s.id },
                    });

                    if (results.length >= limit) break;
                }
            }
            if (results.length >= limit) break;
        }

        return results;
    } catch (err) {
        console.warn(`[Zing] Search error for query "${query}":`, err);
        return [];
    }
}

/**
 * Fetches synced LRC lyrics for a Zing MP3 song.
 */
export async function fetchZingLyrics(
    song: Pick<SongResult, 'id'> & { name?: string; sourceRef?: { mediaId?: string }; lyricLink?: string },
): Promise<LyricData | null> {
    const songId = String(song.sourceRef?.mediaId || song.id);
    if (!songId) return null;

    let lyricUrl = song.lyricLink || zingLyricUrlCache.get(songId);

    // If lyricUrl not in cache, probe search with song name or id to discover it
    if (!lyricUrl && song.name) {
        await searchZingSongs(song.name, 5);
        lyricUrl = zingLyricUrlCache.get(songId);
    }

    if (!lyricUrl) {
        return null;
    }

    try {
        const fetchUrl = resolveFetchUrl(lyricUrl);
        const res = await fetch(fetchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://zingmp3.vn/',
            },
        });

        if (!res.ok) {
            console.warn(`[Zing] Lyric download failed with HTTP ${res.status}`);
            return null;
        }

        const lrcText = await res.text();
        if (!lrcText || !lrcText.trim()) return null;

        const parsed = parseLRC(lrcText);
        return parsed && parsed.lines.length > 0 ? parsed : null;
    } catch (err) {
        console.warn(`[Zing] Failed to fetch lyric from "${lyricUrl}":`, err);
        return null;
    }
}
