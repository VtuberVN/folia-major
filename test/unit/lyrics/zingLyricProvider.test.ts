import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchZingLyrics, searchZingSongs } from '@/utils/lyrics/providers/zingLyricProvider';

describe('Zing MP3 Lyric Provider', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('searches Zing songs and parses response', async () => {
        const mockResponse = {
            data: {
                items: [
                    {
                        suggestions: [
                            {
                                type: 1,
                                id: 'ZZZBIW69',
                                title: 'See Tình',
                                duration: 185,
                                thumb: 'https://photo-resize-zmp3.zmdcdn.me/w165_r1x1_jpeg/cover.jpg',
                                lyricLink: 'https://static-zmp3.zmdcdn.me/lyrics/test.lrc',
                                artists: [{ id: 1, name: 'Hoàng Thùy Linh' }],
                            },
                        ],
                    },
                ],
            },
        };

        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockResponse)));
        vi.stubGlobal('fetch', fetchMock);

        const songs = await searchZingSongs('See Tình', 5);

        expect(songs).toHaveLength(1);
        expect(songs[0].name).toBe('See Tình');
        expect(songs[0].id).toBe('ZZZBIW69');
        expect(songs[0].durationMs).toBe(185000);
        expect(songs[0].artists[0].name).toBe('Hoàng Thùy Linh');
        expect(songs[0].album.coverUrl).toBe('https://photo-resize-zmp3.zmdcdn.me/w600_r1x1_jpeg/cover.jpg');
        expect(songs[0].sourceRef).toEqual({
            kind: 'online',
            providerId: 'zing',
            mediaId: 'ZZZBIW69',
        });
    });

    it('fetches and parses Zing lyrics from direct LRC url', async () => {
        const mockLrc = '[00:12.00] Uầy uầy uây uây\n[00:15.00] Sao mới gặp lần đầu';
        const fetchMock = vi.fn().mockResolvedValue(new Response(mockLrc));
        vi.stubGlobal('fetch', fetchMock);

        const lyrics = await fetchZingLyrics({
            id: 'ZZZBIW69',
            lyricLink: 'https://static-zmp3.zmdcdn.me/lyrics/test.lrc',
        });

        expect(lyrics).not.toBeNull();
        expect(lyrics?.lines.some(l => l.fullText === 'Uầy uầy uây uây')).toBe(true);
        expect(lyrics?.lines.some(l => l.fullText === 'Sao mới gặp lần đầu')).toBe(true);
    });
});
