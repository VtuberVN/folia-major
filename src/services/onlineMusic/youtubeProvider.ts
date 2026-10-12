// src/services/onlineMusic/youtubeProvider.ts
// YouTube Music online provider implementation for Folia.

import type {
    OnlineMusicProvider,
    ProviderAudioSource,
    ProviderLyricsResult,
    ProviderSongAvailability,
    ProviderUser,
} from '../../types/onlineMusic';
import type { SongResult, UnifiedSong } from '../../types';
import { createProviderSongMetadata } from '../../utils/songMetadata';
import { parseLRC } from '../../utils/lyrics/parserCore';
import {
    searchYouTubeMusic,
    getYouTubeAudioStream,
    extractPlaylistId,
    getYouTubePlaylist,
    getStoredYouTubeCookie,
    setStoredYouTubeCookie,
    getStoredYouTubeProfile,
    clearStoredYouTubeProfile,
    getUserYouTubePlaylists,
    getYouTubeTrendingSongs,
} from './youtube/youtubeApi';

export async function fetchYouTubeLyrics(
    title: string,
    artist: string = '',
    fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<string | null> {
    if (!title || !title.trim()) return null;

    // 1. Query LRCLIB (open international synchronized lyrics database)
    try {
        const query = artist ? `${title.trim()} ${artist.trim()}` : title.trim();
        const lrcUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
        const res = await fetchFn(lrcUrl, {
            headers: {
                'User-Agent': 'Folia-YouTubeProvider/1.0 (https://github.com/VtuberVN/folia-major)',
            },
        });

        if (res.ok) {
            const items = await res.json();
            if (Array.isArray(items) && items.length > 0) {
                const matched = items.find((it: any) => it.syncedLyrics) || items[0];
                const text = matched?.syncedLyrics || matched?.plainLyrics;
                if (text && typeof text === 'string' && text.trim()) {
                    return text.trim();
                }
            }
        }
    } catch (err) {
        console.warn('[YouTubeProvider] LRCLIB lyric search failed:', err);
    }

    // 2. Fallback: Query Zing MP3 (specialized in Vietnamese and V-Pop songs)
    try {
        const ctime = Date.now();
        const zingUrl = `https://ac.zingmp3.vn/v1/web/ac-suggestions?num=5&query=${encodeURIComponent(title.trim())}&language=vi&ctime=${ctime}`;
        const res = await fetchFn(zingUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://zingmp3.vn/',
            },
        });

        if (res.ok) {
            const data = await res.json();
            const groups = data?.data?.items || [];
            for (const g of groups) {
                for (const s of (g.suggestions || [])) {
                    if (s.lyricLink) {
                        const lrcRes = await fetchFn(s.lyricLink);
                        if (lrcRes.ok) {
                            const text = await lrcRes.text();
                            if (text && text.trim()) {
                                return text.trim();
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[YouTubeProvider] Zing MP3 lyric fallback failed:', err);
    }

    return null;
}

export const youtubeProvider: OnlineMusicProvider = {
    id: 'youtube',
    displayName: 'YouTube Music',
    shortName: 'YouTube',
    getAvailability: () => ({ configured: true }),
    capabilities: {
        search: true,
        playback: true,
        lyrics: true,
        auth: true,
        userLibrary: true,
        playlists: true,
        albums: true,
        artists: false,
        recommendations: true,
        mutations: false,
        wordByWordLyrics: false,
    },
    normalizeSong(raw: unknown): UnifiedSong {
        const item = raw as any;
        return {
            id: item.id || '',
            name: item.name || item.title || '',
            artists: item.artists || [{ id: 0, name: item.artist || 'YouTube' }],
            album: item.album || { id: 0, name: 'YouTube', coverUrl: item.coverUrl },
            durationMs: item.durationMs || 0,
            sourceRef: item.sourceRef || { kind: 'online', providerId: 'youtube', mediaId: String(item.id || '') },
        };
    },
    normalizeUser(raw: unknown): ProviderUser {
        const item = raw as any;
        return {
            id: item?.id || 'youtube_user',
            nickname: item?.nickname || 'YouTube Guest',
            avatarUrl: item?.avatarUrl,
        };
    },
    songMetadata: {
        getSongMetadata: createProviderSongMetadata,
    },
    getSongPageUrl(song: SongResult): string | null {
        const mediaId = song.sourceRef?.kind === 'online' ? song.sourceRef.mediaId : String(song.id);
        return mediaId ? `https://www.youtube.com/watch?v=${encodeURIComponent(mediaId)}` : null;
    },
    search: {
        async searchSongs(query: string, limit: number, offset: number) {
            return searchYouTubeMusic(query, limit, offset);
        },
    },
    playback: {
        async getSongDetail(id) {
            const stream = await getYouTubeAudioStream(String(id));
            if (!stream) return null;
            return {
                id: String(id),
                name: stream.details?.title || 'YouTube Track',
                artists: [{ id: 0, name: stream.details?.author || 'YouTube Artist' }],
                album: { id: 0, name: 'YouTube', coverUrl: stream.details?.coverUrl },
                durationMs: stream.details?.durationMs || 0,
                sourceRef: { kind: 'online', providerId: 'youtube', mediaId: String(id) },
            };
        },
        async getAudioSource(song, _quality): Promise<ProviderAudioSource | null> {
            const mediaId = song.sourceRef?.kind === 'online' ? song.sourceRef.mediaId : String(song.id);
            if (!mediaId) return null;
            const stream = await getYouTubeAudioStream(mediaId);
            if (!stream?.url) return null;
            return {
                url: stream.url,
                fetchedAt: Date.now(),
                expiresAt: stream.expiresAt,
                quality: 'standard',
            };
        },
        getAvailability(_song): ProviderSongAvailability {
            return { state: 'playable' };
        },
    },
    lyrics: {
        async getLyrics(song): Promise<ProviderLyricsResult> {
            const title = song.name || '';
            const artist = song.artists?.[0]?.name || '';
            const lrcText = await fetchYouTubeLyrics(title, artist);

            if (!lrcText) {
                return {
                    lyrics: null,
                    mainText: null,
                    wordByWordText: null,
                    translationText: null,
                    romanizationText: null,
                    isPureMusic: false,
                };
            }

            const parsedLyrics = parseLRC(lrcText);
            return {
                lyrics: parsedLyrics,
                mainText: lrcText,
                wordByWordText: null,
                translationText: null,
                romanizationText: null,
                isPureMusic: false,
            };
        },
    },
    catalog: {
        async getPlaylistTracks(id, limit, offset) {
            const playlistId = extractPlaylistId(String(id)) || String(id);
            const pl = await getYouTubePlaylist(playlistId);
            const items = pl?.items || [];
            const paged = items.slice(offset, offset + limit);
            return {
                items: paged,
                total: items.length,
                hasMore: offset + limit < items.length,
                nextOffset: offset + limit,
            };
        },
        async getPlaylistDetail(id, existingCollection) {
            const playlistId = extractPlaylistId(String(id)) || String(id);
            const isLiked = playlistId === 'LM';
            const pl = await getYouTubePlaylist(playlistId);
            if (!pl) return existingCollection || null;
            return {
                providerId: 'youtube',
                id: pl.id,
                name: pl.name || existingCollection?.name || 'Liked Music',
                type: 'playlist',
                coverUrl: pl.coverUrl || existingCollection?.coverUrl || (isLiked ? 'https://www.gstatic.com/youtube/media/ytm/images/pbg/liked-music-@1200.png' : pl.items[0]?.album?.coverUrl),
                description: pl.description || existingCollection?.description || '',
                trackCount: pl.items.length,
                isOwned: isLiked || (existingCollection?.isOwned ?? false),
                isLiked,
            };
        },
        async getAlbumTracks(id, limit = 50, offset = 0) {
            const playlistId = extractPlaylistId(String(id)) || String(id);
            const pl = await getYouTubePlaylist(playlistId);
            const items = pl?.items || [];
            const paged = items.slice(offset, offset + limit);
            return {
                items: paged,
                total: items.length,
                hasMore: offset + limit < items.length,
                nextOffset: offset + limit,
            };
        },
    },
    library: {
        async getUserPlaylists(_userId, limit = 50, offset = 0) {
            const cookie = getStoredYouTubeCookie();
            if (!cookie) return { items: [], total: 0, hasMore: false, nextOffset: 0 };
            return getUserYouTubePlaylists(limit, offset);
        },
        async getLikedSongs(_userId) {
            const cookie = getStoredYouTubeCookie();
            if (!cookie) return [];
            try {
                const pl = await getYouTubePlaylist('LM');
                return pl?.items || [];
            } catch {
                return [];
            }
        },
    },
    recommendations: {
        async getPersonalFm(_options) {
            const songs = await getYouTubeTrendingSongs(50);
            if (songs.length === 0) return [];
            const shuffled = [...songs];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled.slice(0, 30);
        },
        async getDailySongs(_refresh) {
            return getYouTubeTrendingSongs(30);
        },
        async getRecommendedCollections(limit = 20) {
            const page = await getUserYouTubePlaylists(limit, 0);
            return page.items || [];
        },
    },
    auth: {
        async getLoginStatus(): Promise<ProviderUser | null> {
            const cookie = getStoredYouTubeCookie();
            if (!cookie) return null;
            const profile = getStoredYouTubeProfile();
            return {
                id: profile?.id || 'youtube_user',
                nickname: profile?.nickname || 'Tài khoản YouTube',
                avatarUrl: profile?.avatarUrl || undefined,
            };
        },
        async logout(): Promise<void> {
            setStoredYouTubeCookie('');
            clearStoredYouTubeProfile();
        },
    },
};
