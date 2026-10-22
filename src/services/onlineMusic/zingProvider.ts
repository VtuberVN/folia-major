// src/services/onlineMusic/zingProvider.ts
// Zing MP3 provider for Folia - provides search, playback streaming, and lyrics.

import type { SongResult, UnifiedSong } from '../../types';
import type {
    LoginState,
    MediaId,
    OnlineMusicProvider,
    ProviderAudioSource,
    ProviderLikedSongIds,
    ProviderLyricsResult,
    ProviderSongAvailability,
    ProviderUser,
} from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { createProviderSongMetadata } from '../../utils/songMetadata';
import i18n from 'i18next';
import {
    getStoredZingCookie,
    getUserZingPlaylists,
    getZingLikedSongs,
    getUserZingAlbums,
    getZingRecentSongs,
    getZingAlbumDetail,
    getZingAlbums,
    getZingAudioSource,
    getZingChartSongs,
    getZingHomePlaylists,
    getZingLyric,
    getZingPlaylistDetail,
    getZingPlaylistTracks,
    getZingRadioStations,
    getZingSongDetail,
    getZingTop100Albums,
    getZingUserProfile,
    searchZingSongs,
    setStoredZingCookie,
    setStoredZingProfile,
} from './zingApi';

export function normalizeZingUser(raw: unknown): ProviderUser {
    const item = raw as any;
    return {
        id: String(item?.id || item?.userid || 'zing_user'),
        nickname: String(item?.nickname || item?.displayName || item?.name || item?.username || (i18n.isInitialized ? i18n.t('zing.accountUser') : 'Zing MP3 User')).trim() || 'Zing MP3 User',
        avatarUrl: item?.avatarUrl || (item?.avatar ? String(item.avatar).replace(/^http:/, 'https:') : undefined),
        vipType: item?.vipType ?? ((item?.packages?.length || item?.isVip) ? 1 : 0),
    };
}

let activeLoginKey: string | null = null;
let activeLoginResult: LoginState | null = null;
let activeLoginPromise: Promise<any> | null = null;
let loginTicket = 0;

function launchElectronZingLogin(key: string): void {
    if (typeof window === 'undefined' || !window.electron?.openZingLogin) {
        activeLoginResult = { state: 'error', message: 'Zing MP3 login requires Folia desktop app' };
        return;
    }
    activeLoginResult = null;
    activeLoginPromise = window.electron.openZingLogin();
    activeLoginPromise.then((res: any) => {
        if (activeLoginKey !== key) return;
        if (res?.success && res.cookie) {
            setStoredZingCookie(res.cookie);
            if (res.profile) {
                const normalized = normalizeZingUser(res.profile);
                setStoredZingProfile(normalized);
            }
            activeLoginResult = { state: 'confirmed' };
        } else if (res?.error === 'cancelled') {
            activeLoginResult = { state: 'error', message: 'Login cancelled' };
        } else {
            activeLoginResult = { state: 'error', message: res?.error || 'Login failed' };
        }
    }).catch((err: any) => {
        if (activeLoginKey !== key) return;
        activeLoginResult = { state: 'error', message: err?.message || 'Login failed' };
    });
}

export const zingProvider: OnlineMusicProvider = {
    id: 'zing',
    displayName: 'Zing MP3',
    shortName: 'Zing MP3',
    mark: { letter: 'Z', color: '#6a35ff' },
    getAvailability: () => ({ configured: true }),
    capabilities: {
        search: true,
        playback: true,
        lyrics: true,
        auth: typeof window !== 'undefined' ? Boolean((window as any).electron) : true,
        wordByWordLyrics: true,
        userLibrary: true,
        playlists: true,
        albums: true,
        userAlbums: true,
        artists: false,
        recommendations: true,
        mutations: false,
    },
    normalizeSong(raw: unknown): UnifiedSong {
        const item = raw as any;
        return {
            id: item.id || '',
            name: item.name || item.title || '',
            artists: item.artists || [{ id: 0, name: item.artist || 'Zing MP3' }],
            album: item.album || { id: 0, name: 'Zing MP3' },
            durationMs: item.durationMs || 0,
            sourceRef: item.sourceRef || { kind: 'online', providerId: 'zing', mediaId: String(item.id || '') },
        };
    },
    normalizeUser: normalizeZingUser,
    songMetadata: {
        getSongMetadata: createProviderSongMetadata,
    },
    getSongPageUrl(song: SongResult): string | null {
        return song.id ? `https://zingmp3.vn/bai-hat/${encodeURIComponent(String(song.id))}.html` : null;
    },
    search: {
        async searchSongs(query: string, limit: number, offset: number) {
            const items = await searchZingSongs(query, limit);
            return {
                items,
                total: items.length,
                hasMore: false,
                nextOffset: offset + items.length,
            };
        },
    },
    playback: {
        async getSongDetail(id) {
            return getZingSongDetail(String(id));
        },
        async getAudioSource(song, quality): Promise<ProviderAudioSource | null> {
            const mediaId = song.sourceRef?.kind === 'online' ? song.sourceRef.mediaId : String(song.id);
            let stream: any = null;
            try {
                stream = await getZingAudioSource(mediaId, quality);
                if (stream && stream.url && !stream.isVipOnly) {
                    return {
                        url: stream.url,
                        fetchedAt: Date.now(),
                        quality: stream.quality,
                    };
                }
            } catch (err) {
                console.warn('[ZingProvider] Stream retrieval failed:', err);
            }

            if (stream?.isVipOnly || song.fee === 1) {
                throw new OnlineProviderError(
                    'vip-only',
                    'VIP Zing MP3: song is VIP only',
                    'zing'
                );
            }

            throw new OnlineProviderError(
                'unavailable',
                'Song unavailable on Zing MP3',
                'zing'
            );
        },
        getAvailability(_song): ProviderSongAvailability {
            return { state: 'playable' };
        },
    },
    library: {
        async getUserPlaylists(_userId, limit, offset) {
            const userPage = await getUserZingPlaylists(limit, offset);
            if (userPage.items.length > 0) return userPage;
            const items = await getZingHomePlaylists();
            if (items.length === 0) {
                return getZingTop100Albums(limit, offset);
            }
            const paged = items.slice(offset, offset + limit);
            return {
                items: paged,
                total: items.length,
                hasMore: offset + limit < items.length,
                nextOffset: offset + limit,
            };
        },
        async getLikedSongIds(_userId: MediaId): Promise<ProviderLikedSongIds> {
            const songs = await getZingLikedSongs(100, 0);
            return {
                ids: songs.map(song => song.id),
                whole: songs.length < 100,
            };
        },
        async getUserAlbums(_userId, limit, offset) {
            const userAlbums = await getUserZingAlbums(limit, offset);
            if (userAlbums.items.length > 0) return userAlbums;
            return getZingAlbums(limit, offset);
        },
    },
    recommendations: {
        // Pseudo-FM fallback: Zing has no official personal FM API.
        // We shuffle chart songs to simulate variety in the radio experience.
        async getPersonalFm(_options) {
            const songs = await getZingChartSongs(50);
            if (songs.length === 0) return [];
            const shuffled = [...songs];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled.slice(0, 30);
        },
        async getDailySongs(_refresh) {
            const recent = await getZingRecentSongs(30);
            if (recent.length > 0) return recent;
            return getZingChartSongs(30);
        },
        async getRecommendedCollections(limit = 20) {
            const [top100Page, radioStations] = await Promise.all([
                getZingTop100Albums(limit, 0),
                getZingRadioStations(10),
            ]);
            if (top100Page.items.length > 0 || radioStations.length > 0) {
                return [...radioStations, ...top100Page.items].slice(0, limit);
            }
            return getZingHomePlaylists();
        },
    },
    catalog: {
        async getPlaylistTracks(id, limit = 50, offset = 0) {
            if (id === 'zing_liked_songs' || id === 'liked') {
                const songs = await getZingLikedSongs(limit, offset);
                return {
                    items: songs,
                    total: songs.length,
                    hasMore: offset + limit < songs.length,
                    nextOffset: offset + limit,
                };
            }
            if (id === 'zing_recent_songs' || id === 'recent') {
                const songs = await getZingRecentSongs(limit);
                return {
                    items: songs,
                    total: songs.length,
                    hasMore: false,
                    nextOffset: songs.length,
                };
            }
            return getZingPlaylistTracks(String(id), limit, offset);
        },
        async getPlaylistDetail(id, existingCollection) {
            return getZingPlaylistDetail(String(id), existingCollection);
        },
        async getAlbumTracks(id, limit, offset) {
            return getZingPlaylistTracks(String(id), limit, offset);
        },
        async getAlbumDetail(id, existingCollection) {
            const detail = await getZingAlbumDetail(String(id));
            return detail || existingCollection || null;
        },
    },
    lyrics: {
        async getLyrics(song): Promise<ProviderLyricsResult> {
            const mediaId = song.sourceRef?.kind === 'online' ? song.sourceRef.mediaId : String(song.id);
            const lyrics = await getZingLyric(mediaId);
            return {
                lyrics,
                mainText: null,
                wordByWordText: null,
                translationText: null,
                romanizationText: null,
                isPureMusic: false,
            };
        },
    },
    auth: {
        getLoginTexts: () => ({
            title: 'home.loginTitleZing',
            note: 'home.loginNoteZing',
        }),
        async getLoginStatus(): Promise<ProviderUser | null> {
            const cookie = getStoredZingCookie();
            if (!cookie) return null;
            return getZingUserProfile();
        },
        async logout(): Promise<void> {
            activeLoginKey = null;
            activeLoginResult = null;
            activeLoginPromise = null;
            setStoredZingCookie('');
            setStoredZingProfile(null);
        },
        async startLogin(): Promise<string> {
            const ticket = ++loginTicket;
            const key = `zing-${ticket}`;
            activeLoginKey = key;
            launchElectronZingLogin(key);
            return key;
        },
        async openLoginPage(key: string): Promise<void> {
            if (activeLoginKey === key) {
                launchElectronZingLogin(key);
            }
        },
        opensLoginPageItself: () => true,
        async checkLogin(key: string): Promise<LoginState> {
            if (activeLoginKey !== key) return { state: 'expired' };
            if (activeLoginResult) {
                return activeLoginResult;
            }
            return { state: 'waiting' };
        },
        async cancelLogin(key: string): Promise<void> {
            if (activeLoginKey === key) {
                activeLoginKey = null;
                activeLoginResult = null;
                activeLoginPromise = null;
            }
        },
        signInRanOut(): void {
            const currentCookie = getStoredZingCookie();
            if (currentCookie && currentCookie.includes('za_oauth_v4=')) {
                // If we hold za_oauth_v4, the session can be revived and is not permanently ran out
                console.log('[ZingProvider] signInRanOut invoked but user holds za_oauth_v4 token; preserving profile and session');
                return;
            }
            setStoredZingProfile(null);
        },
        getLoginTtlMs: () => 180_000,
    },
};
