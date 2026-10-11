// src/services/onlineMusic/spotify/spotifyAudioResolver.ts
// Smart Audio Stream Resolver for Spotify tracks in Folia (Spotube / Spicetify architectural pattern).
// Resolves playable audio streams for Spotify tracks via high-quality providers (Zing MP3, NetEase, YouTube).

import type { SongResult } from '../../../types';
import type { AudioQualityPreference, ProviderAudioSource } from '../../../types/onlineMusic';
import { getZingAudioSource, searchZingSongs } from '../zingApi';
import { neteaseApi } from '../../netease';

interface CachedAudioResolution {
    source: ProviderAudioSource;
    timestamp: number;
}

const audioSourceCache = new Map<string, CachedAudioResolution>();
const CACHE_TTL_MS = 3600 * 1000; // 1 hour

/**
 * Resolves a playable high-quality audio stream for a Spotify track.
 */
export async function resolveSpotifyAudioSource(
    song: SongResult,
    quality: AudioQualityPreference = 'standard',
): Promise<ProviderAudioSource | null> {
    const trackId = String(song.id);
    const cached = audioSourceCache.get(trackId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.source;
    }

    const artistName = song.artists?.[0]?.name || '';
    const query = `${song.name} ${artistName}`.trim();

    // Strategy 1: Resolve via Zing MP3 (Ultra-fast direct MP3 CDN for Vietnamese & international hits)
    try {
        const zingResults = await searchZingSongs(query, 5);
        if (zingResults.length > 0) {
            // Find closest match by duration if available
            const targetDuration = song.durationMs;
            let bestMatch = zingResults[0];

            if (targetDuration > 0) {
                for (const candidate of zingResults) {
                    const diff = Math.abs(candidate.durationMs - targetDuration);
                    if (diff < 5000) { // within 5 seconds
                        bestMatch = candidate;
                        break;
                    }
                }
            }

            const stream = await getZingAudioSource(String(bestMatch.id));
            if (stream && stream.url) {
                const source: ProviderAudioSource = {
                    url: stream.url,
                    quality: stream.quality,
                    fetchedAt: Date.now(),
                };
                audioSourceCache.set(trackId, { source, timestamp: Date.now() });
                return source;
            }
        }
    } catch (err) {
        console.warn('[SpotifyResolver] Zing resolution fallback error:', err);
    }

    // Strategy 2: Resolve via NetEase Cloud Music (Comprehensive international & Asian catalog)
    try {
        const neteaseSearch = await neteaseApi.cloudSearch(query, 5, 0);
        const neteaseSongs = neteaseSearch?.result?.songs || [];
        if (neteaseSongs.length > 0) {
            const bestNetease = neteaseSongs[0];
            const neteaseUrlRes = await neteaseApi.getSongUrl(bestNetease.id, 'standard');
            const url = neteaseUrlRes?.data?.[0]?.url;
            if (url) {
                const source: ProviderAudioSource = {
                    url: String(url).replace(/^http:/, 'https:'),
                    quality: 'standard',
                    fetchedAt: Date.now(),
                };
                audioSourceCache.set(trackId, { source, timestamp: Date.now() });
                return source;
            }
        }
    } catch (err) {
        console.warn('[SpotifyResolver] NetEase resolution fallback error:', err);
    }

    // Strategy 3: Check preview_url from Spotify provider data
    const previewUrl = song.sourceRef?.kind === 'online'
        ? (song.sourceRef.providerData?.previewUrl as string | undefined)
        : undefined;

    if (previewUrl) {
        return {
            url: previewUrl,
            quality: 'standard',
            fetchedAt: Date.now(),
        };
    }

    return null;
}
