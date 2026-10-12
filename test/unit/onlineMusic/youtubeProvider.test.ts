import { describe, expect, it, vi } from 'vitest';
import { youtubeProvider } from '@/services/onlineMusic/youtubeProvider';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import { searchYouTubeMusic, getYouTubeAudioStream, extractVideoId } from '@/services/onlineMusic/youtube/youtubeApi';

describe('youtubeProvider', () => {
    it('is registered in providerRegistry by default', () => {
        const registered = getOnlineMusicProvider('youtube');
        expect(registered).toBe(youtubeProvider);
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

    it('correctly extracts video ID from diverse URL formats and raw IDs', () => {
        expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
        expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
        expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
        expect(extractVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=shared')).toBe('dQw4w9WgXcQ');
        expect(extractVideoId('')).toBeNull();
        expect(extractVideoId(null)).toBeNull();
    });

    it('prioritizes progressive format (ITAG 18) over adaptive formats for reliable audio playback', async () => {
        const mockPlayerResponse = {
            playabilityStatus: { status: 'OK' },
            videoDetails: {
                title: 'Test Song Title',
                author: 'Test Artist Name',
                lengthSeconds: '210',
                thumbnail: {
                    thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
                },
            },
            streamingData: {
                formats: [
                    {
                        itag: 18,
                        mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
                        url: 'https://rr.googlevideo.com/videoplayback?itag=18&test=progressive',
                    },
                ],
                adaptiveFormats: [
                    {
                        itag: 251,
                        mimeType: 'audio/webm; codecs="opus"',
                        url: 'https://rr.googlevideo.com/videoplayback?itag=251&test=adaptive',
                    },
                ],
            },
        };

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            const urlStr = String(url);
            if (urlStr.includes('youtubei/v1/player')) {
                return {
                    ok: true,
                    json: async () => mockPlayerResponse,
                } as any;
            }
            return { ok: false } as any;
        });

        try {
            const stream = await getYouTubeAudioStream('dQw4w9WgXcQ');
            expect(stream).not.toBeNull();
            expect(stream?.url).toContain('itag=18');
            expect(stream?.details?.title).toBe('Test Song Title');
            expect(stream?.details?.author).toBe('Test Artist Name');
            expect(stream?.details?.durationMs).toBe(210000);

            // Test getSongDetail integration
            const detail = await youtubeProvider.playback?.getSongDetail('dQw4w9WgXcQ');
            expect(detail?.name).toBe('Test Song Title');
            expect(detail?.artists[0]?.name).toBe('Test Artist Name');
            expect(detail?.durationMs).toBe(210000);

            // Test getAudioSource integration
            const source = await youtubeProvider.playback?.getAudioSource({
                id: 'dQw4w9WgXcQ',
                sourceRef: { kind: 'online', providerId: 'youtube', mediaId: 'dQw4w9WgXcQ' },
            } as any, 'standard');
            expect(source?.url).toContain('itag=18');
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('extracts playlist ID from various playlist URLs and identifiers', async () => {
        const { extractPlaylistId } = await import('@/services/onlineMusic/youtube/youtubeApi');
        expect(extractPlaylistId('https://www.youtube.com/playlist?list=PL4fGSIF4CNYfE31oN_r16b8zN51bVq04m')).toBe('PL4fGSIF4CNYfE31oN_r16b8zN51bVq04m');
        expect(extractPlaylistId('https://music.youtube.com/playlist?list=RDCLAK5uy_kfdxYj6m8oT43GvR4l2p7Jm')).toBe('RDCLAK5uy_kfdxYj6m8oT43GvR4l2p7Jm');
        expect(extractPlaylistId('PL4fGSIF4CNYfE31oN_r16b8zN51bVq04m')).toBe('PL4fGSIF4CNYfE31oN_r16b8zN51bVq04m');
        expect(extractPlaylistId('VLPL4fGSIF4CNYfE31oN_r16b8zN51bVq04m')).toBe('PL4fGSIF4CNYfE31oN_r16b8zN51bVq04m');
        expect(extractPlaylistId('dQw4w9WgXcQ')).toBeNull();
    });

    it('loads playlist tracks via getPlaylistTracks catalog', async () => {
        const mockBrowseResponse = {
            sidebar: {
                playlistSidebarRenderer: {
                    items: [
                        {
                            playlistSidebarPrimaryInfoRenderer: {
                                title: { runs: [{ text: 'V-Pop Hits 2026' }] },
                                thumbnailRenderer: {
                                    playlistVideoThumbnailRenderer: {
                                        thumbnail: { thumbnails: [{ url: 'https://example.com/playlist.jpg' }] },
                                    },
                                },
                            },
                        },
                    ],
                },
            },
            contents: {
                twoColumnBrowseResultsRenderer: {
                    tabs: [
                        {
                            tabRenderer: {
                                content: {
                                    sectionListRenderer: {
                                        contents: [
                                            {
                                                itemSectionRenderer: {
                                                    contents: [
                                                        {
                                                            playlistVideoListRenderer: {
                                                                contents: [
                                                                    {
                                                                        playlistVideoRenderer: {
                                                                            videoId: 'track123',
                                                                            title: { runs: [{ text: 'Bài Hát 1' }] },
                                                                            shortBylineText: { runs: [{ text: 'Ca Sĩ 1' }] },
                                                                            lengthSeconds: '200',
                                                                            thumbnail: { thumbnails: [{ url: 'https://example.com/track1.jpg' }] },
                                                                        },
                                                                    },
                                                                ],
                                                            },
                                                        },
                                                    ],
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        };

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: string | URL | Request) => {
            const urlStr = String(url);
            if (urlStr.includes('youtubei/v1/browse')) {
                return {
                    ok: true,
                    json: async () => mockBrowseResponse,
                } as any;
            }
            return { ok: false } as any;
        });

        try {
            const page = await youtubeProvider.catalog?.getPlaylistTracks?.('PL4fGSIF4CNYfE31oN_r16b8zN51bVq04m', 20, 0);
            expect(page).toBeDefined();
            expect(page?.items).toHaveLength(1);
            expect(page?.items[0].name).toBe('Bài Hát 1');
            expect(page?.items[0].artists[0].name).toBe('Ca Sĩ 1');
            expect(page?.items[0].durationMs).toBe(200000);
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('handles auth login status and logout with cookie storage', async () => {
        const { setStoredYouTubeCookie } = await import('@/services/onlineMusic/youtube/youtubeApi');
        setStoredYouTubeCookie('');
        let status = await youtubeProvider.auth?.getLoginStatus();
        expect(status).toBeNull();

        setStoredYouTubeCookie('SAPISID=12345; LOGIN_INFO=abcde');
        status = await youtubeProvider.auth?.getLoginStatus();
        expect(status).not.toBeNull();
        expect(status?.id).toBe('youtube_user');

        await youtubeProvider.auth?.logout();
        status = await youtubeProvider.auth?.getLoginStatus();
        expect(status).toBeNull();
    });

    it('implements recommendations and getLikedSongs', async () => {
        expect(youtubeProvider.capabilities.recommendations).toBe(true);
        expect(youtubeProvider.recommendations).toBeDefined();

        const { setStoredYouTubeCookie } = await import('@/services/onlineMusic/youtube/youtubeApi');
        setStoredYouTubeCookie('');

        const unauthLiked = await youtubeProvider.library?.getLikedSongs?.('youtube_user');
        expect(unauthLiked).toEqual([]);

        const recs = await youtubeProvider.recommendations?.getRecommendedCollections?.(10);
        expect(Array.isArray(recs)).toBe(true);
    });

    it('handles safeStorage cookie encryption and fallback for YouTube', async () => {
        const { getStoredYouTubeCookie, setStoredYouTubeCookie } = await import('@/services/onlineMusic/youtube/youtubeApi');

        const prevWindow = (globalThis as any).window;
        const prevLocalStorage = (globalThis as any).localStorage;

        const store: Record<string, string> = {};
        (globalThis as any).localStorage = {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
        };

        (globalThis as any).window = {
            electron: {
                safeStorageDecryptSync: vi.fn().mockReturnValue('mock-youtube-cookie'),
                safeStorageEncrypt: vi.fn().mockResolvedValue('mock-encrypted-cookie-base64'),
            },
        };

        setStoredYouTubeCookie('');
        expect(getStoredYouTubeCookie()).toBe('');

        // Decrypt fail must not leak ciphertext
        (globalThis as any).window.electron.safeStorageDecryptSync = vi.fn().mockReturnValue(null);
        (globalThis as any).localStorage.setItem('folia_youtube_cookie', 'enc:corrupted_raw_ciphertext');
        expect(getStoredYouTubeCookie()).toBe('');

        (globalThis as any).window = prevWindow;
        (globalThis as any).localStorage = prevLocalStorage;
    });
});
