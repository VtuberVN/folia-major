// src/components/karaoke/AiKaraokeModal.tsx
// Comprehensive AI Karaoke Modal for Folia-major using Folia's native Sheet design system.
// Handles Music Source Separation (MSS) + ASR / Word-Level Forced Alignment with real caching and model progress.

import React, { useState, useEffect, useMemo } from 'react';
import {
    Mic,
    Sparkles,
    Check,
    AlertCircle,
    Download,
    FileText,
    RefreshCw,
    Layers,
    FolderOpen,
    Trash2,
    Sliders,
    Play,
    Edit3,
    Cpu,
    Zap,
    Minimize2,
    Activity,
    Info,
    Globe,
    Volume2,
    Pause,
    Clock,
    ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Sheet from '../shared/Sheet';
import { useAiKaraokeStore } from '../../stores/useAiKaraokeStore';
import { usePlaybackStore, selectDisplayPlayerState } from '../../stores/usePlaybackStore';
import { openVisualLrcEditor } from '../../stores/useLrcEditorStore';
import {
    fetchAiModels,
    downloadAiModel,
    deleteAiModel,
    startKaraokeJob,
    cancelCurrentKaraokeJob,
    openAiKaraokeModelsDirectory,
    openAiKaraokeOutputDirectory,
} from '../../services/aiKaraokeService';
import { KaraokeOutputsLibraryTab } from './KaraokeOutputsLibraryTab';
import type { MssModelId, AsrModelId, KaraokeAlignmentMode, KaraokeDevicePreference } from '../../types/aiKaraoke';
import type { Theme, SongResult } from '../../types';
import { PlayerState } from '../../types';

interface AiKaraokeModalProps {
    theme?: Theme;
    isDaylight?: boolean;
    onApplyLyrics?: (lrcContent: string) => void;
}

export const AiKaraokeModal: React.FC<AiKaraokeModalProps> = ({
    theme,
    isDaylight = false,
    onApplyLyrics,
}) => {
    const { t } = useTranslation();
    const {
        isOpen,
        activeTab,
        activeSong,
        models,
        outputs,
        selectedMssModel,
        selectedAsrModel,
        alignmentMode,
        jobMode,
        selectedLanguage,
        rawLyricsText,
        devicePreference,
        jobStage,
        jobProgress,
        jobMessage,
        jobDetail,
        elapsedSeconds,
        lastResult,
        isKaraokeBeatMode,
        closeModal,
        setActiveTab,
        setJobMode,
        setLanguage,
        setMssModel,
        setAsrModel,
        setAlignmentMode,
        setRawLyricsText,
        setDevicePreference,
        setResult,
        resetJob,
        toggleKaraokeBeatMode,
        applyLyricsToCurrentSong,
        playOutputStem,
        fetchOutputs,
    } = useAiKaraokeStore();

    const currentSong = usePlaybackStore((state) => state.currentSong);
    const playerState = usePlaybackStore(selectDisplayPlayerState);

    const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    const isVietnameseDetected = useMemo(() => {
        const text = `${activeSong?.name || ''} ${activeSong?.artists?.map((a) => a.name).join(' ') || ''}`;
        return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
    }, [activeSong]);

    useEffect(() => {
        if (isOpen) {
            void fetchAiModels();
            setValidationError(null);
            const songToUse = activeSong || usePlaybackStore.getState().currentSong;
            if (!activeSong && songToUse) {
                useAiKaraokeStore.getState().openModal(songToUse);
            }
            // Auto prefill lyrics from playback store if currently empty
            if (!rawLyricsText.trim()) {
                const currentLyrics = usePlaybackStore.getState().lyrics;
                const currentPlaying = usePlaybackStore.getState().currentSong;
                const matchesCurrent = !songToUse || !currentPlaying || String(songToUse.id) === String(currentPlaying.id);
                if (matchesCurrent && currentLyrics?.lines?.length) {
                    const text = currentLyrics.lines
                        .map((l) => {
                            const lineStr = (l.fullText || (l.words || []).map((w) => w.text).join('') || '').trim();
                            if (!lineStr) return '';
                            if (typeof l.startTime === 'number' && l.startTime >= 0) {
                                const totalCentis = Math.round(l.startTime * 100);
                                const min = Math.floor(totalCentis / 6000);
                                const sec = Math.floor((totalCentis % 6000) / 100);
                                const cs = totalCentis % 100;
                                const pad = (n: number) => String(n).padStart(2, '0');
                                return `[${pad(min)}:${pad(sec)}.${pad(cs)}]${lineStr}`;
                            }
                            return lineStr;
                        })
                        .filter(Boolean)
                        .join('\n');
                    if (text) {
                        setRawLyricsText(text);
                    }
                }
            }
        }
    }, [isOpen, activeSong]);

    const isJobRunning = jobStage !== 'idle' && jobStage !== 'completed' && jobStage !== 'error';

    const selectedMssModelInfo = useMemo(
        () => models.find((m) => m.id === selectedMssModel),
        [models, selectedMssModel],
    );

    const handleDownloadModel = async (modelId: string) => {
        try {
            setDownloadingModelId(modelId);
            await downloadAiModel(modelId);
        } catch (err) {
            console.error('Failed to download model:', err);
        } finally {
            setDownloadingModelId(null);
        }
    };

    const handleDeleteModel = async (modelId: string) => {
        try {
            await deleteAiModel(modelId);
        } catch (err) {
            console.error('Failed to delete model:', err);
        }
    };

    const handleStartJob = async () => {
        const songToProcess = activeSong || usePlaybackStore.getState().currentSong;
        if (!songToProcess) {
            setValidationError('Chưa chọn bài hát nào để tách lời. Vui lòng mở phát bài hát hoặc chọn một bài hát từ danh sách trước.');
            return;
        }
        setValidationError(null);

        // Model validation
        if (selectedMssModel !== 'htdemucs_mnn' && !selectedMssModelInfo?.isDownloaded) {
            setValidationError(`Vui lòng tải model "${selectedMssModelInfo?.name || selectedMssModel}" về máy trước khi bắt đầu.`);
            return;
        }

        try {
            setActiveTab('running');
            const res = await startKaraokeJob({
                song: songToProcess,
                rawLyrics: rawLyricsText,
                mssModel: selectedMssModel,
                asrModel: selectedAsrModel,
                alignmentMode,
                mode: jobMode,
                devicePreference,
                language: selectedLanguage,
            });
            if (res?.canceled) {
                return;
            }
        } catch (err: any) {
            if (err?.message?.includes('Canceled')) {
                return;
            }
            console.error('Failed to run karaoke job:', err);
            setValidationError(err?.message || 'Có lỗi xảy ra khi bắt đầu tiến trình tách lời và nhạc.');
        }
    };

    const handleApply = async () => {
        if (!lastResult) return;
        const success = await applyLyricsToCurrentSong(lastResult, activeSong);
        if (success) {
            if (onApplyLyrics) {
                onApplyLyrics(lastResult.enhancedLrcText || lastResult.lrcText);
            }
            closeModal();
        } else {
            const textToApply = lastResult.enhancedLrcText || lastResult.lrcText;
            onApplyLyrics?.(textToApply);
            closeModal();
        }
    };

    const handleOpenInLrcEditor = (initialContent?: string) => {
        const songToUse = activeSong || usePlaybackStore.getState().currentSong;
        if (!songToUse) return;
        const lrc = initialContent ?? (lastResult?.enhancedLrcText || lastResult?.lrcText || rawLyricsText || '');
        openVisualLrcEditor(songToUse, lrc);
    };

    const accentBg = theme?.accentColor || theme?.primaryColor || '#ec4899';
    const cardBg = isDaylight ? 'bg-neutral-100/80 border-neutral-200' : 'bg-neutral-800/40 border-white/5';
    const cardSelectedBg = isDaylight ? 'bg-neutral-200/90 border-neutral-400' : 'bg-neutral-700/60 border-white/20';
    const textColor = isDaylight ? 'text-neutral-900' : 'text-neutral-100';
    const subTextColor = isDaylight ? 'text-neutral-500' : 'text-neutral-400';

    const footerButtons = (() => {
        if (activeTab === 'library') {
            return (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={closeModal}
                        className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
                            isDaylight
                                ? 'border-neutral-300 hover:bg-neutral-100 text-neutral-700'
                                : 'border-white/10 hover:bg-white/5 text-neutral-300'
                        }`}
                    >
                        {t('ui.close', 'Đóng')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('process')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
                        style={{ backgroundColor: accentBg }}
                    >
                        <Sparkles size={14} />
                        <span>Tách bài hát mới</span>
                    </button>
                </div>
            );
        }

        if (activeTab === 'running') {
            return (
                <div className="flex items-center gap-2">
                    {isJobRunning ? (
                        <>
                            <button
                                type="button"
                                onClick={() => void cancelCurrentKaraokeJob()}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/10 border border-red-500/20 transition-colors"
                            >
                                Hủy tiến trình
                            </button>
                            <button
                                type="button"
                                onClick={closeModal}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                                    isDaylight
                                        ? 'border-neutral-300 hover:bg-neutral-100 text-neutral-800'
                                        : 'border-white/20 hover:bg-white/10 text-neutral-100'
                                }`}
                                title="Thu nhỏ cửa sổ và tiếp tục xử lý ngầm trong nền"
                            >
                                <Minimize2 size={13} />
                                <span>Thu nhỏ & Chạy nền</span>
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={closeModal}
                            className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
                                isDaylight
                                    ? 'border-neutral-300 hover:bg-neutral-100 text-neutral-700'
                                    : 'border-white/10 hover:bg-white/5 text-neutral-300'
                            }`}
                        >
                            {t('ui.close', 'Đóng')}
                        </button>
                    )}

                    {lastResult && (
                        <button
                            type="button"
                            onClick={handleApply}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
                            style={{ backgroundColor: accentBg }}
                        >
                            Áp dụng cho bài hát đang phát
                        </button>
                    )}
                </div>
            );
        }

        // activeTab === 'process'
        return (
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={closeModal}
                    className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
                        isDaylight
                            ? 'border-neutral-300 hover:bg-neutral-100 text-neutral-700'
                            : 'border-white/10 hover:bg-white/5 text-neutral-300'
                    }`}
                >
                    {t('ui.close', 'Đóng')}
                </button>

                {isJobRunning ? (
                    <button
                        type="button"
                        onClick={() => setActiveTab('running')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90 animate-pulse"
                        style={{ backgroundColor: accentBg }}
                    >
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Xem tiến trình ({jobProgress}%)</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={jobStage === 'error' ? resetJob : handleStartJob}
                        disabled={Boolean(downloadingModelId)}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: accentBg }}
                    >
                        <Sparkles size={15} />
                        <span>{jobStage === 'error' ? 'Thử lại' : 'Tách lời và nhạc & Tạo Lyric'}</span>
                    </button>
                )}
            </div>
        );
    })();

    const footerNote = (() => {
        if (activeTab === 'library') {
            return (
                <span className={`text-xs ${subTextColor}`}>
                    Quản lý độc lập tệp Beat & Vocal · Không ảnh hưởng thư mục nhạc cục bộ
                </span>
            );
        }
        if (activeTab === 'running') {
            return (
                <span className={`text-xs ${subTextColor}`}>
                    {isJobRunning
                        ? `Đang xử lý ${jobProgress}% · ${jobMessage}`
                        : lastResult
                        ? 'Tách hoàn tất · Beat & Lời sẵn sàng'
                        : 'Không có tiến trình đang chạy'}
                </span>
            );
        }
        if (!rawLyricsText.trim()) {
            return (
                <span className={`text-xs ${subTextColor}`}>
                    Chưa có lời · Sẽ tạo bản Beat Karaoke & Giọng hát (.wav) chất lượng cao
                </span>
            );
        }
        return (
            <span className={`text-xs ${subTextColor}`}>
                {activeSong ? `${activeSong.name}` : ''} · Căn mốc theo lời có sẵn
            </span>
        );
    })();

    return (
        <Sheet
            isOpen={isOpen}
            onClose={closeModal}
            size="l"
            title={t('karaoke.modalTitle', 'Tách lời và nhạc & Tạo Lyric')}
            subtitle={activeSong ? `${activeSong.name} — ${activeSong.artists?.map(a => a.name).join(', ') || (activeSong as any).artist || ''}` : undefined}
            isDaylight={isDaylight}
            footer={footerButtons}
            footerNote={footerNote}
        >
            <div className="space-y-6 pb-4">
                {/* Mode switcher tabs: Tách lời & nhạc vs Tiến trình đang xử lý vs Thư viện bài đã tách */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 w-fit">
                    <button
                        type="button"
                        onClick={() => setActiveTab('process')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeTab === 'process'
                                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                        }`}
                    >
                        <Sparkles size={14} style={{ color: activeTab === 'process' ? accentBg : undefined }} />
                        <span>Tách lời & nhạc</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('running')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeTab === 'running'
                                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                        }`}
                    >
                        {isJobRunning ? (
                            <RefreshCw size={14} className="animate-spin" style={{ color: accentBg }} />
                        ) : (
                            <Activity size={14} style={{ color: activeTab === 'running' ? accentBg : undefined }} />
                        )}
                        <span>Tiến trình đang xử lý</span>
                        {isJobRunning ? (
                            <span
                                className="px-1.5 py-0.5 rounded-full text-[10px] text-white font-mono font-bold animate-pulse"
                                style={{ backgroundColor: accentBg }}
                            >
                                {jobProgress}%
                            </span>
                        ) : lastResult ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Đã có kết quả" />
                        ) : null}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('library')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            activeTab === 'library'
                                ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                        }`}
                    >
                        <Layers size={14} style={{ color: activeTab === 'library' ? accentBg : undefined }} />
                        <span>Thư viện bài đã tách</span>
                        {outputs.length > 0 && (
                            <span
                                className="px-1.5 py-0.2 rounded-full text-[10px] text-white font-mono"
                                style={{ backgroundColor: accentBg }}
                            >
                                {outputs.length}
                            </span>
                        )}
                    </button>
                </div>

                {activeTab === 'library' && (
                    <KaraokeOutputsLibraryTab
                        theme={theme}
                        isDaylight={isDaylight}
                        onSelectSongForReprocess={() => setActiveTab('process')}
                    />
                )}

                {activeTab === 'running' && (
                    <div className="space-y-4">
                        {/* 1. Job Running Progress */}
                        {isJobRunning && (
                            <div className={`p-5 rounded-2xl border space-y-4 ${cardBg}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <RefreshCw size={20} className="animate-spin text-neutral-400" />
                                        <div>
                                            <p className={`text-sm font-bold ${textColor}`}>{jobMessage}</p>
                                            <p className={`text-xs ${subTextColor}`}>{jobDetail}</p>
                                        </div>
                                    </div>
                                    <span className="font-mono text-xs tabular-nums font-bold">
                                        {jobProgress}% ({elapsedSeconds}s)
                                    </span>
                                </div>

                                {/* Progress Bar */}
                                <div className="h-2 w-full rounded-full bg-black/20 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{ width: `${jobProgress}%`, backgroundColor: accentBg }}
                                    />
                                </div>

                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 text-[11px] opacity-75">
                                        {devicePreference === 'gpu' ? (
                                            <>
                                                <Zap size={13} className="text-amber-400" />
                                                <span>Tăng tốc GPU: WebGPU Shaders / C++ MNN AVX2</span>
                                            </>

                                        ) : (
                                            <>
                                                <Cpu size={13} className="text-blue-400" />
                                                <span>Tiết kiệm CPU: 4 luồng an toàn (Êm ái)</span>
                                            </>
                                        )}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
                                            title="Thu nhỏ và tiếp tục chạy nền"
                                        >
                                            <Minimize2 size={13} />
                                            <span>Thu nhỏ</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void cancelCurrentKaraokeJob()}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
                                        >
                                            Hủy tiến trình
                                        </button>
                                    </div>
                                </div>

                                <div className="p-2.5 rounded-xl bg-black/10 border border-white/5 text-[11px] text-neutral-400 leading-relaxed">
                                    💡 <b>Mẹo:</b> Bạn có thể bấm <b>"Thu nhỏ"</b> để nghe nhạc hoặc làm việc khác. Tiến trình sẽ tiếp tục chạy ngầm trong nền cho đến khi hoàn tất.
                                </div>
                            </div>
                        )}

                        {/* 2. Job Result Card (When job finished or result exists) */}
                        {!isJobRunning && lastResult && (
                            <div className={`p-4 rounded-2xl border space-y-3.5 ${isDaylight ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'}`}>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 font-bold text-sm">
                                        <Check size={18} className="text-emerald-500" />
                                        <span>Bản tách Beat & Giọng hát đã sẵn sàng!</span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* 1. Phát Beat */}
                                        {Boolean(lastResult.instrumentalPath) && (() => {
                                            const isBeatActive = currentSong?.id === `karaoke-${lastResult.songId}-beat`;
                                            const isBeatPlaying = isBeatActive && playerState === PlayerState.PLAYING;
                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => void playOutputStem(lastResult, 'beat')}
                                                    title={isBeatPlaying ? 'Tạm dừng Beat Karaoke' : 'Phát bản Beat Karaoke'}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                                        isBeatPlaying
                                                            ? 'bg-emerald-600 ring-2 ring-emerald-400 text-white animate-pulse'
                                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                    }`}
                                                >
                                                    {isBeatPlaying ? <Pause size={14} /> : <Mic size={14} />}
                                                    <span>{isBeatPlaying ? 'Đang phát Beat' : 'Phát Beat'}</span>
                                                </button>
                                            );
                                        })()}

                                        {/* 2. Phát giọng hát */}
                                        {Boolean(lastResult.vocalsPath) && (() => {
                                            const isVocalActive = currentSong?.id === `karaoke-${lastResult.songId}-vocal`;
                                            const isVocalPlaying = isVocalActive && playerState === PlayerState.PLAYING;
                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => void playOutputStem(lastResult, 'vocal')}
                                                    title={isVocalPlaying ? 'Tạm dừng giọng hát' : 'Nghe riêng giọng hát ca sĩ'}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                                        isVocalPlaying
                                                            ? 'bg-blue-600 ring-2 ring-blue-400 text-white animate-pulse'
                                                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                                                    }`}
                                                >
                                                    {isVocalPlaying ? <Pause size={14} /> : <Volume2 size={14} />}
                                                    <span>{isVocalPlaying ? 'Đang phát Giọng hát' : 'Phát giọng hát'}</span>
                                                </button>
                                            );
                                        })()}

                                        {/* 3. Mở thư mục */}
                                        <button
                                            type="button"
                                            onClick={() => void openAiKaraokeOutputDirectory(String(lastResult.songId || activeSong?.id))}
                                            title="Mở thư mục chứa file Beat và Giọng hát trên máy tính"
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-current/20 hover:bg-black/5 transition-colors"
                                        >
                                            <FolderOpen size={14} />
                                            <span>Mở thư mục</span>
                                        </button>

                                        {/* 4. Tách lại */}
                                        <button
                                            type="button"
                                            onClick={() => { setResult(null); setActiveTab('process'); }}
                                            title="Tách lại bài này hoặc chọn model khác"
                                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium opacity-70 hover:opacity-100 hover:bg-black/5 transition-colors"
                                        >
                                            Tách lại
                                        </button>
                                    </div>
                                </div>

                                {/* Clean stem file pills */}
                                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
                                    {lastResult.instrumentalPath && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 border border-white/5">
                                            <span className="text-emerald-400 font-semibold">🎵 Beat:</span>
                                            <span className="truncate max-w-[200px]" title={lastResult.instrumentalPath}>instrumental.wav</span>
                                        </div>
                                    )}
                                    {lastResult.vocalsPath && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 border border-white/5">
                                            <span className="text-blue-400 font-semibold">🎤 Vocal:</span>
                                            <span className="truncate max-w-[200px]" title={lastResult.vocalsPath}>vocals.wav</span>
                                        </div>
                                    )}
                                    {lastResult.instrumentsPath && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 border border-white/5">
                                            <span className="text-amber-400 font-semibold">🎸 Đạo cụ:</span>
                                            <span className="truncate max-w-[200px]" title={lastResult.instrumentsPath}>instruments.wav</span>
                                            <button
                                                type="button"
                                                onClick={() => void playOutputStem(lastResult, 'instruments')}
                                                className="underline hover:opacity-100 text-amber-400 font-sans ml-1"
                                            >
                                                Phát
                                            </button>
                                        </div>
                                    )}
                                    {lastResult.drumsPath && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 border border-white/5">
                                            <span className="text-orange-400 font-semibold">🥁 Trống:</span>
                                            <span className="truncate max-w-[200px]" title={lastResult.drumsPath}>drums.wav</span>
                                            <button
                                                type="button"
                                                onClick={() => void playOutputStem(lastResult, 'drums')}
                                                className="underline hover:opacity-100 text-orange-400 font-sans ml-1"
                                            >
                                                Phát
                                            </button>
                                        </div>
                                    )}
                                    {lastResult.bassPath && (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 border border-white/5">
                                            <span className="text-purple-400 font-semibold">🔊 Bass:</span>
                                            <span className="truncate max-w-[200px]" title={lastResult.bassPath}>bass.wav</span>
                                            <button
                                                type="button"
                                                onClick={() => void playOutputStem(lastResult, 'bass')}
                                                className="underline hover:opacity-100 text-purple-400 font-sans ml-1"
                                            >
                                                Phát
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 3. Job Error Display */}
                        {jobStage === 'error' && (
                            <div className={`p-4 rounded-2xl border space-y-3 ${isDaylight ? 'bg-red-50 border-red-200 text-red-950' : 'bg-red-950/30 border-red-500/40 text-red-200'}`}>
                                <div className="flex items-start gap-3">
                                    <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <p className="text-sm font-bold">Xảy ra lỗi trong quá trình xử lý</p>
                                        <p className="text-xs opacity-90 leading-relaxed font-mono whitespace-pre-wrap">{jobMessage || jobDetail}</p>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t border-current/10">
                                    <button
                                        type="button"
                                        onClick={() => { resetJob(); setActiveTab('process'); }}
                                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm"
                                    >
                                        Đóng lỗi & Quay lại cấu hình
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 4. Empty Idle State */}
                        {!isJobRunning && !lastResult && jobStage !== 'error' && (
                            <div className={`p-8 rounded-2xl border text-center space-y-4 ${cardBg}`}>
                                <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-black/5 dark:bg-white/5 text-neutral-400">
                                    <Activity size={24} />
                                </div>
                                <div className="space-y-1">
                                    <p className={`text-sm font-bold ${textColor}`}>Chưa có tiến trình tách nào đang chạy</p>
                                    <p className={`text-xs ${subTextColor}`}>Chọn bài hát và cấu hình ở tab "Tách lời & nhạc" để bắt đầu tiến trình mới.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('process')}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
                                    style={{ backgroundColor: accentBg }}
                                >
                                    <Sparkles size={14} />
                                    <span>Đi đến Tách lời & nhạc</span>
                                </button>
                            </div>
                        )}

                        {/* 5. Recent Processing History ("Lịch sử xử lý ở dưới") */}
                        <div className={`p-4 rounded-2xl border space-y-3 ${cardBg}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-neutral-400">
                                    <Clock size={14} style={{ color: accentBg }} />
                                    <span>{t('karaoke.recentHistory')}</span>
                                    {outputs.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/10 dark:bg-white/10 text-neutral-300">
                                            {outputs.length}
                                        </span>
                                    )}
                                </div>
                                {outputs.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('library')}
                                        className="flex items-center gap-1 text-xs font-medium text-pink-400 hover:underline"
                                    >
                                        <span>{t('karaoke.tabLibrary')}</span>
                                        <ArrowRight size={13} />
                                    </button>
                                )}
                            </div>

                            {outputs.length === 0 ? (
                                <p className={`text-xs text-center py-2 ${subTextColor}`}>
                                    {t('karaoke.noRecentHistory')}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {outputs.slice(0, 4).map((item) => {
                                        const isBeatActive = currentSong?.id === `karaoke-${item.songId}-beat`;
                                        const isBeatPlaying = isBeatActive && playerState === PlayerState.PLAYING;
                                        const isVocalActive = currentSong?.id === `karaoke-${item.songId}-vocal`;
                                        const isVocalPlaying = isVocalActive && playerState === PlayerState.PLAYING;

                                        return (
                                            <div
                                                key={item.songId}
                                                className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-colors ${
                                                    isDaylight ? 'bg-white/70 border-neutral-200' : 'bg-black/20 border-white/5'
                                                }`}
                                            >
                                                <div className="min-w-0 flex-1 space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <p className={`text-xs font-semibold truncate ${textColor}`}>{item.songTitle}</p>
                                                        {item.mssModelUsed && (
                                                            <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded bg-neutral-500/10 text-neutral-400 font-mono">
                                                                {item.mssModelUsed}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className={`text-[11px] truncate ${subTextColor}`}>{item.artist || 'Nghệ sĩ chưa rõ'}</p>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {item.hasInstrumental && (
                                                        <button
                                                            type="button"
                                                            onClick={() => void playOutputStem(item, 'beat')}
                                                            title={isBeatPlaying ? 'Tạm dừng Beat' : 'Phát Beat'}
                                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                                                                isBeatActive
                                                                    ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                                                                    : 'bg-emerald-600/80 hover:bg-emerald-600 text-white'
                                                            }`}
                                                        >
                                                            {isBeatPlaying ? <Pause size={12} /> : <Mic size={12} />}
                                                            <span>Beat</span>
                                                        </button>
                                                    )}
                                                    {item.hasVocals && (
                                                        <button
                                                            type="button"
                                                            onClick={() => void playOutputStem(item, 'vocal')}
                                                            title={isVocalPlaying ? 'Tạm dừng Vocal' : 'Phát Vocal'}
                                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                                                                isVocalActive
                                                                    ? 'bg-blue-600 border-blue-400 text-white ring-2 ring-blue-400/50'
                                                                    : 'border-neutral-300 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                                                            }`}
                                                        >
                                                            {isVocalPlaying ? <Pause size={12} /> : <Volume2 size={12} />}
                                                            <span>Vocal</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => void openAiKaraokeOutputDirectory(item.songId)}
                                                        title="Mở thư mục"
                                                        className="p-1 rounded-lg border border-neutral-300 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                                    >
                                                        <FolderOpen size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'process' && (
                    <div className="space-y-6">
                        {/* Notice if job is already running in background */}
                        {isJobRunning && (
                            <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${isDaylight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/20 border-amber-500/30 text-amber-200'}`}>
                                <div className="flex items-center gap-2 text-xs font-medium min-w-0">
                                    <RefreshCw size={14} className="animate-spin text-amber-400 shrink-0" />
                                    <span className="truncate">Tiến trình đang xử lý: <b>{jobProgress}%</b> ({jobMessage})</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('running')}
                                    className="shrink-0 px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-sm"
                                >
                                    Xem tiến trình
                                </button>
                            </div>
                        )}

                        {/* Validation Error Message */}
                        {validationError && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                <AlertCircle size={16} />
                                <span>{validationError}</span>
                            </div>
                        )}

                        {/* Section 0: Hardware Acceleration (Turbo vs Balanced) */}
                        <div className="space-y-2.5">
                            <label className={`text-xs font-bold uppercase tracking-wider ${subTextColor} flex items-center gap-1.5`}>
                                <Zap size={14} className="text-amber-400" />
                                <span>Chế độ Tăng tốc Xử lý (AI Acceleration Mode)</span>
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div
                                    onClick={() => setDevicePreference('gpu')}
                                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                                        devicePreference === 'gpu' ? cardSelectedBg : cardBg
                                    }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <Zap size={15} className="text-amber-400" />
                                            <span className={`text-xs font-bold ${textColor}`}>Tăng tốc Card màn hình (WebGPU / Turbo AVX2)</span>
                                        </div>
                                        <div
                                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                                devicePreference === 'gpu' ? 'border-transparent' : 'border-neutral-500'
                                            }`}
                                            style={{ backgroundColor: devicePreference === 'gpu' ? accentBg : 'transparent' }}
                                        >
                                            {devicePreference === 'gpu' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                    </div>
                                    <p className={`text-[11px] ${subTextColor} mt-1.5 leading-relaxed`}>
                                        Xử lý trực tiếp trên GPU (NVIDIA, AMD, Intel) bằng WebGPU Shaders với tốc độ siêu tốc. Tự động dự phòng qua C++ MNN AVX2 đa luồng nếu thiết bị không hỗ trợ WebGPU.
                                    </p>
                                </div>


                                <div
                                    onClick={() => setDevicePreference('cpu')}
                                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                                        devicePreference === 'cpu' ? cardSelectedBg : cardBg
                                    }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <Cpu size={15} className="text-blue-400" />
                                            <span className={`text-xs font-bold ${textColor}`}>Tiết kiệm CPU (Chạy nền Êm ái)</span>
                                        </div>
                                        <div
                                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                                devicePreference === 'cpu' ? 'border-transparent' : 'border-neutral-500'
                                            }`}
                                            style={{ backgroundColor: devicePreference === 'cpu' ? accentBg : 'transparent' }}
                                        >
                                            {devicePreference === 'cpu' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                    </div>
                                    <p className={`text-[11px] ${subTextColor} mt-1.5 leading-relaxed`}>
                                        Tự động giới hạn luồng xử lý CPU (tối đa 4 luồng an toàn), giữ CPU máy tính ở mức vừa phải (~30-40%) để không gây giật lag khi chơi game.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Section 1: MSS Models */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className={`text-xs font-bold uppercase tracking-wider ${subTextColor} flex items-center gap-1.5`}>
                                    <Layers size={14} />
                                    <span>1. Mô hình Tách Lời & Nhạc (MSS)</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => void openAiKaraokeModelsDirectory()}
                                    className={`flex items-center gap-1 text-xs ${subTextColor} hover:opacity-100 transition-opacity`}
                                    title="Mở thư mục lưu trữ file weights model trên máy tính"
                                >
                                    <FolderOpen size={13} />
                                    <span>Thư mục Model...</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {models
                                    .filter((m) => m.category === 'mss')
                                    .map((model) => {
                                        const isSelected = selectedMssModel === model.id;
                                        const isDownloading = downloadingModelId === model.id;
                                        const details = model.downloadDetails;

                                        return (
                                            <div
                                                key={model.id}
                                                onClick={() => setMssModel(model.id as MssModelId)}
                                                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                                                    isSelected ? cardSelectedBg : cardBg
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs font-bold ${textColor}`}>
                                                                {model.name}
                                                            </span>
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/10 text-neutral-400 font-mono">
                                                                {model.fileSizeMb} MB
                                                            </span>
                                                        </div>
                                                        <p className={`text-[11px] ${subTextColor} mt-1 leading-snug line-clamp-2`}>
                                                            {model.descriptionVi}
                                                        </p>
                                                    </div>

                                                    {/* Radio indicator */}
                                                    <div
                                                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                                            isSelected ? 'border-transparent' : 'border-neutral-500'
                                                        }`}
                                                        style={{ backgroundColor: isSelected ? accentBg : 'transparent' }}
                                                    >
                                                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                    </div>
                                                </div>

                                                {/* Download Status & Progress */}
                                                <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between text-xs">
                                                    {model.id === 'htdemucs_mnn' ? (
                                                        <span className="text-[11px] text-emerald-500 font-medium">✓ {t('karaoke.builtIn')}</span>
                                                    ) : model.isDownloaded ? (
                                                        <div className="flex items-center justify-between w-full">
                                                            <span className="text-[11px] text-emerald-500 font-medium">
                                                                ✓ {t('karaoke.readyOnDevice')}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleDeleteModel(model.id);
                                                                }}
                                                                title={t('karaoke.deleteModelTip')}
                                                                className="text-neutral-400 hover:text-red-400 p-1 rounded"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    ) : isDownloading ? (
                                                        <div className="w-full space-y-1.5">
                                                            <div className="flex items-center justify-between text-[11px]">
                                                                <span className="text-amber-500 font-medium animate-pulse">{t('karaoke.downloading')}: {model.downloadProgress || 0}%</span>
                                                                {details && details.totalBytes > 0 && (
                                                                    <span className="font-mono text-[10px] text-neutral-400">
                                                                        {(details.receivedBytes / 1048576).toFixed(1)} / {(details.totalBytes / 1048576).toFixed(1)} MB
                                                                        {details.speedBytesPerSec ? ` (${(details.speedBytesPerSec / 1048576).toFixed(1)} MB/s)` : ''}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="h-1.5 w-full bg-black/10 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-amber-500 rounded-full transition-all"
                                                                    style={{ width: `${model.downloadProgress || 0}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void handleDownloadModel(model.id);
                                                            }}
                                                            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-black/10 hover:bg-black/20 font-medium transition-colors"
                                                        >
                                                            <Download size={12} />
                                                            <span>{t('karaoke.downloadModel')} ({model.fileSizeMb} MB)</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Section 2: Lyrics & Alignment Source / LRC Studio */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className={`text-xs font-bold uppercase tracking-wider ${subTextColor} flex items-center gap-1.5`}>
                                    <FileText size={14} />
                                    <span>2. Lời Bài Hát & Trình Sửa Lời (LRC Studio)</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => handleOpenInLrcEditor()}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/20 transition-all shadow-sm"
                                >
                                    <Edit3 size={13} />
                                    <span>Mở LRC Studio (Soạn / Sửa Lời)</span>
                                </button>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className={`font-medium ${textColor}`}>Lời bài hát (Plain Text hoặc LRC):</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const currentLyrics = usePlaybackStore.getState().lyrics;
                                                if (currentLyrics?.lines?.length) {
                                                    const text = currentLyrics.lines
                                                        .map((l) => (l.fullText || (l.words || []).map((w) => w.text).join('') || '').trim())
                                                        .filter(Boolean)
                                                        .join('\n');
                                                    setRawLyricsText(text);
                                                }
                                            }}
                                            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-black/10 hover:bg-black/20 text-neutral-300 transition-colors"
                                        >
                                            <Sparkles size={12} />
                                            <span>Lấy lời từ trình phát</span>
                                        </button>
                                        <span className={subTextColor}>Tự động căn mốc từ theo âm giọng ca sĩ</span>
                                    </div>
                                </div>
                                <textarea
                                    value={rawLyricsText}
                                    onChange={(e) => setRawLyricsText(e.target.value)}
                                    rows={5}
                                    placeholder="Dán lời bài hát thô hoặc tệp .lrc vào đây (hoặc để trống nếu bạn chỉ muốn tách Beat Karaoke)..."
                                    className={`w-full p-3 rounded-xl text-xs leading-relaxed resize-none border ${cardBg} ${textColor} focus:outline-none focus:ring-1 focus:ring-current font-sans`}
                                />
                                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300">
                                    <Info size={15} className="mt-0.5 shrink-0 text-blue-400" />
                                    <div className="text-[11px] leading-relaxed space-y-1">
                                        <p className="font-bold text-blue-300">
                                            Linh hoạt quản lý lời bài hát & Tạo bản Beat Karaoke chuẩn
                                        </p>
                                        <p className="text-blue-200/90">
                                            • <b>Có sẵn lời:</b> Dán lời vào ô trên, hệ thống sẽ tự động căn chỉnh mốc thời gian từng từ theo sóng âm giọng hát ca sĩ.
                                        </p>
                                        <p className="text-blue-200/90">
                                            • <b>Chưa có lời hoặc muốn sửa:</b> Bấm <b>"Mở LRC Studio"</b> ở góc phải để nhập lời thủ công, đồng bộ nhịp gõ (Tap to sync), hoặc lấy lời trực tuyến rồi lưu lại riêng.
                                        </p>
                                        <p className="text-blue-200/90">
                                            • <b>Không cần lời:</b> Để trống ô trên, hệ thống sẽ tách bản <b>Beat Karaoke & Giọng hát</b> sạch (.wav) để bạn nghe beat hoặc tự hát.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Sheet>
    );
};

export default AiKaraokeModal;
