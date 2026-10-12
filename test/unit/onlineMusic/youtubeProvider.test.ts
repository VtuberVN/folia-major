import { describe, expect, it, vi } from 'vitest';
import { youtubeProvider } from '@/services/onlineMusic/youtubeProvider';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import { searchYouTubeMusic } from '@/services/onlineMusic/youtube/youtubeApi';

describe('youtubeProvider', () => {
    it('is not registered in providerRegistry by default', () => {
        const registered = getOnlineMusicProvider('youtube');
        expect(registered).toBeNull();
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

    it('fetches synchronized lyrics from LRCLIB and parses into LyricData', async () => {
        const mockLrc = '[00:10.00]First line\n[00:20.00]Second line';
        const mockFetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('lrclib.net')) {
                return {
                    ok: true,
                    json: async () => [{
                        id: 1,
                        trackName: 'Test Song',
                        artistName: 'Test Artist',
                        syncedLyrics: mockLrc,
                    }],
                };
            }
            return { ok: false };
        });

        const lyricsResult = await youtubeProvider.lyrics?.getLyrics({
            id: 'vid123',
            name: 'Test Song',
            artists: [{ id: 0, name: 'Test Artist' }],
        } as any);

        // Note: fetchYouTubeLyrics uses global fetch by default or fetchFn
        // Here we test youtubeProvider.lyrics.getLyrics directly with global fetch spy
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as any);
        try {
            const res = await youtubeProvider.lyrics?.getLyrics({
                id: 'vid123',
                name: 'Test Song',
                artists: [{ id: 0, name: 'Test Artist' }],
            } as any);

            expect(res?.mainText).toBe(mockLrc);
            const line = res?.lyrics?.lines.find(l => l.fullText === 'First line');
            expect(line).toBeDefined();
            expect(line?.fullText).toBe('First line');
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('falls back to Zing MP3 when LRCLIB has no lyrics', async () => {
        const mockLrc = '[00:05.00]Zing MP3 synced lyric line';
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            const urlStr = String(url);
            if (urlStr.includes('lrclib.net')) {
                return {
                    ok: true,
                    json: async () => [],
                } as any;
            }
            if (urlStr.includes('ac.zingmp3.vn')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: {
                            items: [{
                                suggestions: [{
                                    lyricLink: 'https://example.com/lyric.lrc',
                                }],
                            }],
                        },
                    }),
                } as any;
            }
            if (urlStr === 'https://example.com/lyric.lrc') {
                return {
                    ok: true,
                    text: async () => mockLrc,
                } as any;
            }
            return { ok: false } as any;
        });

        try {
            const res = await youtubeProvider.lyrics?.getLyrics({
                id: 'zing123',
                name: 'Bai Hat Viet',
                artists: [{ id: 0, name: 'Ca Si Viet' }],
            } as any);

            expect(res?.mainText).toBe(mockLrc);
            const line = res?.lyrics?.lines.find(l => l.fullText.includes('Zing MP3'));
            expect(line).toBeDefined();
            expect(line?.fullText).toBe('Zing MP3 synced lyric line');
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
