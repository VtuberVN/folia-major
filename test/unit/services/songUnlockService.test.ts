import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unlockBodianUrl, unlockNeteaseUrl, getUnlockAudioSource } from '@/services/songUnlockService';

const unwrap = (input: string): string => {
    if (input.includes('/api/unlock-proxy')) {
        const target = new URL(input, 'http://localhost').searchParams.get('url');
        return target ? decodeURIComponent(target) : input;
    }
    return input;
};

describe('songUnlockService', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.stubGlobal('fetch', vi.fn());
    });

    describe('unlockBodianUrl sign', () => {
        it('includes the timestamp in the signed request string (kuwotest sign)', async () => {
            const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
                const url = unwrap(String(input));
                if (url.includes('/r.s?')) {
                    return new Response(JSON.stringify({
                        content: [{}, {
                            musicpage: {
                                abslist: [{ SONGNAME: '小幸运', ARTIST: '田馥甄', MUSICRID: 'MUSIC_6717048' }],
                            },
                        }],
                    }), { status: 200 });
                }
                if (url.includes('/api/service/advert/watch')) {
                    return new Response(JSON.stringify({ code: 200 }), { status: 200 });
                }
                if (url.includes('/api/play/music/v2/audioUrl')) {
                    const signedUrl = new URL(url);
                    const sign = signedUrl.searchParams.get('sign');
                    const timestamp = signedUrl.searchParams.get('timestamp');
                    const urlWithoutSign = url.split('&sign=')[0];
                    const pathname = new URL(urlWithoutSign).pathname;
                    const filtered = urlWithoutSign
                        .substring(urlWithoutSign.indexOf('?') + 1)
                        .replace(/[^a-zA-Z0-9]/g, '')
                        .split('')
                        .sort()
                        .join('');
                    const { default: md5 } = await import('blueimp-md5');
                    const expected = md5(`kuwotest${filtered}${pathname}`);
                    expect(sign).toBe(expected);
                    expect(timestamp).toBeTruthy();
                    return new Response(JSON.stringify({
                        data: { audioUrl: 'http://bd-er.kuwo.cn/example.mp3?from=bodian' },
                    }), { status: 200 });
                }
                return new Response(JSON.stringify({}), { status: 404 });
            });
            vi.stubGlobal('fetch', fetchMock);

            const result = await unlockBodianUrl('小幸运 - 田馥甄', '小幸运', '田馥甄');

            expect(result.code).toBe(200);
            expect(result.url).toContain('bd-er.kuwo.cn');
        });
    });

    describe('unlockNeteaseUrl', () => {
        it('returns the url when the third-party api responds', async () => {
            const fetchMock = vi.fn(async () =>
                new Response(JSON.stringify({ url: 'https://m801.music.126.net/example.flac' }), { status: 200 }),
            );
            vi.stubGlobal('fetch', fetchMock);

            const result = await unlockNeteaseUrl('29764530');
            expect(result.code).toBe(200);
            expect(result.url).toContain('m801.music.126.net');
        });

        it('falls back to 404 on failure', async () => {
            vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
            const result = await unlockNeteaseUrl('29764530');
            expect(result.code).toBe(404);
        });
    });

    describe('getUnlockAudioSource', () => {
        it('tries enabled servers in order and returns the first match', async () => {
            const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
                const url = unwrap(String(input));
                if (url.includes('/r.s?')) {
                    return new Response(JSON.stringify({
                        content: [{}, { musicpage: { abslist: [{ SONGNAME: '晴天', ARTIST: '周杰伦', MUSICRID: 'MUSIC_228908' }] } }],
                    }), { status: 200 });
                }
                if (url.includes('/api/service/advert/watch')) {
                    return new Response(JSON.stringify({ code: 200 }), { status: 200 });
                }
                if (url.includes('/api/play/music/v2/audioUrl')) {
                    return new Response(JSON.stringify({ data: { audioUrl: 'http://bd-er.kuwo.cn/ok.mp3' } }), { status: 200 });
                }
                return new Response(JSON.stringify({}), { status: 404 });
            });
            vi.stubGlobal('fetch', fetchMock);

            const song = {
                id: '228908',
                name: '晴天',
                artists: [{ name: '周杰伦' }],
            } as any;

            const result = await getUnlockAudioSource(song, [
                { key: 'netease', enabled: false },
                { key: 'bodian', enabled: true },
                { key: 'kuwo', enabled: false },
            ]);

            expect(result.code).toBe(200);
            expect(result.source).toBe('bodian');
        });
    });
});
