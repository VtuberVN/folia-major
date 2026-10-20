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
    KaraokeJobMode,
    WhisperLanguage,
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
    jobMode: KaraokeJobMode;
    selectedLanguage: WhisperLanguage;
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
    applyLyricsToCurrentSong: (result: KaraokeGenerationResult, targetSong?: SongResult | null) => Promise<boolean>;
    setJobMode: (mode: KaraokeJobMode) => void;
    setLanguage: (language: WhisperLanguage) => void;
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

let activeStemBlobUrl: string | null = null;
let elapsedTicker: any = null;
const startElapsedTicker = () => {
    if (elapsedTicker) return;
    elapsedTicker = setInterval(() => {
        useAiKaraokeStore.setState((state) => ({
            elapsedSeconds:
                state.jobStage !== 'idle' &&
                state.jobStage !== 'completed' &&
                state.jobStage !== 'error'
                    ? state.elapsedSeconds + 1
                    : state.elapsedSeconds,
        }));
    }, 1000);
};

const stopElapsedTicker = () => {
    if (elapsedTicker) {
        clearInterval(elapsedTicker);
        elapsedTicker = null;
    }
};

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
    jobMode: 'stem_and_lyrics',
    selectedLanguage: 'auto',
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

        const songToInspect = song || state.activeSong;
        const songName = songToInspect?.name || '';
        const artistName = songToInspect?.artists?.map((a) => a.name).join(' ') || (songToInspect as any)?.artist || '';
        const hasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(`${songName} ${artistName}`);

        set({
            isOpen: true,
            activeTab: targetTab,
            selectedLanguage: hasVietnamese ? 'vi' : (state.selectedLanguage || 'auto'),
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
            const { usePlaybackStore } = await import('./usePlaybackStore');
            const { getActiveAudioElement } = await import('../components/app/playback/usePlaybackRuntimeRefs');
            const { PlayerState } = await import('../types');
            const { LyricParserFactory } = await import('../utils/lyrics/LyricParserFactory');
            const { currentTime } = await import('./motionSignals');
            const audioElement = getActiveAudioElement();

            const targetSongId = `karaoke-${output.songId}-${stem}`;
            const currentSong = usePlaybackStore.getState().currentSong;
            const playerState = usePlaybackStore.getState().playerState;

            // Toggle play / pause if the same stem is already selected
            if (currentSong?.id === targetSongId) {
                if (playerState === PlayerState.PLAYING) {
                    if (audioElement) {
                        try { audioElement.pause(); } catch {}
                    }
                    usePlaybackStore.getState().setPlayerState(PlayerState.PAUSED);
                    return true;
                } else {
                    if (audioElement) {
                        void audioElement.play().catch(() => {});
                    }
                    usePlaybackStore.getState().setPlayerState(PlayerState.PLAYING);
                    return true;
                }
            }

            const audioBuffer = await window.electron?.aiKaraoke?.getStemAudio?.(filePath);
            if (!audioBuffer) {
                setStatusMessage({ type: 'error', text: 'Không thể nạp tệp âm thanh từ đĩa.' });
                return false;
            }
            if (activeStemBlobUrl) {
                try { URL.revokeObjectURL(activeStemBlobUrl); } catch {}
            }
            const blob = new Blob([audioBuffer as BlobPart], { type: 'audio/wav' });
            const blobUrl = URL.createObjectURL(blob);
            activeStemBlobUrl = blobUrl;

            // Fetch and parse the separated/karaoke lyrics from cached result
            let parsedLyrics = null;
            let lrcText = '';
            if (window.electron?.aiKaraoke?.getCachedResult) {
                try {
                    const cached = await window.electron.aiKaraoke.getCachedResult(output.songId);
                    lrcText = cached?.enhancedLrcText || cached?.lrcText || '';
                } catch (e) {
                    console.warn('[aiKaraoke] Error getting cached lyrics for stem:', e);
                }
            }

            if (lrcText && lrcText.trim().length > 0) {
                try {
                    const { parseLyricsByFormat } = await import('../utils/lyrics/parserCore');
                    const { detectTimedLyricFormat } = await import('../utils/lyrics/formatDetection');
                    const format = detectTimedLyricFormat(lrcText);
                    parsedLyrics = parseLyricsByFormat(format, lrcText);
                } catch (e) {
                    console.warn('[aiKaraoke] Error parsing karaoke lyrics:', e);
                }
            }

            const stemSong = {
                id: targetSongId,
                name: `${output.songTitle} [${stem === 'beat' ? 'Beat' : 'Vocal'}]`,
                artists: output.artist ? [{ id: 0, name: output.artist }] : [{ id: 0, name: 'AI Karaoke' }],
                album: { id: 0, name: 'AI Karaoke Stems' },
                durationMs: (output.duration || 0) * 1000,
                isLocal: true as const,
                sourceRef: { kind: 'local' as const, mediaId: targetSongId },
                localRef: { songId: targetSongId },
                filePath: filePath,
                onlineLyricsState: {
                    lyricsSource: 'imported' as const,
                    importedLyrics: parsedLyrics,
                    importedLyricsName: 'AI Karaoke',
                },
                audioQualityInfo: {
                    bitrate: 1411200,
                    sampleRate: 44100,
                    bitDepth: 16,
                },
            };

            // 1. Reset timeline clocks and indices
            currentTime.set(0);
            usePlaybackStore.getState().setCurrentLineIndex(-1);
            usePlaybackStore.getState().setLyricTimelineOffsetMs(0);
            usePlaybackStore.getState().setDuration(output.duration || 0);

            // 2. Set parsed lyrics in store (replaces previous song lyrics with stem lyrics or null)
            usePlaybackStore.getState().setLyricsState(parsedLyrics);
            usePlaybackStore.getState().setActiveLocalLyricsSource(parsedLyrics ? 'local' : null);

            // 3. Mark autoplay and establish song identity across all playback controllers and WASAPI
            const { makeSongCurrent } = await import('../components/app/playback/currentSong');
            const { setGlobalShouldAutoPlay } = await import('../components/app/playback/usePlaybackRuntimeRefs');
            setGlobalShouldAutoPlay(true);
            makeSongCurrent(stemSong);
            usePlaybackStore.getState().setAudioSrc(blobUrl);

            // 4. Handle audio element seamlessly without "phát ảo" or mute
            if (audioElement) {
                try {
                    const { markProgrammaticPause } = await import('../services/playbackFade');
                    markProgrammaticPause(audioElement);
                    audioElement.pause();
                } catch {}

                audioElement.src = blobUrl;
                audioElement.currentTime = 0;

                const startAudio = () => {
                    void audioElement.play().catch((err) => {
                        console.warn('[playOutputStem] Audio element play caught:', err);
                    });
                };

                if (audioElement.readyState >= 2) {
                    startAudio();
                } else {
                    const onCanPlay = () => {
                        audioElement.removeEventListener('canplay', onCanPlay);
                        startAudio();
                    };
                    audioElement.addEventListener('canplay', onCanPlay, { once: true });
                    try { audioElement.load(); } catch {}
                }
            }

            // 5. Immediately transition to PLAYING state
            usePlaybackStore.getState().setPlayerState(PlayerState.PLAYING);

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

    applyLyricsToCurrentSong: async (result, targetSong) => {
        try {
            const lrcText = result.enhancedLrcText || result.lrcText;
            if (!lrcText || !lrcText.trim()) {
                setStatusMessage({ type: 'error', text: 'Không có nội dung lời bài hát để áp dụng.' });
                return false;
            }

            const { parseLyricsByFormat } = await import('../utils/lyrics/parserCore');
            const { detectTimedLyricFormat } = await import('../utils/lyrics/formatDetection');
            const format = detectTimedLyricFormat(lrcText);
            const parsedLyrics = parseLyricsByFormat(format, lrcText);

            if (!parsedLyrics || !parsedLyrics.lines || parsedLyrics.lines.length === 0) {
                setStatusMessage({ type: 'error', text: 'Định dạng lời bài hát không hợp lệ.' });
                return false;
            }

            const { usePlaybackStore } = await import('./usePlaybackStore');
            const activePlayingSong = usePlaybackStore.getState().currentSong;
            const songToApply = targetSong || useAiKaraokeStore.getState().activeSong || activePlayingSong;
            if (!songToApply) {
                setStatusMessage({ type: 'error', text: 'Không xác định được bài hát cần áp dụng lời.' });
                return false;
            }

            // Check if target song is a local song
            const { isLocalPlaybackSong } = await import('../utils/appPlaybackGuards');
            if (isLocalPlaybackSong(songToApply)) {
                const { getLocalSong, saveLocalSong } = await import('../services/db');
                const localSongId = songToApply.localRef?.songId || (songToApply as any).id;
                if (localSongId) {
                    const localData = await getLocalSong(String(localSongId));
                    if (localData) {
                        await saveLocalSong({
                            ...localData,
                            matchedLyrics: parsedLyrics,
                            hasLocalLyrics: true,
                            localLyricsContent: lrcText,
                            lyricsSource: 'local',
                        });
                    }
                }
            } else {
                // Online song
                const { saveOnlineLyricsState } = await import('../utils/onlineLyricsState');
                await saveOnlineLyricsState(songToApply, {
                    lyricsSource: 'imported',
                    importedLyrics: parsedLyrics,
                    importedLyricsName: 'AI Karaoke',
                });
            }

            // ONLY update active playback lyrics in store if the target song is currently playing!
            if (activePlayingSong && String(activePlayingSong.id) === String(songToApply.id)) {
                usePlaybackStore.getState().setLyricsState(parsedLyrics);
                usePlaybackStore.getState().setActiveLocalLyricsSource('local');
            }

            setStatusMessage({
                type: 'success',
                text: `✨ Đã áp dụng lời AI Karaoke (${parsedLyrics.isWordByWord ? 'Khớp từng từ' : 'Từng dòng'}) cho bài hát ${songToApply.name || ''}!`,
            });
            return true;
        } catch (err) {
            console.error('[aiKaraoke] Error applying lyrics to song:', err);
            setStatusMessage({ type: 'error', text: `Lỗi áp dụng lời: ${String(err)}` });
            return false;
        }
    },

    setJobMode: (jobMode) => set({ jobMode }),
    setLanguage: (selectedLanguage) => set({ selectedLanguage }),
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

    updateProgress: (p) => {
        if (p.stage === 'completed' || p.stage === 'error' || p.stage === 'idle') {
            stopElapsedTicker();
        } else {
            startElapsedTicker();
        }
        set({
            jobStage: p.stage,
            jobProgress: p.progress,
            jobMessage: p.message,
            jobDetail: p.detail || '',
            elapsedSeconds: p.elapsedSeconds,
        });
    },

    setActiveJobId: (activeJobId) => set({ activeJobId }),
    setResult: (lastResult) => {
        stopElapsedTicker();
        set({ lastResult });
    },

    resetJob: () => {
        stopElapsedTicker();
        set({
            jobStage: 'idle',
            jobProgress: 0,
            jobMessage: '',
            jobDetail: '',
            elapsedSeconds: 0,
            activeJobId: null,
            lastResult: null,
        });
    },

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
                const { setGlobalShouldAutoPlay } = await import('../components/app/playback/usePlaybackRuntimeRefs');
                setGlobalShouldAutoPlay(isPlaying);
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

        const { setGlobalShouldAutoPlay } = await import('../components/app/playback/usePlaybackRuntimeRefs');
        setGlobalShouldAutoPlay(isPlaying);
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
