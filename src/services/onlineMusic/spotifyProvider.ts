// src/services/onlineMusic/spotifyProvider.ts
// Spotify online music provider for Folia.

import type { SongResult, UnifiedSong } from '../../types';
import type {
    OnlineMusicProvider,
    ProviderAudioSource,
    ProviderLyricsResult,
    ProviderPage,
    ProviderSongAvailability,
    ProviderUser,
} from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { createProviderSongMetadata } from '../../utils/songMetadata';
import {
    clearSpotifyAuth,
    getSpotifyClientId,
    getValidSpotifyAccessToken,
} from './spotify/spotifyAuth';
import {
    getSpotifyCurrentUser,
    getSpotifyLikedSongs,
    getSpotifyPlaylistTracks,
    getSpotifyTrackDetail,
    getSpotifyUserPlaylists,
    normalizeSpotifyTrack,
    searchSpotifyTracks,
} from './spotify/spotifyApi';
import { resolveSpotifyAudioSource } from './spotify/spotifyAudioResolver';
import { loadOnlineSongLyrics } from '../onlinePlayback';

export const spotifyProvider: OnlineMusicProvider = {
    id: 'spotify',
    displayName: 'Spotify',
    shortName: 'Spotify',
    getAvailability: () => ({ configured: Boolean(getSpotifyClientId()) }),
    capabilities: {
        search: true,
        playback: true,
        lyrics: true,
        auth: true,
        userLibrary: true,
        playlists: true,
        albums: false,
        artists: false,
        recommendations: false,
        mutations: false,
        wordByWordLyrics: true,
    },
    normalizeSong(raw: unknown): UnifiedSong {
        return normalizeSpotifyTrack(raw);
    },
    normalizeUser(raw: unknown): ProviderUser {
        const item = raw as any;
        return {
            id: item?.id || 'spotify_user',
            nickname: item?.nickname || item?.display_name || 'Spotify User',
            avatarUrl: item?.avatarUrl || item?.images?.[0]?.url,
            vipType: item?.vipType,
        };
    },
    songMetadata: {
        getSongMetadata: createProviderSongMetadata,
    },
    getSongPageUrl(song: SongResult): string | null {
        return song.id ? `https://open.spotify.com/track/${encodeURIComponent(String(song.id))}` : null;
    },
    search: {
        async searchSongs(query: string, limit: number, offset: number) {
            return searchSpotifyTracks(query, limit, offset);
        },
    },
    playback: {
        async getSongDetail(id) {
            return getSpotifyTrackDetail(String(id));
        },
        async getAudioSource(song, quality): Promise<ProviderAudioSource | null> {
            const source = await resolveSpotifyAudioSource(song, quality);
            if (!source) {
                throw new OnlineProviderError(
                    'unavailable',
                    `Không tìm thấy luồng phát khả dụng cho bài hát "${song.name}" trên Spotify.`,
                    'spotify'
                );
            }
            return source;
        },
        getAvailability(_song): ProviderSongAvailability {
            return { state: 'playable' };
        },
    },
    lyrics: {
        async getLyrics(_song): Promise<ProviderLyricsResult> {
            // Lyrics for Spotify tracks are resolved through Folia's autoMatchBestLyric engine
            return {
                lyrics: null,
                mainText: null,
                wordByWordText: null,
                translationText: null,
                romanizationText: null,
                isPureMusic: false,
            };
        },
    },
    library: {
        async getUserPlaylists(_userId, limit, offset) {
            return getSpotifyUserPlaylists(limit, offset);
        },
        async getLikedSongs(_userId) {
            const page = await getSpotifyLikedSongs(50, 0);
            return page.items;
        },
    },
    catalog: {
        async getPlaylistTracks(id, limit, offset) {
            return getSpotifyPlaylistTracks(String(id), limit, offset);
        },
    },
    auth: {
        async getLoginStatus(): Promise<ProviderUser | null> {
            try {
                return await getSpotifyCurrentUser();
            } catch {
                return null;
            }
        },
        async logout(): Promise<void> {
            clearSpotifyAuth();
        },
    },
};
