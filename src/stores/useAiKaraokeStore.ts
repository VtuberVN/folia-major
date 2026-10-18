// src/stores/useAiKaraokeStore.ts
// Zustand store managing AI Karaoke MSS & ASR modal state, selected models,
// job progress, and generated karaoke lyric results.

import { create } from 'zustand';
import type { SongResult } from '../types';
import type {
    AiModelInfo,
    MssModelId,
    AsrModelId,
    KaraokeAlignmentMode,
    KaraokeJobProgress,
    KaraokeJobStage,
    KaraokeGenerationResult,
} from '../types/aiKaraoke';

interface AiKaraokeState {
    isOpen: boolean;
    activeSong: SongResult | null;
    models: AiModelInfo[];
    selectedMssModel: MssModelId;
    selectedAsrModel: AsrModelId;
    alignmentMode: KaraokeAlignmentMode;
    rawLyricsText: string;
    jobStage: KaraokeJobStage;
    jobProgress: number;
    jobMessage: string;
    jobDetail: string;
    elapsedSeconds: number;
    activeJobId: string | null;
    lastResult: KaraokeGenerationResult | null;

    openModal: (song?: SongResult | null, initialLyrics?: string) => void;
    closeModal: () => void;
    setMssModel: (model: MssModelId) => void;
    setAsrModel: (model: AsrModelId) => void;
    setAlignmentMode: (mode: KaraokeAlignmentMode) => void;
    setRawLyricsText: (text: string) => void;
    setModels: (models: AiModelInfo[]) => void;
    updateModelDownload: (modelId: string, percent: number) => void;
    updateProgress: (progress: KaraokeJobProgress) => void;
    setActiveJobId: (jobId: string | null) => void;
    setResult: (result: KaraokeGenerationResult | null) => void;
    resetJob: () => void;
}

export const useAiKaraokeStore = create<AiKaraokeState>((set) => ({
    isOpen: false,
    activeSong: null,
    models: [],
    selectedMssModel: 'uvr_mdxnet_kara_2',
    selectedAsrModel: 'whisper_turbo',
    alignmentMode: 'align_existing',
    rawLyricsText: '',
    jobStage: 'idle',
    jobProgress: 0,
    jobMessage: '',
    jobDetail: '',
    elapsedSeconds: 0,
    activeJobId: null,
    lastResult: null,

    openModal: (song = null, initialLyrics = '') =>
        set({
            isOpen: true,
            activeSong: song,
            rawLyricsText: initialLyrics || '',
            jobStage: 'idle',
            jobProgress: 0,
            jobMessage: '',
            jobDetail: '',
            elapsedSeconds: 0,
            activeJobId: null,
            lastResult: null,
        }),

    closeModal: () => set({ isOpen: false }),

    setMssModel: (selectedMssModel) => set({ selectedMssModel }),
    setAsrModel: (selectedAsrModel) => set({ selectedAsrModel }),
    setAlignmentMode: (alignmentMode) => set({ alignmentMode }),
    setRawLyricsText: (rawLyricsText) => set({ rawLyricsText }),

    setModels: (models) => set({ models }),

    updateModelDownload: (modelId, percent) =>
        set((state) => ({
            models: state.models.map((m) =>
                m.id === modelId
                    ? {
                          ...m,
                          downloadProgress: percent,
                          isDownloaded: percent >= 100 ? true : m.isDownloaded,
                      }
                    : m,
            ),
        })),

    updateProgress: (p) =>
        set({
            jobStage: p.stage,
            jobProgress: p.progress,
            jobMessage: p.message,
            jobDetail: p.detail || '',
            elapsedSeconds: p.elapsedSeconds,
        }),

    setActiveJobId: (activeJobId) => set({ activeJobId }),
    setResult: (lastResult) => set({ lastResult }),

    resetJob: () =>
        set({
            jobStage: 'idle',
            jobProgress: 0,
            jobMessage: '',
            jobDetail: '',
            elapsedSeconds: 0,
            activeJobId: null,
            lastResult: null,
        }),
}));

export const openAiKaraokeModal = (song?: SongResult | null, initialLyrics?: string) => {
    useAiKaraokeStore.getState().openModal(song, initialLyrics);
};
