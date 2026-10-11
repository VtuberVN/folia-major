import type { SongResult } from '../types';
import type { AudioQualityInfo } from '../types/audioQuality';
import { getFromCache, saveToCache } from './db';
import { getSongResourceCacheKey } from './onlineMusic/resourceKeys';
import { parseEmbeddedMetadataAsync } from '../utils/localMetadataWorkerClient';
import { normalizeAudioQualityInfo } from '../utils/audioQualityInfo';
import { getAudioCacheRevision } from '../utils/audioCacheRevision';

// src/services/cachedAudioQuality.ts
// Reads cached-file properties off the playback path and retains them with their source fingerprint.
type QualityRecord = { version: 1; fingerprint: string; info: AudioQualityInfo | null };
const inFlight = new Map<string, Promise<AudioQualityInfo | undefined>>();
const SAMPLE_BYTES = 64 * 1024;

// Audio headers and trailing tags identify format metadata without copying an entire lossless file.
async function metadataFingerprint(blob: Blob): Promise<string> {
    const revision = getAudioCacheRevision(blob);
    if (revision) return `file:${revision}:${blob.size}:${blob.type}`;
    const sample = new Blob([blob.slice(0, SAMPLE_BYTES), blob.slice(Math.max(SAMPLE_BYTES, blob.size - SAMPLE_BYTES))]);
    const hash = await crypto.subtle.digest('SHA-256', await sample.arrayBuffer());
    return `${blob.size}:${blob.type}:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function readCachedAudioQuality(song: SongResult, blob: Blob): Promise<AudioQualityInfo | undefined> {
    try {
        const fingerprint = await metadataFingerprint(blob);
        const key = getSongResourceCacheKey('audioQuality', song);
        const workKey = `${key}:${fingerprint}`;
        const existing = inFlight.get(workKey);
        if (existing) return await existing;
        const task = (async () => {
            const cached = await getFromCache<QualityRecord>(key).catch(() => null);
            if (cached?.version === 1 && cached.fingerprint === fingerprint) return normalizeAudioQualityInfo(cached.info);
            const metadata = await parseEmbeddedMetadataAsync(new File([blob], 'cached-audio'), false);
            if (metadata === null) return undefined; // Worker failures may be retried on the next play.
            const info = normalizeAudioQualityInfo(metadata);
            try { await saveToCache(key, { version: 1, fingerprint, info: info ?? null } satisfies QualityRecord); }
            catch { /* A full/unavailable cache must not discard successfully parsed information. */ }
            return info;
        })();
        inFlight.set(workKey, task);
        try { return await task; }
        finally { if (inFlight.get(workKey) === task) inFlight.delete(workKey); }
    } catch {
        return undefined;
    }
}
