// src/services/aiKaraokeService.ts
// Service communicating with Electron's AI Karaoke bridge for separation,
// model downloads, and karaoke lyric alignment jobs.

import { useAiKaraokeStore } from '../stores/useAiKaraokeStore';
import type { SongResult } from '../types';
import type {
    AiModelInfo,
    KaraokeGenerationResult,
    MssModelId,
    AsrModelId,
    KaraokeAlignmentMode,
} from '../types/aiKaraoke';

let progressUnsub: (() => void) | null = null;
let modelProgressUnsub: (() => void) | null = null;

/**
 * Initializes listeners for background AI Karaoke progress and model download progress.
 */
export const initAiKaraokeListeners = (): (() => void) => {
    const bridge = window.electron?.aiKaraoke;
    if (!bridge) return () => {};

    if (progressUnsub) progressUnsub();
    if (modelProgressUnsub) modelProgressUnsub();

    progressUnsub = bridge.onJobProgress((progress) => {
        useAiKaraokeStore.getState().updateProgress(progress);
    });

    modelProgressUnsub = bridge.onModelProgress((p) => {
        useAiKaraokeStore.getState().updateModelDownload(p.modelId, p.percent, {
            receivedBytes: p.receivedBytes,
            totalBytes: p.totalBytes,
            speedBytesPerSec: p.speedBytesPerSec,
        });
    });

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

    const store = useAiKaraokeStore.getState();
    const jobId = `karaoke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    store.setActiveJobId(jobId);

    const mssModel = options.mssModel || store.selectedMssModel;
    const asrModel = options.asrModel || store.selectedAsrModel;
    const alignmentMode = options.alignmentMode || store.alignmentMode;
    const rawLyrics = options.rawLyrics !== undefined ? options.rawLyrics : store.rawLyricsText;

    try {
        const result = await bridge.startJob({
            jobId,
            songId: String(options.song.id),
            songTitle: options.song.name,
            artist: options.song.artists?.map(a => a.name).join(', ') || (options.song as any).artist || '',
            duration: Math.round((options.song.durationMs || 0) / 1000) || (options.song as any).duration || 200,
            rawLyrics,
            mssModel,
            asrModel,
            alignmentMode,
        });

        store.setResult(result);
        return result;
    } catch (err) {
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
    const activeJobId = useAiKaraokeStore.getState().activeJobId;
    if (!bridge?.cancelJob || !activeJobId) return false;

    try {
        const res = await bridge.cancelJob(activeJobId);
        useAiKaraokeStore.getState().setActiveJobId(null);
        return res.canceled;
    } catch {
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

