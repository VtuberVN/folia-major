// src/services/aiKaraokeService.ts
// Service communicating with Electron's AI Karaoke bridge for separation,
// model downloads, and karaoke lyric alignment jobs.

import { useAiKaraokeStore } from '../stores/useAiKaraokeStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import type { SongResult } from '../types';
import type {
    AiModelInfo,
    KaraokeGenerationResult,
    MssModelId,
    AsrModelId,
    KaraokeAlignmentMode,
} from '../types/aiKaraoke';
import { initWebGpuSeparationIpcBridge } from './analysis/webGpuSeparator';

let progressUnsub: (() => void) | null = null;
let modelProgressUnsub: (() => void) | null = null;

/**
 * Initializes listeners for background AI Karaoke progress and model download progress.
 */
export const initAiKaraokeListeners = (): (() => void) => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge) return () => {};

    try {
        initWebGpuSeparationIpcBridge();
    } catch (e) {
        console.warn('[aiKaraokeService] initWebGpuSeparationIpcBridge error:', e);
    }

    if (progressUnsub) progressUnsub();

    if (modelProgressUnsub) modelProgressUnsub();

    if (typeof bridge.onJobProgress === 'function') {
        progressUnsub = bridge.onJobProgress((progress) => {
            useAiKaraokeStore.getState().updateProgress(progress);
        });
    }

    if (typeof bridge.onModelProgress === 'function') {
        modelProgressUnsub = bridge.onModelProgress((p) => {
            useAiKaraokeStore.getState().updateModelDownload(p.modelId, p.percent, {
                receivedBytes: p.receivedBytes,
                totalBytes: p.totalBytes,
                speedBytesPerSec: p.speedBytesPerSec,
            });
        });
    }

    return () => {
        progressUnsub?.();
        modelProgressUnsub?.();
        progressUnsub = null;
        modelProgressUnsub = null;
    };
};

/**
 * Fetches the current download status of all AI models.
 */
export const fetchAiModels = async (): Promise<AiModelInfo[]> => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge?.getModels) return [];
    try {
        const models = await bridge.getModels();
        useAiKaraokeStore.getState().setModels(models);
        return models;
    } catch {
        return [];
    }
};

/**
 * Downloads a model by ID.
 */
export const downloadAiModel = async (modelId: string): Promise<boolean> => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge?.downloadModel) return false;
    try {
        useAiKaraokeStore.getState().updateModelDownload(modelId, 0);
        const res = await bridge.downloadModel(modelId);
        if (res.success) {
            useAiKaraokeStore.getState().updateModelDownload(modelId, 100);
            await fetchAiModels();
            return true;
        }
        return false;
    } catch (err) {
        await fetchAiModels();
        throw err;
    }
};

/**
 * Deletes a downloaded model to free space.
 */
export const deleteAiModel = async (modelId: string): Promise<boolean> => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge?.deleteModel) return false;
    try {
        const res = await bridge.deleteModel(modelId);
        await fetchAiModels();
        return res.removed;
    } catch {
        return false;
    }
};

export interface StartKaraokeJobOptions {
    song: SongResult;
    rawLyrics?: string;
    mssModel?: MssModelId;
    asrModel?: AsrModelId;
    alignmentMode?: KaraokeAlignmentMode;
    devicePreference?: import('../types/aiKaraoke').KaraokeDevicePreference;
}

/**
 * Starts an AI Karaoke separation and lyric generation job.
 */
export const startKaraokeJob = async (
    options: StartKaraokeJobOptions,
): Promise<KaraokeGenerationResult> => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge?.startJob) {
        throw new Error('AI Karaoke bridge is not available in this environment.');
    }

    initAiKaraokeListeners();

    const store = useAiKaraokeStore.getState();
    const jobId = `karaoke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    store.setActiveJobId(jobId);
    store.updateProgress({
        jobId,
        stage: 'checking_models',
        progress: 5,
        message: 'Đang chuẩn bị mô hình và phân tích nguồn âm thanh...',
        detail: 'Khởi tạo tiến trình tách lời và nhạc...',
        elapsedSeconds: 0,
    });

    const mssModel = options.mssModel || store.selectedMssModel;
    const asrModel = options.asrModel || store.selectedAsrModel;
    const alignmentMode = options.alignmentMode || store.alignmentMode;
    const devicePreference = options.devicePreference || store.devicePreference || 'gpu';
    let rawLyrics = (options.rawLyrics !== undefined ? options.rawLyrics : store.rawLyricsText) || '';

    // If lyrics are not provided, auto-fetch from playback store or omni lyrics provider
    if (!rawLyrics.trim() && options.song) {
        try {
            const playbackLyrics = usePlaybackStore.getState().lyrics;
            const currentPlaying = usePlaybackStore.getState().currentSong;
            if (currentPlaying && String(currentPlaying.id) === String(options.song.id) && playbackLyrics?.lines?.length) {
                rawLyrics = playbackLyrics.lines
                    .map((l) => {
                        const text = (l.fullText || (l.words || []).map((w) => w.text).join('') || '').trim();
                        if (!text) return '';
                        if (typeof l.startTime === 'number' && l.startTime >= 0) {
                            const totalCentis = Math.round(l.startTime * 100);
                            const min = Math.floor(totalCentis / 6000);
                            const sec = Math.floor((totalCentis % 6000) / 100);
                            const cs = totalCentis % 100;
                            const pad = (n: number) => String(n).padStart(2, '0');
                            return `[${pad(min)}:${pad(sec)}.${pad(cs)}]${text}`;
                        }
                        return text;
                    })
                    .filter(Boolean)
                    .join('\n');
            }
        } catch {}

        if (!rawLyrics.trim()) {
            try {
                const { omni } = await import('./onlineMusic/omni');
                const lyricRes = await omni.getLyrics(options.song);
                if (lyricRes?.lyrics?.lines?.length) {
                    rawLyrics = lyricRes.lyrics.lines
                        .map((l) => {
                            const text = (l.fullText || (l.words || []).map((w) => w.text).join('') || '').trim();
                            if (!text) return '';
                            if (typeof l.startTime === 'number' && l.startTime >= 0) {
                                const totalCentis = Math.round(l.startTime * 100);
                                const min = Math.floor(totalCentis / 6000);
                                const sec = Math.floor((totalCentis % 6000) / 100);
                                const cs = totalCentis % 100;
                                const pad = (n: number) => String(n).padStart(2, '0');
                                return `[${pad(min)}:${pad(sec)}.${pad(cs)}]${text}`;
                            }
                            return text;
                        })
                        .filter(Boolean)
                        .join('\n');
                }
            } catch {}
        }
    }

    let audioSrc = usePlaybackStore.getState().audioSrc || '';
    const songAny = options.song as any;
    let audioPath = songAny.filePath || songAny.path || '';

    // 0. Check if song has been downloaded via Folia's download service/store
    if (!audioPath && options.song?.id) {
        try {
            const { useDownloadStore } = await import('../stores/useDownloadStore');
            const dlItem = useDownloadStore.getState().items.find(it => String(it.songId) === String(options.song.id) && it.status === 'done');
            if (dlItem?.path) {
                audioPath = dlItem.path;
            }
            if (!audioPath && window.electron?.download?.checkDownloaded) {
                const checks = await window.electron.download.checkDownloaded([String(options.song.id)]);
                const hit = checks?.[String(options.song.id)];
                if (hit?.path) {
                    audioPath = hit.path;
                }
            }
        } catch {}
    }

    // 0b. Check if song audio is cached on disk in Folia's audio cache
    let audioCacheKey = '';
    if (options.song) {
        try {
            const { getSongResourceCacheKey } = await import('./onlineMusic/resourceKeys');
            audioCacheKey = getSongResourceCacheKey('audio', options.song);
            if (!audioPath && window.electron?.getAudioCachePath) {
                const cached = await window.electron.getAudioCachePath(audioCacheKey);
                if (cached?.path) {
                    audioPath = cached.path;
                }
            }
        } catch {}
    }

    // 0c. If song audio is available as an in-memory or IndexedDB blob, persist to disk cache
    if (!audioPath && (!audioSrc || audioSrc.startsWith('blob:')) && options.song && window.electron?.saveAudioCache && window.electron?.getAudioCachePath) {
        try {
            const { getCachedSongAudioBlob } = await import('./onlineMusic/resourceCache');
            const blob = await getCachedSongAudioBlob(options.song);
            if (blob) {
                const { getSongResourceCacheKey } = await import('./onlineMusic/resourceKeys');
                const cacheKey = getSongResourceCacheKey('audio', options.song);
                const arrayBuffer = await blob.arrayBuffer();
                await window.electron.saveAudioCache(cacheKey, arrayBuffer, blob.type || 'audio/mpeg', 1024 * 1024 * 500);
                const cached = await window.electron.getAudioCachePath(cacheKey);
                if (cached?.path) {
                    audioPath = cached.path;
                }
            }
        } catch {}
    }

    // 1. If local song but no filePath, attempt to resolve from IndexedDB
    if (!audioPath && options.song) {
        try {
            const { getLocalSongs } = await import('./db');
            const localSongs = await getLocalSongs();
            const songId = songAny.localRef?.songId || options.song.id;
            const match = localSongs.find(s => String(s.id) === String(songId));
            if (match?.filePath) {
                audioPath = match.filePath;
            }
        } catch {}
    }

    // If audioSrc is a renderer blob URL that Node cannot fetch, clear it so omni resolves the real URL
    if (audioSrc && audioSrc.startsWith('blob:')) {
        audioSrc = '';
    }

    // 2. If online song and audioSrc is missing or belongs to another song, resolve dynamically via omni
    if (!audioPath && (!audioSrc || String(usePlaybackStore.getState().currentSong?.id) !== String(options.song.id))) {
        try {
            const { omni } = await import('./onlineMusic/omni');
            const { toSafePlaybackUrl } = await import('../utils/appPlaybackHelpers');
            const source = await omni.getAudioSource(options.song, 'high');
            if (source?.url) {
                audioSrc = toSafePlaybackUrl(source.url) || source.url;
            }
        } catch (e) {
            console.warn('[aiKaraoke] Could not auto-resolve online audio source:', e);
        }
    }

    // 2b. Fallback: Song Unlock Servers (skip in unit test environment)
    const isTestEnv = typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST);
    if (!audioPath && !audioSrc && !isTestEnv) {
        try {
            const { useSongUnlockSettingsStore } = await import('../stores/useSongUnlockSettingsStore');
            const { getUnlockAudioSource } = await import('./songUnlockService');
            const unlockSettings = useSongUnlockSettingsStore.getState();
            if (unlockSettings.useSongUnlock) {
                const unlockResult = await getUnlockAudioSource(options.song, unlockSettings.songUnlockServers);
                if (unlockResult?.url) {
                    audioSrc = unlockResult.url;
                }
            }
        } catch (unlockErr) {
            console.warn('[aiKaraoke] unlock fallback failed:', unlockErr);
        }
    }

    // 2c. Fallback: Currently playing track source
    if (!audioPath && !audioSrc) {
        const currentPlaying = usePlaybackStore.getState().currentSong;
        const currentSrc = usePlaybackStore.getState().audioSrc;
        if (currentPlaying && String(currentPlaying.id) === String(options.song.id) && currentSrc && !currentSrc.startsWith('blob:')) {
            audioSrc = currentSrc;
        }
    }

    try {
        const result = await bridge.startJob({
            jobId,
            songId: String(options.song.id),
            songTitle: options.song.name,
            artist: options.song.artists?.map(a => a.name).join(', ') || songAny.artist || '',
            duration: Math.round((options.song.durationMs || 0) / 1000) || songAny.duration || 200,
            audioPath,
            audioSrc,
            audioCacheKey,
            rawLyrics,
            mssModel,
            asrModel,
            alignmentMode,
            devicePreference,
        });

        if (result && !result.canceled) {
            store.setResult(result);
        } else if (result?.canceled) {
            store.resetJob();
        }
        return result;
    } catch (err) {
        if (err instanceof Error && (err.message.includes('Canceled by user') || err.message.includes('Canceled'))) {
            store.resetJob();
            return { canceled: true } as any;
        }
        store.updateProgress({
            stage: 'error',
            progress: 0,
            message: `Lỗi: ${err instanceof Error ? err.message : String(err)}`,
            elapsedSeconds: 0,
        });
        throw err;
    }
};

/**
 * Cancels the currently running AI Karaoke job.
 */
export const cancelCurrentKaraokeJob = async (): Promise<boolean> => {
    const bridge = window.electron?.aiKaraoke;
    const store = useAiKaraokeStore.getState();
    const activeJobId = store.activeJobId;
    if (!bridge?.cancelJob || !activeJobId) {
        store.resetJob();
        return false;
    }

    try {
        const res = await bridge.cancelJob(activeJobId);
        store.resetJob();
        const { setStatusMessage } = await import('../stores/useStatusMessageStore');
        setStatusMessage({ type: 'info', text: 'Đã hủy tiến trình AI Karaoke' });
        return res.canceled;
    } catch {
        store.resetJob();
        return false;
    }
};

/**
 * Exports generated LRC content to a file on disk.
 */
export const exportKaraokeLrcFile = async (
    content: string,
    defaultFileName?: string,
): Promise<boolean> => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge?.exportLrcFile) return false;
    try {
        const res = await bridge.exportLrcFile({ defaultFileName, content });
        return Boolean(res.ok);
    } catch {
        return false;
    }
};

/**
 * Opens the system folder where AI models are stored.
 */
export const openAiKaraokeModelsDirectory = async (): Promise<boolean> => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge?.openModelsDir) return false;
    try {
        const res = await bridge.openModelsDir();
        return Boolean(res.ok);
    } catch {
        return false;
    }
};

/**
 * Opens the output folder where karaoke stems and lyrics are cached for a song.
 */
export const openAiKaraokeOutputDirectory = async (songId?: string): Promise<boolean> => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge?.openOutputDir) return false;
    try {
        const res = await bridge.openOutputDir(songId);
        return Boolean(res.ok);
    } catch {
        return false;
    }
};

/**
 * Fetches all karaoke output records from disk.
 */
export const fetchKaraokeOutputs = async (): Promise<import('../types/aiKaraoke').KaraokeOutputSummary[]> => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge?.listOutputs) return [];
    try {
        const list = await bridge.listOutputs();
        useAiKaraokeStore.getState().setOutputs(list);
        return list;
    } catch {
        return [];
    }
};

/**
 * Deletes a karaoke output folder for a song to free space.
 */
export const deleteKaraokeOutput = async (songId: string): Promise<boolean> => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge?.deleteOutput) return false;
    try {
        const res = await bridge.deleteOutput(songId);
        if (res.ok) {
            await fetchKaraokeOutputs();
            return true;
        }
        return false;
    } catch {
        return false;
    }
};

