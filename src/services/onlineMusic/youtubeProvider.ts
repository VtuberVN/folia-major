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
import { searchYouTubeMusic } from './youtube/youtubeApi';

export const youtubeProvider: OnlineMusicProvider = {
    id: 'youtube',
    displayName: 'YouTube Music',
    shortName: 'YouTube',
    getAvailability: () => ({ configured: true }),
    capabilities: {
        search: true,
        playback: true,
        lyrics: true,
        auth: false,
        userLibrary: false,
        playlists: false,
        albums: false,
        artists: false,
        recommendations: false,
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
        async getSongDetail(_id) {
            return null;
        },
        async getAudioSource(_song, _quality): Promise<ProviderAudioSource | null> {
            return null;
        },
        getAvailability(_song): ProviderSongAvailability {
            return { state: 'playable' };
        },
    },
    lyrics: {
        async getLyrics(_song): Promise<ProviderLyricsResult> {
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
};
