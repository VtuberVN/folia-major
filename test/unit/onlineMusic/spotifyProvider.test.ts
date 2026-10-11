// test/unit/onlineMusic/spotifyProvider.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { spotifyProvider } from '@/services/onlineMusic/spotifyProvider';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import * as spotifyAuth from '@/services/onlineMusic/spotify/spotifyAuth';
import * as spotifyApi from '@/services/onlineMusic/spotify/spotifyApi';
import * as spotifyResolver from '@/services/onlineMusic/spotify/spotifyAudioResolver';

describe('spotifyProvider', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('is registered in providerRegistry', () => {
        const provider = getOnlineMusicProvider('spotify');
        expect(provider).toBeDefined();
        expect(provider?.id).toBe('spotify');
        expect(provider?.displayName).toBe('Spotify');
    });

    it('has required capabilities enabled', () => {
        expect(spotifyProvider.capabilities.playback).toBe(true);
        expect(spotifyProvider.capabilities.search).toBe(true);
        expect(spotifyProvider.capabilities.userLibrary).toBe(true);
        expect(spotifyProvider.capabilities.playlists).toBe(true);
        expect(spotifyProvider.capabilities.auth).toBe(true);
    });

    it('searches songs via spotifyApi', async () => {
        const mockSong = {
            id: '4cOdK2wGLETKBW3PvgPWqT',
            name: 'Never Gonna Give You Up',
            artists: [{ id: 1, name: 'Rick Astley' }],
            album: { id: 1, name: 'Whenever You Need Somebody' },
            durationMs: 213000,
            sourceRef: { kind: 'online' as const, providerId: 'spotify', mediaId: '4cOdK2wGLETKBW3PvgPWqT' },
        };

        vi.spyOn(spotifyApi, 'searchSpotifyTracks').mockResolvedValue({
            items: [mockSong],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        });

        const searchResult = await spotifyProvider.search?.searchSongs('rick roll', 10, 0);
        expect(searchResult?.items).toHaveLength(1);
        expect(searchResult?.items[0].name).toBe('Never Gonna Give You Up');
    });

    it('resolves audio source via spotifyAudioResolver', async () => {
        const song = {
            id: 'spotify123',
            name: 'Cơn Mưa Ngang Qua',
            artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
            album: { id: 1, name: 'm-tp M-TP' },
            durationMs: 234000,
            sourceRef: { kind: 'online' as const, providerId: 'spotify', mediaId: 'spotify123' },
        };

        vi.spyOn(spotifyResolver, 'resolveSpotifyAudioSource').mockResolvedValue({
            url: 'https://stream.example.com/audio.mp3',
            quality: 'standard',
            fetchedAt: 123456789,
        });

        const audio = await spotifyProvider.playback?.getAudioSource(song, 'standard');
        expect(audio?.url).toBe('https://stream.example.com/audio.mp3');
        expect(audio?.quality).toBe('standard');
    });

    it('generates valid OAuth authorization URL', () => {
        const authUrl = spotifyAuth.getSpotifyAuthUrl('http://localhost:8888/callback');
        expect(authUrl).toContain('https://accounts.spotify.com/authorize');
        expect(authUrl).toContain('response_type=code');
        expect(authUrl).toContain('user-read-private');
    });

    it('manages spotify user token correctly', () => {
        spotifyAuth.setSpotifyUserToken('test_token_123', 3600);
        expect(spotifyAuth.getStoredSpotifyAccessToken()).toBe('test_token_123');

        spotifyAuth.clearSpotifyAuth();
        expect(spotifyAuth.getStoredSpotifyAccessToken()).toBe('');
    });
});
