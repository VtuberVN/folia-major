// src/stores/useAiKaraokeStore.ts
// Zustand store managing AI Karaoke MSS & ASR modal state, selected models,
// job progress, and generated karaoke lyric results.

import { create } from 'zustand';
import type { SongResult } from '../types';
import { setStatusMessage } from './useStatusMessageStore';
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
    isKaraokeBeatMode: boolean;
    originalTrackSrc: string | null;
    instrumentalBlobUrl: string | null;
    cachedKaraokeForCurrentSong: KaraokeGenerationResult | null;

    openModal: (song?: SongResult | null, initialLyrics?: string) => void;
    closeModal: () => void;
    setMssModel: (model: MssModelId) => void;
    setAsrModel: (model: AsrModelId) => void;
    setAlignmentMode: (mode: KaraokeAlignmentMode) => void;
    setRawLyricsText: (text: string) => void;
    setModels: (models: AiModelInfo[]) => void;
    updateModelDownload: (
        modelId: string,
        percent: number,
        details?: { receivedBytes: number; totalBytes: number; speedBytesPerSec?: number },
    ) => void;
    updateProgress: (progress: KaraokeJobProgress) => void;
    setActiveJobId: (jobId: string | null) => void;
    setResult: (result: KaraokeGenerationResult | null) => void;
    resetJob: () => void;
    checkCurrentSongKaraoke: (songId?: string | number | null) => Promise<KaraokeGenerationResult | null>;
    toggleKaraokeBeatMode: (song?: SongResult | null) => Promise<boolean>;
}

export const useAiKaraokeStore = create<AiKaraokeState>((set, get) => ({
    isOpen: false,
    activeSong: null,
    models: [],
    selectedMssModel: 'htdemucs_mnn',
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
    isKaraokeBeatMode: false,
    originalTrackSrc: null,
    instrumentalBlobUrl: null,
    cachedKaraokeForCurrentSong: null,

    openModal: (song = null, initialLyrics = '') => {
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
        });

        // Check if there is an existing cached karaoke output for this song
        if (song?.id && window.electron?.aiKaraoke?.getCachedResult) {
            void window.electron.aiKaraoke.getCachedResult(String(song.id)).then((cached) => {
                if (cached) {
                    set({ lastResult: cached });
                }
            });
        }
    },

    closeModal: () => set({ isOpen: false }),

    setMssModel: (selectedMssModel) => set({ selectedMssModel }),
    setAsrModel: (selectedAsrModel) => set({ selectedAsrModel }),
    setAlignmentMode: (alignmentMode) => set({ alignmentMode }),
    setRawLyricsText: (rawLyricsText) => set({ rawLyricsText }),

    setModels: (models) => set({ models }),

    updateModelDownload: (modelId, percent, details) =>
        set((state) => ({
            models: state.models.map((m) =>
                m.id === modelId
                    ? {
                          ...m,
                          downloadProgress: percent,
                          isDownloaded: percent >= 100 ? true : m.isDownloaded,
                          downloadDetails: details || m.downloadDetails,
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

    checkCurrentSongKaraoke: async (songId) => {
        if (!songId || !window.electron?.aiKaraoke?.getCachedResult) {
            set({ cachedKaraokeForCurrentSong: null });
            return null;
        }
        try {
            const cached = await window.electron.aiKaraoke.getCachedResult(String(songId));
            set({ cachedKaraokeForCurrentSong: cached });
            return cached;
        } catch {
            set({ cachedKaraokeForCurrentSong: null });
            return null;
        }
    },

    toggleKaraokeBeatMode: async (song) => {
        const state = get();
        const { usePlaybackStore } = await import('./usePlaybackStore');
        if (state.isKaraokeBeatMode) {
            // Turning OFF: restore original audio source
            const original = state.originalTrackSrc;
            const audioElement = document.querySelector('audio') as HTMLAudioElement | null;
            const currentTime = audioElement ? audioElement.currentTime : 0;
            const isPlaying = audioElement ? !audioElement.paused : false;

            if (original) {
                usePlaybackStore.getState().setAudioSrc(original);
                if (audioElement) {
                    audioElement.src = original;
                    audioElement.currentTime = currentTime;
                    if (isPlaying) void audioElement.play().catch(() => {});
                }
            }
            if (state.instrumentalBlobUrl) {
                URL.revokeObjectURL(state.instrumentalBlobUrl);
            }
            set({ isKaraokeBeatMode: false, originalTrackSrc: null, instrumentalBlobUrl: null });
            setStatusMessage({ type: 'info', text: 'Đã tắt chế độ Karaoke: Trở lại bài hát gốc' });
            return false;
        }

        // Turning ON: find separated instrumental track
        const activeSong = song || state.activeSong || usePlaybackStore.getState().currentSong;
        if (!activeSong?.id) return false;

        let cached = state.lastResult;
        if (!cached || String(cached.songId) !== String(activeSong.id)) {
            cached = (await window.electron?.aiKaraoke?.getCachedResult?.(String(activeSong.id))) || null;
        }

        if (!cached || !cached.instrumentalPath) {
            setStatusMessage({
                type: 'info',
                text: 'Bài hát này chưa được tách Beat. Vui lòng bấm "Tách nhạc" trước để tạo bản Karaoke.',
            });
            state.openModal(activeSong);
            return false;
        }

        const audioBuffer = await window.electron?.aiKaraoke?.getStemAudio?.(cached.instrumentalPath);
        if (!audioBuffer) {
            setStatusMessage({ type: 'error', text: 'Không thể đọc tệp Beat karaoke từ đĩa.' });
            return false;
        }

        const blob = new Blob([audioBuffer as ArrayBuffer], { type: 'audio/wav' });
        const blobUrl = URL.createObjectURL(blob);
        const audioElement = document.querySelector('audio') as HTMLAudioElement | null;
        const currentTime = audioElement ? audioElement.currentTime : 0;
        const isPlaying = audioElement ? !audioElement.paused : false;
        const currentSrc = usePlaybackStore.getState().audioSrc;

        set({
            isKaraokeBeatMode: true,
            originalTrackSrc: currentSrc,
            instrumentalBlobUrl: blobUrl,
            cachedKaraokeForCurrentSong: cached,
        });

        usePlaybackStore.getState().setAudioSrc(blobUrl);
        if (audioElement) {
            audioElement.src = blobUrl;
            audioElement.currentTime = currentTime;
            if (isPlaying) void audioElement.play().catch(() => {});
        }

        setStatusMessage({
            type: 'success',
            text: '🎤 Đã bật chế độ Karaoke: Đang phát Beat (Đã tắt giọng ca sĩ)',
        });
        return true;
    },
}));

export const openAiKaraokeModal = (song?: SongResult | null, initialLyrics?: string) => {
    useAiKaraokeStore.getState().openModal(song, initialLyrics);
};
