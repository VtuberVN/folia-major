import { describe, expect, it, vi } from 'vitest';
import { youtubeProvider } from '@/services/onlineMusic/youtubeProvider';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import { searchYouTubeMusic } from '@/services/onlineMusic/youtube/youtubeApi';

describe('youtubeProvider', () => {
    it('is properly registered and has correct capabilities', () => {
        const registered = getOnlineMusicProvider('youtube');
        expect(registered).toBeDefined();
        expect(registered?.id).toBe('youtube');
        expect(registered?.displayName).toBe('YouTube Music');
        expect(registered?.shortName).toBe('YouTube');
        expect(registered?.capabilities.search).toBe(true);
        expect(registered?.capabilities.playback).toBe(true);
        expect(registered?.capabilities.auth).toBe(false);
    });

    it('generates correct song page url', () => {
        const url = youtubeProvider.getSongPageUrl?.({
            id: 'xTvyyoF_LZY',
            name: 'Shape of You',
            artists: [{ id: 0, name: 'Ed Sheeran' }],
            duration: 233,
            sourceRef: { kind: 'online', providerId: 'youtube', mediaId: 'xTvyyoF_LZY' },
        } as any);

        expect(url).toBe('https://www.youtube.com/watch?v=xTvyyoF_LZY');
    });

    it('reports song availability as playable', () => {
        const avail = youtubeProvider.playback?.getAvailability?.({} as any);
        expect(avail?.state).toBe('playable');
    });

    it('normalizes raw track to UnifiedSong', () => {
        const raw = {
            id: 'vid123',
            title: 'Test Song',
            artist: 'Test Artist',
            coverUrl: 'https://example.com/thumb.jpg',
            durationMs: 180000,
        };

        const song = youtubeProvider.normalizeSong(raw);
        expect(song.id).toBe('vid123');
        expect(song.name).toBe('Test Song');
        expect(song.artists[0]?.name).toBe('Test Artist');
        expect(song.sourceRef.kind).toBe('online');
        if (song.sourceRef.kind === 'online') {
            expect(song.sourceRef.providerId).toBe('youtube');
            expect(song.sourceRef.mediaId).toBe('vid123');
        }
    });

    it('returns empty result when search query is empty', async () => {
        const result = await searchYouTubeMusic('');
        expect(result.items).toEqual([]);
        expect(result.total).toBe(0);
        expect(result.hasMore).toBe(false);
    });
});
