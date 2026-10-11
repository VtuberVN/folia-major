// src/services/onlineMusic/spotify/spotifyApi.ts
// Spotify Web API client for Folia.

import type { UnifiedSong } from '../../../types';
import type { ProviderCollection, ProviderPage, ProviderUser } from '../../../types/onlineMusic';
import { getValidSpotifyAccessToken } from './spotifyAuth';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

async function spotifyFetch<T>(endpoint: string): Promise<T | null> {
    try {
        const token = await getValidSpotifyAccessToken();
        const res = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
            },
        });

        if (res.status === 401) {
            console.warn('[SpotifyApi] Token expired or invalid (401)');
            return null;
        }

        if (!res.ok) {
            console.warn(`[SpotifyApi] Request to ${endpoint} failed with ${res.status}`);
            return null;
        }

        return await res.json() as T;
    } catch (err) {
        console.warn(`[SpotifyApi] Network error requesting ${endpoint}:`, err);
        return null;
    }
}

export function normalizeSpotifyTrack(item: any): UnifiedSong {
    const artists = (item.artists || []).map((a: any, idx: number) => ({
        id: a.id || idx,
        name: a.name || 'Various Artists',
    }));

    const images = item.album?.images || [];
    const coverUrl = images.length > 0 ? (images[0]?.url || images[1]?.url) : undefined;

    return {
        id: item.id || '',
        name: item.name || '',
        artists: artists.length > 0 ? artists : [{ id: 0, name: 'Spotify' }],
        album: {
            id: item.album?.id || 0,
            name: item.album?.name || 'Spotify',
            coverUrl,
        },
        durationMs: item.duration_ms || 0,
        sourceRef: {
            kind: 'online',
            providerId: 'spotify',
            mediaId: item.id || '',
            providerData: {
                isrc: item.external_ids?.isrc,
                uri: item.uri,
                previewUrl: item.preview_url,
            },
        },
    };
}

/**
 * Searches tracks on Spotify.
 */
export async function searchSpotifyTracks(
    query: string,
    limit: number = 20,
    offset: number = 0,
): Promise<ProviderPage<UnifiedSong>> {
    if (!query || !query.trim()) {
        return { items: [], total: 0, hasMore: false, nextOffset: 0 };
    }

    const data = await spotifyFetch<any>(
        `/search?q=${encodeURIComponent(query.trim())}&type=track&limit=${limit}&offset=${offset}`
    );

    if (!data?.tracks?.items) {
        return { items: [], total: 0, hasMore: false, nextOffset: offset };
    }

    const items = data.tracks.items.map(normalizeSpotifyTrack);
    const total = data.tracks.total || items.length;

    return {
        items,
        total,
        hasMore: offset + items.length < total,
        nextOffset: offset + items.length,
    };
}

/**
 * Gets details for a single Spotify track.
 */
export async function getSpotifyTrackDetail(trackId: string): Promise<UnifiedSong | null> {
    const data = await spotifyFetch<any>(`/tracks/${encodeURIComponent(trackId)}`);
    if (!data || !data.id) return null;
    return normalizeSpotifyTrack(data);
}

/**
 * Gets the current authenticated Spotify user profile.
 */
export async function getSpotifyCurrentUser(): Promise<ProviderUser | null> {
    const data = await spotifyFetch<any>('/me');
    if (!data || !data.id) return null;

    const images = data.images || [];
    const avatarUrl = images[0]?.url;

    return {
        id: data.id,
        nickname: data.display_name || data.id,
        avatarUrl,
        vipType: data.product === 'premium' ? 1 : 0,
    };
}

/**
 * Gets playlists owned or followed by the current user.
 */
export async function getSpotifyUserPlaylists(
    limit: number = 20,
    offset: number = 0,
): Promise<ProviderPage<ProviderCollection>> {
    const data = await spotifyFetch<any>(`/me/playlists?limit=${limit}&offset=${offset}`);
    if (!data?.items) {
        return { items: [], total: 0, hasMore: false, nextOffset: offset };
    }

    const items: ProviderCollection[] = data.items.map((p: any) => ({
        providerId: 'spotify',
        id: p.id,
        type: 'playlist',
        name: p.name || 'Playlist',
        coverUrl: p.images?.[0]?.url,
        description: p.description || '',
        trackCount: p.tracks?.total || 0,
        isOwned: p.owner?.id ? true : false,
    }));

    const total = data.total || items.length;
    return {
        items,
        total,
        hasMore: offset + items.length < total,
        nextOffset: offset + items.length,
    };
}

/**
 * Gets tracks from a specific Spotify playlist.
 */
export async function getSpotifyPlaylistTracks(
    playlistId: string,
    limit: number = 50,
    offset: number = 0,
): Promise<ProviderPage<UnifiedSong>> {
    const data = await spotifyFetch<any>(
        `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}&offset=${offset}`
    );

    if (!data?.items) {
        return { items: [], total: 0, hasMore: false, nextOffset: offset };
    }

    const items: UnifiedSong[] = [];
    for (const item of data.items) {
        if (item.track && item.track.id) {
            items.push(normalizeSpotifyTrack(item.track));
        }
    }

    const total = data.total || items.length;
    return {
        items,
        total,
        hasMore: offset + items.length < total,
        nextOffset: offset + items.length,
    };
}

/**
 * Gets tracks saved in the user's "Liked Songs" library.
 */
export async function getSpotifyLikedSongs(
    limit: number = 50,
    offset: number = 0,
): Promise<ProviderPage<UnifiedSong>> {
    const data = await spotifyFetch<any>(`/me/tracks?limit=${limit}&offset=${offset}`);
    if (!data?.items) {
        return { items: [], total: 0, hasMore: false, nextOffset: offset };
    }

    const items: UnifiedSong[] = [];
    for (const item of data.items) {
        if (item.track && item.track.id) {
            items.push(normalizeSpotifyTrack(item.track));
        }
    }

    const total = data.total || items.length;
    return {
        items,
        total,
        hasMore: offset + items.length < total,
        nextOffset: offset + items.length,
    };
}
