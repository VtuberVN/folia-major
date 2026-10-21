// test/unit/onlineMusic/zingProvider.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { zingProvider, normalizeZingUser } from '@/services/onlineMusic/zingProvider';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import * as zingApi from '@/services/onlineMusic/zingApi';
import { searchZingSongs as searchZingLyricSongs } from '@/utils/lyrics/providers/zingLyricProvider';

describe('zingProvider', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('is registered in providerRegistry', () => {
        const provider = getOnlineMusicProvider('zing');
        expect(provider).toBeDefined();
        expect(provider?.id).toBe('zing');
        expect(provider?.displayName).toBe('Zing MP3');
    });

    it('has required capabilities enabled', () => {
        expect(zingProvider.capabilities.playback).toBe(true);
        expect(zingProvider.capabilities.search).toBe(true);
        expect(zingProvider.capabilities.lyrics).toBe(true);
    });

    it('gets audio source successfully for non-VIP songs', async () => {
        vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValue({
            url: 'https://cdn.zingmp3.vn/mock-audio.mp3',
            quality: 'standard',
        });

        const song = {
            id: 'ZW78DIEO',
            name: 'Lạc Trôi',
            artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
            album: { id: 1, name: 'Lạc Trôi' },
            durationMs: 233000,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZW78DIEO' },
        };

        const result = await zingProvider.playback?.getAudioSource(song, 'standard');
        expect(result).toBeDefined();
        expect(result?.url).toBe('https://cdn.zingmp3.vn/mock-audio.mp3');
        expect(result?.quality).toBe('standard');
    });

    it('throws vip-only error when song is VIP only', async () => {
        vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValue({
            url: '',
            quality: 'standard',
            isVipOnly: true,
        });

        const song = {
            id: 'ZZAF09FD',
            name: 'VIP Song',
            artists: [{ id: 1, name: 'VIP Artist' }],
            album: { id: 1, name: 'VIP Album' },
            durationMs: 200000,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZZAF09FD' },
        };

        await expect(zingProvider.playback?.getAudioSource(song, 'standard')).rejects.toThrow(
            /VIP Zing MP3/
        );
    });

    it('throws vip-only error when song has fee === 1 even if stream returns null', async () => {
        vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValue(null);

        const song = {
            id: 'ZZZBIW69',
            name: 'See Tình',
            artists: [{ id: 1, name: 'Hoàng Thùy Linh' }],
            album: { id: 1, name: 'LINK' },
            durationMs: 180000,
            fee: 1,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZZZBIW69' },
        };

        await expect(zingProvider.playback?.getAudioSource(song, 'standard')).rejects.toThrow(
            /VIP Zing MP3/
        );
    });

    it('fetches lyrics via zingApi', async () => {
        const mockLyricData: any = {
            lines: [{ startTime: 1000, endTime: 3000, words: [], fullText: 'Người theo hương hoa mây mù giăng lối' }],
            format: 'lrc' as const,
        };
        vi.spyOn(zingApi, 'getZingLyric').mockResolvedValue(mockLyricData);

        const song = {
            id: 'ZW78DIEO',
            name: 'Lạc Trôi',
            artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
            album: { id: 1, name: 'Lạc Trôi' },
            durationMs: 233000,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZW78DIEO' },
        };

        const lyrics = await zingProvider.lyrics?.getLyrics(song);
        expect(lyrics?.lyrics).toEqual(mockLyricData);
    });

    it('manages cookie in auth correctly and defaults to non-VIP', async () => {
        expect(await zingProvider.auth?.getLoginStatus()).toBeNull();

        zingApi.setStoredZingCookie('zpsid=test12345');
        const status = await zingProvider.auth?.getLoginStatus();
        expect(status?.nickname).toMatch(/^(Tài khoản Zing MP3|Zing MP3 Account)$/);
        expect(status?.vipType).toBe(0);

        // When verified VIP profile is stored
        zingApi.setStoredZingProfile({
            id: '12345',
            nickname: 'Nguyễn Văn A',
            vipType: 1,
        });
        const vipStatus = await zingProvider.auth?.getLoginStatus();
        expect(vipStatus?.nickname).toBe('Nguyễn Văn A');
        expect(vipStatus?.vipType).toBe(1);

        await zingProvider.auth?.logout();
        expect(await zingProvider.auth?.getLoginStatus()).toBeNull();
    });

    it('implements full browser login lifecycle via Electron openZingLogin', async () => {
        const auth = zingProvider.auth!;
        expect(auth.opensLoginPageItself?.('zing-1')).toBe(true);
        expect(auth.getLoginTtlMs?.()).toBe(180_000);

        const hadWindow = 'window' in globalThis;
        const origWindow = (globalThis as any).window;

        try {
            // When electron is not present (or browser without electron)
            (globalThis as any).window = {};

            const key1 = await auth.startLogin!();
            expect(key1).toMatch(/^zing-\d+$/);
            const errState = await auth.checkLogin!(key1);
            expect(errState.state).toBe('error');
            await auth.cancelLogin!(key1);

            // Mock window.electron.openZingLogin
            let resolveLogin: (val: any) => void = () => {};
            const loginPromise = new Promise(resolve => {
                resolveLogin = resolve;
            });

            (globalThis as any).window = {
                electron: {
                    openZingLogin: vi.fn(() => loginPromise),
                },
            };

            const key2 = await auth.startLogin!();
            expect(key2).toMatch(/^zing-\d+$/);
            // Initially waiting
            expect(await auth.checkLogin!(key2)).toEqual({ state: 'waiting' });

            // Expired on different key
            expect(await auth.checkLogin!('wrong-key')).toEqual({ state: 'expired' });

            // Simulate successful login resolution
            resolveLogin({
                success: true,
                cookie: 'za_oauth_v4=test_oauth_cookie; zpsid=123',
                profile: {
                    id: '99999',
                    nickname: 'Zing VIP User',
                    avatarUrl: 'https://avatar.zing.vn/test.jpg',
                    vipType: 1,
                },
            });

            // Allow microtasks to settle
            await new Promise(r => setTimeout(r, 10));

            const confirmedState = await auth.checkLogin!(key2);
            expect(confirmedState).toEqual({ state: 'confirmed' });

            // Check stored profile and cookie
            const status = await auth.getLoginStatus();
            expect(status?.id).toBe('99999');
            expect(status?.nickname).toBe('Zing VIP User');

            // Clean up
            await auth.logout();
            expect(await auth.getLoginStatus()).toBeNull();
        } finally {
            if (hadWindow) {
                (globalThis as any).window = origWindow;
            } else {
                delete (globalThis as any).window;
            }
        }
    });

    it('has album capabilities enabled', () => {
        expect(zingProvider.capabilities.albums).toBe(true);
        expect(zingProvider.capabilities.userAlbums).toBe(true);
    });

    it('fetches album detail and tracks via catalog', async () => {
        const mockAlbum: any = {
            providerId: 'zing',
            id: 'DeIuKsXvwKHA',
            name: 'Album Nhạc Bất Hủ 8X, 9X',
            type: 'album',
            trackCount: 8,
            isOwned: false,
        };
        vi.spyOn(zingApi, 'getZingAlbumDetail').mockResolvedValue(mockAlbum);
        vi.spyOn(zingApi, 'getZingPlaylistTracks').mockResolvedValue({
            items: [
                {
                    id: 'cZbKGpQ3YPob',
                    name: 'Dấu Chấm Hết (Remake)',
                    artists: [{ id: 1, name: 'Địa Hải' }],
                    album: { id: 'DeIuKsXvwKHA', name: 'Album Nhạc Bất Hủ 8X, 9X' },
                    durationMs: 275000,
                    sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'cZbKGpQ3YPob' },
                },
            ],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        });

        const detail = await zingProvider.catalog?.getAlbumDetail?.('DeIuKsXvwKHA');
        expect(detail).toEqual(mockAlbum);
        expect(detail?.type).toBe('album');

        const tracks = await zingProvider.catalog?.getAlbumTracks?.('DeIuKsXvwKHA', 20, 0);
        expect(tracks?.items).toHaveLength(1);
        expect(tracks?.items[0].name).toBe('Dấu Chấm Hết (Remake)');
    });

    it('fetches user albums via library.getUserAlbums', async () => {
        const mockAlbumPage = {
            items: [
                {
                    providerId: 'zing' as const,
                    id: 'YnsBe9dlQfNB',
                    name: 'CHUNG KẾT (Anh Trai Vượt Ngàn Chông Gai 2026)',
                    type: 'album' as const,
                    trackCount: 6,
                    isOwned: false,
                },
            ],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        };
        vi.spyOn(zingApi, 'getZingAlbums').mockResolvedValue(mockAlbumPage);

        const result = await zingProvider.library?.getUserAlbums?.('zing_user', 30, 0);
        expect(result?.items).toHaveLength(1);
        expect(result?.items[0].type).toBe('album');
        expect(result?.items[0].name).toBe('CHUNG KẾT (Anh Trai Vượt Ngàn Chông Gai 2026)');
    });

    it('correctly sets fee=1 on VIP songs in searchZingLyricSongs', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: {
                    items: [
                        {
                            suggestions: [
                                {
                                    type: 1,
                                    id: 'vip-song-id',
                                    title: 'VIP Track',
                                    playStatus: 3,
                                    playPrvl: [2],
                                },
                                {
                                    type: 1,
                                    id: 'free-song-id',
                                    title: 'Free Track',
                                    playStatus: 2,
                                },
                            ],
                        },
                    ],
                },
            }),
        } as any);

        const results = await searchZingLyricSongs('test', 10);
        expect(results).toHaveLength(2);
        expect(results[0].fee).toBe(1);
        expect(results[1].fee).toBe(0);
    });

    it('implements recommendations for radio, personal FM, and collections', async () => {
        expect(zingProvider.recommendations).toBeDefined();

        const mockChartSongs = [
            {
                id: 'CaBURT2uECZr',
                name: 'Giá Như Anh Là Em',
                artists: [{ id: 1, name: 'Lệ Quyên' }],
                album: { id: 1, name: 'Giá Như Anh Là Em' },
                durationMs: 240000,
                sourceRef: { kind: 'online' as const, providerId: 'zing' as const, mediaId: 'CaBURT2uECZr' },
            },
        ];
        vi.spyOn(zingApi, 'getZingChartSongs').mockResolvedValue(mockChartSongs);

        const fmSongs = await zingProvider.recommendations?.getPersonalFm?.();
        expect(fmSongs).toHaveLength(1);
        expect(fmSongs?.[0].name).toBe('Giá Như Anh Là Em');

        const dailySongs = await zingProvider.recommendations?.getDailySongs?.();
        expect(dailySongs).toHaveLength(1);
        expect(dailySongs?.[0].id).toBe('CaBURT2uECZr');

        const mockTop100 = {
            items: [
                {
                    providerId: 'zing' as const,
                    id: 'CasHsDNUCujg',
                    name: 'Top 100 Nhạc Trẻ',
                    type: 'album' as const,
                    trackCount: 100,
                    isOwned: false,
                },
            ],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        };
        const mockRadioStations = [
            {
                providerId: 'zing' as const,
                id: 'yUEDI0z9aMs',
                name: 'V-POP Radio',
                type: 'radio' as const,
                trackCount: 1,
                isOwned: false,
            },
        ];
        vi.spyOn(zingApi, 'getZingTop100Albums').mockResolvedValue(mockTop100);
        vi.spyOn(zingApi, 'getZingRadioStations').mockResolvedValue(mockRadioStations);

        const collections = await zingProvider.recommendations?.getRecommendedCollections?.(20);
        expect(collections).toHaveLength(2);
        expect(collections?.[0].type).toBe('radio');
        expect(collections?.[1].type).toBe('album');
    });

    it('falls back to getZingTop100Albums when getZingHomePlaylists returns empty', async () => {
        vi.spyOn(zingApi, 'getZingHomePlaylists').mockResolvedValue([]);
        const mockTop100 = {
            items: [
                {
                    providerId: 'zing' as const,
                    id: 'CasHsDNUCujg',
                    name: 'Top 100 Nhạc Trẻ',
                    type: 'album' as const,
                    trackCount: 100,
                    isOwned: false,
                },
            ],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        };
        vi.spyOn(zingApi, 'getZingTop100Albums').mockResolvedValue(mockTop100);

        const result = await zingProvider.library?.getUserPlaylists('zing_user', 30, 0);
        expect(result?.items).toHaveLength(1);
        expect(result?.items[0].name).toBe('Top 100 Nhạc Trẻ');
    });

    it('returns empty array for getLikedSongIds when unauthenticated', async () => {
        const { setStoredZingCookie } = zingApi;
        setStoredZingCookie('');
        const liked = await zingProvider.library?.getLikedSongIds?.('zing_user');
        expect(liked).toEqual({ ids: [], whole: true });
    });

    it('fetches personal liked songs when authenticated', async () => {
        const mockLikedSongs = [
            {
                id: 'ZW78DIEO',
                name: 'Lạc Trôi',
                artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
                album: { id: 1, name: 'Lạc Trôi' },
                durationMs: 233000,
                sourceRef: { kind: 'online' as const, providerId: 'zing' as const, mediaId: 'ZW78DIEO' },
            },
        ];
        vi.spyOn(zingApi, 'getZingLikedSongs').mockResolvedValue(mockLikedSongs);
        const liked = await zingProvider.library?.getLikedSongIds?.('zing_user');
        expect(liked?.ids).toEqual(['ZW78DIEO']);
    });

    it('fetches user personal playlists and falls back to home playlists', async () => {
        const mockUserPlaylists = {
            items: [
                {
                    providerId: 'zing' as const,
                    id: 'PL_USER_1',
                    name: 'Nghiện',
                    type: 'playlist' as const,
                    trackCount: 25,
                    isOwned: true,
                },
            ],
            total: 1,
            hasMore: false,
            nextOffset: 1,
        };
        vi.spyOn(zingApi, 'getUserZingPlaylists').mockResolvedValue(mockUserPlaylists);
        const result = await zingProvider.library?.getUserPlaylists('zing_user', 30, 0);
        expect(result?.items).toHaveLength(1);
        expect(result?.items[0].name).toBe('Nghiện');
        expect(result?.items[0].isOwned).toBe(true);
    });

    it('routes zing_liked_songs to getZingLikedSongs and zing_recent_songs to getZingRecentSongs', async () => {
        const mockLikedSongs = [
            {
                id: 'ZW78DIEO',
                name: 'Lạc Trôi',
                artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
                album: { id: 1, name: 'Lạc Trôi' },
                durationMs: 233000,
                sourceRef: { kind: 'online' as const, providerId: 'zing' as const, mediaId: 'ZW78DIEO' },
            },
        ];
        const mockRecentSongs = [
            {
                id: 'ZW78RECENT',
                name: 'Bài Hát Gần Đây',
                artists: [{ id: 2, name: 'Ca Sĩ' }],
                album: { id: 2, name: 'Album' },
                durationMs: 200000,
                sourceRef: { kind: 'online' as const, providerId: 'zing' as const, mediaId: 'ZW78RECENT' },
            },
        ];

        vi.spyOn(zingApi, 'getZingLikedSongs').mockResolvedValue(mockLikedSongs);
        vi.spyOn(zingApi, 'getZingRecentSongs').mockResolvedValue(mockRecentSongs);

        const likedTracks = await zingProvider.catalog?.getPlaylistTracks?.('zing_liked_songs', 50, 0);
        expect(likedTracks?.items).toHaveLength(1);
        expect(likedTracks?.items[0].name).toBe('Lạc Trôi');

        const recentTracks = await zingProvider.catalog?.getPlaylistTracks?.('zing_recent_songs', 50, 0);
        expect(recentTracks?.items).toHaveLength(1);
        expect(recentTracks?.items[0].name).toBe('Bài Hát Gần Đây');

        const likedDetail = await zingProvider.catalog?.getPlaylistDetail?.('zing_liked_songs');
        expect(likedDetail?.id).toBe('zing_liked_songs');
        expect(likedDetail?.isLiked).toBe(true);

        const recentDetail = await zingProvider.catalog?.getPlaylistDetail?.('zing_recent_songs');
        expect(recentDetail?.id).toBe('zing_recent_songs');
    });

    it('shuffles chart songs for getPersonalFm', async () => {
        const mockSongs = Array.from({ length: 40 }, (_, i) => ({
            id: `song_${i}`,
            name: `Track ${i}`,
            artists: [{ id: 1, name: 'Artist' }],
            album: { id: 1, name: 'Album' },
            durationMs: 180000,
            sourceRef: { kind: 'online' as const, providerId: 'zing' as const, mediaId: `song_${i}` },
        }));
        vi.spyOn(zingApi, 'getZingChartSongs').mockResolvedValue(mockSongs);

        const fm = await zingProvider.recommendations?.getPersonalFm?.();
        expect(fm).toHaveLength(30);
        expect(fm?.[0]).toBeDefined();
    });

    it('handles safeStorage cookie encryption and fallback correctly', async () => {
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
                safeStorageDecryptSync: vi.fn().mockReturnValue('mock-decrypted-cookie'),
                safeStorageEncrypt: vi.fn().mockResolvedValue('mock-encrypted-base64'),
            },
        };

        // When stored raw starts with enc:, decrypts
        (globalThis as any).localStorage.setItem('folia_zing_cookie', 'enc:abc123encrypted');
        zingApi.setStoredZingCookie('');
        expect(zingApi.getStoredZingCookie()).toBe('');

        // When decrypt fails, it must NOT return raw ciphertext
        (globalThis as any).window.electron.safeStorageDecryptSync = vi.fn().mockReturnValue(null);
        (globalThis as any).localStorage.setItem('folia_zing_cookie', 'enc:damaged_ciphertext');
        expect(zingApi.getStoredZingCookie()).toBe('');

        (globalThis as any).window = prevWindow;
        (globalThis as any).localStorage = prevLocalStorage;
    });

    it('sends x-zing-cookie header and sectionId in getZingLikedSongs and getZingRecentSongs', async () => {
        zingApi.setStoredZingCookie('za_oauth_v4=test_token_123');
        const fetchCalls: { url: string; headers: Record<string, string> }[] = [];

        vi.spyOn(globalThis, 'fetch').mockImplementation((async (input: any, init?: any) => {
            const urlStr = String(input);
            fetchCalls.push({ url: urlStr, headers: (init?.headers || {}) as Record<string, string> });
            return {
                ok: true,
                headers: { get: () => '' },
                json: async () => ({
                    err: 0,
                    data: {
                        items: [
                            {
                                encodeId: 'ZW78TEST',
                                title: 'Test Song',
                                artistsNames: 'Test Artist',
                                thumbnailM: 'https://photo-resize-zmp3.zmdcdn.me/cover.jpg',
                                duration: 210,
                            },
                        ],
                        total: 1,
                    },
                }),
            } as any;
        }) as any);

        const liked = await zingApi.getZingLikedSongs(50, 0);
        expect(liked).toHaveLength(1);
        expect(liked[0].name).toBe('Test Song');

        const likedCall = fetchCalls.find(c => c.url.includes('type=library') && c.url.includes('sectionId=mFavSong'));
        expect(likedCall).toBeDefined();
        expect(likedCall?.headers['x-zing-cookie']).toContain('za_oauth_v4=test_token_123');

        const recent = await zingApi.getZingRecentSongs(20);
        expect(recent).toHaveLength(1);

        const recentCall = fetchCalls.find(c => c.url.includes('type=recentListen') && c.url.includes('sectionId=mRecent'));
        expect(recentCall).toBeDefined();
        expect(recentCall?.headers['x-zing-cookie']).toContain('za_oauth_v4=test_token_123');

        zingApi.setStoredZingCookie('');
    });

    it('safely normalizes raw profiles without throwing on missing or undefined fields', () => {
        const emptyProfile = normalizeZingUser({});
        expect(emptyProfile.id).toBe('zing_user');
        expect(emptyProfile.nickname).toBeTruthy();
        expect(typeof emptyProfile.nickname).toBe('string');
        expect(emptyProfile.avatarUrl).toBeUndefined();

        const undefinedInput = normalizeZingUser(undefined);
        expect(undefinedInput.id).toBe('zing_user');
        expect(typeof undefinedInput.nickname).toBe('string');

        const rawZingData = {
            id: 99887766,
            displayName: 'Nguyễn Văn Test',
            avatar: 'http://img.zingmp3.vn/avatar.jpg',
            isVip: true,
        };
        const normalized = normalizeZingUser(rawZingData);
        expect(normalized.id).toBe('99887766');
        expect(normalized.nickname).toBe('Nguyễn Văn Test');
        expect(normalized.avatarUrl).toBe('https://img.zingmp3.vn/avatar.jpg');
        expect(normalized.vipType).toBe(1);

        zingApi.setStoredZingProfile(normalized);
        const stored = zingApi.getStoredZingProfile();
        expect(stored?.nickname).toBe('Nguyễn Văn Test');

        // Handles malformed profile passed to setStoredZingProfile
        zingApi.setStoredZingProfile({ id: 'bad' } as any);
        const recovered = zingApi.getStoredZingProfile();
        expect(recovered?.nickname).toBeTruthy();
        expect(typeof recovered?.nickname).toBe('string');

        // Handles setStoredZingCookie with empty or undefined without throwing
        expect(() => zingApi.setStoredZingCookie(undefined as any)).not.toThrow();
        expect(() => zingApi.setStoredZingCookie('')).not.toThrow();
    });
});

