// src/services/onlineMusic/nctProvider.ts
// NhacCuaTui (NCT) provider for Folia - provides search, playback streaming, and lyrics.

import type { SongResult, UnifiedSong } from '../../types';
import type {
    OnlineMusicProvider,
    ProviderAudioSource,
    ProviderLyricsResult,
    ProviderSongAvailability,
} from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { createProviderSongMetadata } from '../../utils/songMetadata';
import { fetchNctLyrics, searchNctSongs } from '../../utils/lyrics/providers/nctLyricProvider';

function toNctWebProxyUrl(targetUrl: string): string {
    if (typeof window !== 'undefined' && !(window as any).electron) {
        return `/api/lyric-proxy?url=${encodeURIComponent(targetUrl)}`;
    }
    return targetUrl;
}

export async function getNctSongAudioSource(mediaId: string): Promise<string | null> {
    try {
        const targetUrl = `https://graph.nhaccuatui.com/api/v1/song/detail/${encodeURIComponent(mediaId)}`;
        const res = await fetch(toNctWebProxyUrl(targetUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.nhaccuatui.com/',
            },
        });
        if (!res.ok) return null;
        const json = await res.json();
        if (json.code !== 0 || !json.data) return null;
        const streamList = json.data.streamURL || [];
        // Prioritize 320, then 128, or any available stream
        const stream = streamList.find((s: any) => s.type === '320' && s.stream)?.stream
            || streamList.find((s: any) => s.type === '128' && s.stream)?.stream
            || streamList.find((s: any) => s.stream)?.stream;
        return stream || null;
    } catch (err) {
        console.warn(`[NctProvider] Failed to fetch audio stream for ${mediaId}:`, err);
        return null;
    }
}

export const nctProvider: OnlineMusicProvider = {
    id: 'nct',
    displayName: 'NhacCuaTui',
    shortName: 'NhacCuaTui',
    getAvailability: () => ({ configured: true }),
    capabilities: {
        search: true,
        playback: true,
        lyrics: true,
        auth: false,
        wordByWordLyrics: true,
        userLibrary: false,
        playlists: false,
        albums: false,
        artists: false,
        recommendations: false,
        mutations: false,
    },
    normalizeSong(raw: unknown): UnifiedSong {
        const item = raw as any;
        return {
            id: item.id || '',
            name: item.name || item.title || '',
            artists: item.artists || [{ id: 0, name: item.artist || 'NhacCuaTui' }],
            album: item.album || { id: 0, name: 'NhacCuaTui' },
            durationMs: item.durationMs || 0,
            sourceRef: item.sourceRef || { kind: 'online', providerId: 'nct', mediaId: String(item.id || '') },
        };
    },
    songMetadata: {
        getSongMetadata: createProviderSongMetadata,
    },
    getSongPageUrl(song: SongResult): string | null {
        return song.id ? `https://www.nhaccuatui.com/bai-hat/${encodeURIComponent(String(song.id))}.html` : null;
    },
    search: {
        async searchSongs(query: string, limit: number, offset: number) {
            const items = await searchNctSongs(query, limit);
            const unifiedItems = items.map(nctProvider.normalizeSong);
            return {
                items: unifiedItems,
                total: unifiedItems.length,
                hasMore: false,
                nextOffset: offset + unifiedItems.length,
            };
        },
    },
    playback: {
        async getSongDetail(id) {
            const mediaId = String(id);
            try {
                const targetUrl = `https://graph.nhaccuatui.com/api/v1/song/detail/${encodeURIComponent(mediaId)}`;
                const res = await fetch(toNctWebProxyUrl(targetUrl), {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                });
                if (!res.ok) return null;
                const json = await res.json();
                if (json.code !== 0 || !json.data) return null;
                const d = json.data;
                const stream = (d.streamURL || []).find((s: any) => s.stream)?.stream;
                const cover = d.image ? String(d.image).replace(/^http:/, 'https:') : undefined;
                return nctProvider.normalizeSong({
                    id: d.key,
                    name: d.name,
                    artists: (d.artist || []).map((a: any, idx: number) => ({ id: a.key || idx, name: a.name })),
                    album: { id: 0, name: d.album?.name || 'NhacCuaTui', coverUrl: cover },
                    durationMs: (d.duration || 0) * 1000,
                    sourceRef: {
                        kind: 'online',
                        providerId: 'nct',
                        mediaId: d.key,
                        providerData: {
                            coverUrl: cover ?? null,
                            streamUrl: stream ? String(stream) : null,
                        },
                    },
                });
            } catch {
                return null;
            }
        },
        async getAudioSource(song, _quality): Promise<ProviderAudioSource | null> {
            const sourceRef = song.sourceRef;
            const mediaId = sourceRef?.kind === 'online' ? sourceRef.mediaId : String(song.id);
            const cachedStreamUrl = sourceRef?.kind === 'online' ? sourceRef.providerData?.streamUrl : undefined;

            let streamUrl = typeof cachedStreamUrl === 'string' && cachedStreamUrl ? cachedStreamUrl : null;
            if (!streamUrl) {
                streamUrl = await getNctSongAudioSource(mediaId);
            }

            if (!streamUrl) {
                throw new OnlineProviderError(
                    'unavailable',
                    'Song unavailable on NhacCuaTui',
                    'nct'
                );
            }

            return {
                url: streamUrl,
                fetchedAt: Date.now(),
                quality: 'high',
            };
        },
        getAvailability(_song): ProviderSongAvailability {
            return { state: 'playable' };
        },
    },
    lyrics: {
        async getLyrics(song): Promise<ProviderLyricsResult> {
            const lyrics = await fetchNctLyrics(song as any);
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
};
