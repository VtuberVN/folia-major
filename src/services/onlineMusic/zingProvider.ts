// src/services/onlineMusic/zingProvider.ts
// Zing MP3 provider for Folia - provides search, playback streaming, and lyrics.

import type { SongResult, UnifiedSong } from '../../types';
import type {
    OnlineMusicProvider,
    ProviderAudioSource,
    ProviderLyricsResult,
    ProviderSongAvailability,
    ProviderUser,
} from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { createProviderSongMetadata } from '../../utils/songMetadata';
import {
    getStoredZingCookie,
    getUserZingPlaylists,
    getZingLikedSongs,
    getUserZingAlbums,
    getZingRecentSongs,
    getZingAlbumDetail,
    getZingAlbums,
    getZingAudioSource,
    getZingChartSongs,
    getZingHomePlaylists,
    getZingLyric,
    getZingPlaylistDetail,
    getZingPlaylistTracks,
    getZingRadioStations,
    getZingSongDetail,
    getZingTop100Albums,
    getZingUserProfile,
    searchZingSongs,
    setStoredZingCookie,
} from './zingApi';

export const zingProvider: OnlineMusicProvider = {
    id: 'zing',
    displayName: 'Zing MP3',
    shortName: 'Zing MP3',
    getAvailability: () => ({ configured: true }),
    capabilities: {
        search: true,
        playback: true,
        lyrics: true,
        auth: true,
        wordByWordLyrics: true,
        userLibrary: true,
        playlists: true,
        albums: true,
        userAlbums: true,
        artists: false,
        recommendations: true,
        mutations: false,
    },
    normalizeSong(raw: unknown): UnifiedSong {
        const item = raw as any;
        return {
            id: item.id || '',
            name: item.name || item.title || '',
            artists: item.artists || [{ id: 0, name: item.artist || 'Zing MP3' }],
            album: item.album || { id: 0, name: 'Zing MP3' },
            durationMs: item.durationMs || 0,
            sourceRef: item.sourceRef || { kind: 'online', providerId: 'zing', mediaId: String(item.id || '') },
        };
    },
    normalizeUser(raw: unknown): ProviderUser {
        const item = raw as any;
        return {
            id: item?.id || 'zing_user',
            nickname: item?.nickname || 'Tài khoản Zing MP3',
            avatarUrl: item?.avatarUrl,
            vipType: item?.vipType ?? 0,
        };
    },
    songMetadata: {
        getSongMetadata: createProviderSongMetadata,
    },
    getSongPageUrl(song: SongResult): string | null {
        return song.id ? `https://zingmp3.vn/bai-hat/${encodeURIComponent(String(song.id))}.html` : null;
    },
    search: {
        async searchSongs(query: string, limit: number, offset: number) {
            const items = await searchZingSongs(query, limit);
            return {
                items,
                total: items.length,
                hasMore: false,
                nextOffset: offset + items.length,
            };
        },
    },
    playback: {
        async getSongDetail(id) {
            return getZingSongDetail(String(id));
        },
        async getAudioSource(song, quality): Promise<ProviderAudioSource | null> {
            const mediaId = song.sourceRef?.kind === 'online' ? song.sourceRef.mediaId : String(song.id);
            let stream: any = null;
            try {
                stream = await getZingAudioSource(mediaId, quality);
                if (stream && stream.url && !stream.isVipOnly) {
                    return {
                        url: stream.url,
                        fetchedAt: Date.now(),
                        quality: stream.quality,
                    };
                }
            } catch (err) {
                console.warn('[ZingProvider] Stream retrieval failed:', err);
            }

            if (stream?.isVipOnly || song.fee === 1) {
                throw new OnlineProviderError(
                    'vip-only',
                    'VIP Zing MP3: song is VIP only',
                    'zing'
                );
            }

            throw new OnlineProviderError(
                'unavailable',
                'Song unavailable on Zing MP3',
                'zing'
            );
        },
        getAvailability(_song): ProviderSongAvailability {
            return { state: 'playable' };
        },
    },
    library: {
        async getUserPlaylists(_userId, limit, offset) {
            const userPage = await getUserZingPlaylists(limit, offset);
            if (userPage.items.length > 0) return userPage;
            const items = await getZingHomePlaylists();
            if (items.length === 0) {
                return getZingTop100Albums(limit, offset);
            }
            const paged = items.slice(offset, offset + limit);
            return {
                items: paged,
                total: items.length,
                hasMore: offset + limit < items.length,
                nextOffset: offset + limit,
            };
        },
        async getLikedSongs(_userId) {
            return getZingLikedSongs(100, 0);
        },
        async getUserAlbums(_userId, limit, offset) {
            const userAlbums = await getUserZingAlbums(limit, offset);
            if (userAlbums.items.length > 0) return userAlbums;
            return getZingAlbums(limit, offset);
        },
    },
    recommendations: {
        // Pseudo-FM fallback: Zing has no personal FM API like NetEase.
        // We shuffle chart songs to simulate variety in the radio experience.
        async getPersonalFm(_options) {
            const songs = await getZingChartSongs(50);
            if (songs.length === 0) return [];
            const shuffled = [...songs];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled.slice(0, 30);
        },
        async getDailySongs(_refresh) {
            const recent = await getZingRecentSongs(30);
            if (recent.length > 0) return recent;
            return getZingChartSongs(30);
        },
        async getRecommendedCollections(limit = 20) {
            const [top100Page, radioStations] = await Promise.all([
                getZingTop100Albums(limit, 0),
                getZingRadioStations(10),
            ]);
            if (top100Page.items.length > 0 || radioStations.length > 0) {
                return [...radioStations, ...top100Page.items].slice(0, limit);
            }
            return getZingHomePlaylists();
        },
    },
    catalog: {
        async getPlaylistTracks(id, limit = 50, offset = 0) {
            if (id === 'zing_liked_songs' || id === 'liked') {
                const songs = await getZingLikedSongs(limit, offset);
                return {
                    items: songs,
                    total: songs.length,
                    hasMore: offset + limit < songs.length,
                    nextOffset: offset + limit,
                };
            }
            if (id === 'zing_recent_songs' || id === 'recent') {
                const songs = await getZingRecentSongs(limit);
                return {
                    items: songs,
                    total: songs.length,
                    hasMore: false,
                    nextOffset: songs.length,
                };
            }
            return getZingPlaylistTracks(String(id), limit, offset);
        },
        async getPlaylistDetail(id, existingCollection) {
            return getZingPlaylistDetail(String(id), existingCollection);
        },
        async getAlbumTracks(id, limit, offset) {
            return getZingPlaylistTracks(String(id), limit, offset);
        },
        async getAlbumDetail(id, existingCollection) {
            const detail = await getZingAlbumDetail(String(id));
            return detail || existingCollection || null;
        },
    },
    lyrics: {
        async getLyrics(song): Promise<ProviderLyricsResult> {
            const mediaId = song.sourceRef?.kind === 'online' ? song.sourceRef.mediaId : String(song.id);
            const lyrics = await getZingLyric(mediaId);
            return {
                lyrics,
                mainText: null,
                wordByWordText: null,
                translationText: null,
                romanizationText: null,
                isPureMusic: false,
            };
        },
    },
    auth: {
        async getLoginStatus(): Promise<ProviderUser | null> {
            const cookie = getStoredZingCookie();
            if (!cookie) return null;
            return getZingUserProfile();
        },
        async logout(): Promise<void> {
            setStoredZingCookie('');
        },
    },
};
