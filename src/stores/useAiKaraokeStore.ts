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
    KaraokeOutputSummary,
} from '../types/aiKaraoke';

interface AiKaraokeState {
    isOpen: boolean;
    activeTab: 'process' | 'running' | 'library';
    activeSong: SongResult | null;
    models: AiModelInfo[];
    outputs: KaraokeOutputSummary[];
    isLoadingOutputs: boolean;
    selectedMssModel: MssModelId;
    selectedAsrModel: AsrModelId;
    alignmentMode: KaraokeAlignmentMode;
    devicePreference: 'gpu' | 'cpu';
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

    openModal: (song?: SongResult | null, initialLyrics?: string, initialTab?: 'process' | 'running' | 'library') => void;
    closeModal: () => void;
    setActiveTab: (tab: 'process' | 'running' | 'library') => void;
    setOutputs: (outputs: KaraokeOutputSummary[]) => void;
    fetchOutputs: () => Promise<KaraokeOutputSummary[]>;
    deleteOutput: (songId: string) => Promise<boolean>;
    playOutputStem: (output: KaraokeOutputSummary, stem: 'beat' | 'vocal') => Promise<boolean>;
    setMssModel: (model: MssModelId) => void;
    setAsrModel: (model: AsrModelId) => void;
    setAlignmentMode: (mode: KaraokeAlignmentMode) => void;
    setDevicePreference: (preference: 'gpu' | 'cpu') => void;
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
    activeTab: 'process',
    activeSong: null,
    models: [],
    outputs: [],
    isLoadingOutputs: false,
    selectedMssModel: 'htdemucs_mnn',
    selectedAsrModel: 'whisper_turbo',
    alignmentMode: 'align_existing',
    devicePreference: 'gpu',
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

    openModal: (song = null, initialLyrics = '', initialTab = 'process') => {
        const state = get();
        const isRunning =
            state.jobStage !== 'idle' &&
            state.jobStage !== 'completed' &&
            state.jobStage !== 'error';
        const targetTab = isRunning && initialTab === 'process' ? 'running' : initialTab;

        set({
            isOpen: true,
            activeTab: targetTab,
            ...(song ? { activeSong: song } : {}),
            ...(initialLyrics ? { rawLyricsText: initialLyrics } : {}),
            ...(isRunning
                ? {}
                : {
                      jobStage: 'idle',
                      jobProgress: 0,
                      jobMessage: '',
                      jobDetail: '',
                      elapsedSeconds: 0,
                      activeJobId: null,
                      lastResult: null,
                  }),
        });

        // Always refresh outputs list when modal opens
        void get().fetchOutputs();

        // Check if there is an existing cached karaoke output for this song (only if not running a new job)
        if (song?.id && window.electron?.aiKaraoke?.getCachedResult) {
            void window.electron.aiKaraoke.getCachedResult(String(song.id)).then((cached) => {
                if (cached && !isRunning) {
                    set({ lastResult: cached });
                }
            });
        }
    },

    closeModal: () => set({ isOpen: false }),
    setActiveTab: (activeTab) => set({ activeTab }),
    setOutputs: (outputs) => set({ outputs }),

    fetchOutputs: async () => {
        const bridge = window.electron?.aiKaraoke;
        if (!bridge?.listOutputs) return [];
        set({ isLoadingOutputs: true });
        try {
            const list = await bridge.listOutputs();
            set({ outputs: list, isLoadingOutputs: false });
            return list;
        } catch {
            set({ isLoadingOutputs: false });
            return [];
        }
    },

    deleteOutput: async (songId: string) => {
        const bridge = window.electron?.aiKaraoke;
        if (!bridge?.deleteOutput) return false;
        try {
            const res = await bridge.deleteOutput(songId);
            if (res.ok) {
                await get().fetchOutputs();
                setStatusMessage({ type: 'info', text: 'Đã xóa bản tách Karaoke thành công' });
                return true;
            }
            return false;
        } catch (err) {
            setStatusMessage({ type: 'error', text: `Lỗi khi xóa bản tách: ${String(err)}` });
            return false;
        }
    },

    playOutputStem: async (output, stem) => {
        const filePath = stem === 'beat' ? output.instrumentalPath : output.vocalsPath;
        if (!filePath) {
            setStatusMessage({ type: 'error', text: 'Tệp âm thanh không tồn tại trên đĩa.' });
            return false;
        }
        try {
            const audioBuffer = await window.electron?.aiKaraoke?.getStemAudio?.(filePath);
            if (!audioBuffer) {
                setStatusMessage({ type: 'error', text: 'Không thể nạp tệp âm thanh từ đĩa.' });
                return false;
            }
            const blob = new Blob([audioBuffer as BlobPart], { type: 'audio/wav' });
            const blobUrl = URL.createObjectURL(blob);
            const { usePlaybackStore } = await import('./usePlaybackStore');
            const { getActiveAudioElement } = await import('../components/app/playback/usePlaybackRuntimeRefs');
            const audioElement = getActiveAudioElement();

            usePlaybackStore.getState().setCurrentSong((prev) =>
                prev
                    ? { ...prev, name: `${output.songTitle} [${stem === 'beat' ? 'Beat' : 'Vocal'}]` }
                    : {
                          id: `karaoke-stem-${output.songId}-${stem}`,
                          name: `${output.songTitle} [${stem === 'beat' ? 'Beat' : 'Vocal'}]`,
                          artists: output.artist ? [{ id: 0, name: output.artist }] : [],
                          album: { id: 0, name: 'AI Karaoke Stems' },
                          durationMs: (output.duration || 0) * 1000,
                      },
            );
            usePlaybackStore.getState().setAudioSrc(blobUrl);
            if (audioElement) {
                audioElement.src = blobUrl;
                audioElement.currentTime = 0;
                void audioElement.play().catch(() => {});
            }
            setStatusMessage({
                type: 'info',
                text: `Đang phát ${stem === 'beat' ? 'Beat Karaoke' : 'Giọng hát'}: ${output.songTitle}`,
            });
            return true;
        } catch (err) {
            setStatusMessage({ type: 'error', text: `Lỗi phát stem: ${String(err)}` });
            return false;
        }
    },

    setMssModel: (selectedMssModel) => set({ selectedMssModel }),
    setAsrModel: (selectedAsrModel) => set({ selectedAsrModel }),
    setAlignmentMode: (alignmentMode) => set({ alignmentMode }),
    setDevicePreference: (devicePreference) => set({ devicePreference }),
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
        const { getActiveAudioElement } = await import('../components/app/playback/usePlaybackRuntimeRefs');
        const audioElement = getActiveAudioElement() || (document.querySelector('audio') as HTMLAudioElement | null);

        if (state.isKaraokeBeatMode) {
            // Turning OFF: restore original audio source
            const original = state.originalTrackSrc;
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
                text: 'Bài hát này chưa được tách Beat. Vui lòng bấm "Tách lời và nhạc" trước để tạo bản Karaoke.',
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

export const openAiKaraokeModal = (
    song?: SongResult | null,
    initialLyrics?: string,
    initialTab: 'process' | 'running' | 'library' = 'process',
) => {
    useAiKaraokeStore.getState().openModal(song, initialLyrics, initialTab);
};

export const openAiKaraokeLibraryModal = () => {
    useAiKaraokeStore.getState().openModal(null, '', 'library');
};
