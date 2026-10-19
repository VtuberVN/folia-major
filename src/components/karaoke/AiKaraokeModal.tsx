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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Sheet from '../shared/Sheet';
import { useAiKaraokeStore } from '../../stores/useAiKaraokeStore';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { openVisualLrcEditor } from '../../stores/useLrcEditorStore';
import {
    fetchAiModels,
    downloadAiModel,
    deleteAiModel,
    startKaraokeJob,
    cancelCurrentKaraokeJob,
    exportKaraokeLrcFile,
    openAiKaraokeModelsDirectory,
    openAiKaraokeOutputDirectory,
} from '../../services/aiKaraokeService';
import type { MssModelId, AsrModelId, KaraokeAlignmentMode, KaraokeDevicePreference } from '../../types/aiKaraoke';
import type { Theme, SongResult } from '../../types';

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
        activeSong,
        models,
        selectedMssModel,
        selectedAsrModel,
        alignmentMode,
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
        setMssModel,
        setAsrModel,
        setAlignmentMode,
        setRawLyricsText,
        setDevicePreference,
        setResult,
        resetJob,
        toggleKaraokeBeatMode,
    } = useAiKaraokeStore();

    const [previewTab, setPreviewTab] = useState<'enhanced' | 'standard'>('enhanced');
    const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            void fetchAiModels();
            setValidationError(null);
        }
    }, [isOpen]);

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
        if (!activeSong) return;
        setValidationError(null);

        // Model validation
        if (selectedMssModel !== 'htdemucs_mnn' && !selectedMssModelInfo?.isDownloaded) {
            setValidationError(`Vui lòng tải model "${selectedMssModelInfo?.name || selectedMssModel}" về máy trước khi bắt đầu.`);
            return;
        }

        try {
            await startKaraokeJob({
                song: activeSong,
                rawLyrics: rawLyricsText,
                mssModel: selectedMssModel,
                asrModel: selectedAsrModel,
                alignmentMode,
                devicePreference,
            });
        } catch {
            // Handled in store
        }
    };

    const handleApply = () => {
        if (!lastResult) return;
        const textToApply = lastResult.enhancedLrcText || lastResult.lrcText;
        onApplyLyrics?.(textToApply);
        closeModal();
    };

    const handleExportLrc = async () => {
        if (!lastResult) return;
        const defaultName = `${activeSong?.name || 'karaoke'}.lrc`;
        const content = previewTab === 'enhanced' ? lastResult.enhancedLrcText : lastResult.lrcText;
        await exportKaraokeLrcFile(content, defaultName);
    };

    const handleOpenInLrcEditor = () => {
        if (!lastResult) return;
        openVisualLrcEditor(activeSong, lastResult.enhancedLrcText || lastResult.lrcText);
    };

    const accentBg = theme?.accentColor || theme?.primaryColor || '#ec4899';
    const cardBg = isDaylight ? 'bg-neutral-100/80 border-neutral-200' : 'bg-neutral-800/40 border-white/5';
    const cardSelectedBg = isDaylight ? 'bg-neutral-200/90 border-neutral-400' : 'bg-neutral-700/60 border-white/20';
    const textColor = isDaylight ? 'text-neutral-900' : 'text-neutral-100';
    const subTextColor = isDaylight ? 'text-neutral-500' : 'text-neutral-400';

    const footerButtons = (
        <div className="flex items-center gap-2">
            {isJobRunning ? (
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

            {!isJobRunning && !lastResult && (
                <button
                    type="button"
                    onClick={jobStage === 'error' ? resetJob : handleStartJob}
                    disabled={Boolean(downloadingModelId)}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: accentBg }}
                >
                    <Sparkles size={15} />
                    <span>{jobStage === 'error' ? 'Thử lại' : 'Bắt đầu Tách nhạc & Tạo Karaoke'}</span>
                </button>
            )}
        </div>
    );

    const footerNote = (
        <span className={`text-xs ${subTextColor}`}>
            {activeSong ? `${activeSong.name}` : ''} · Xử lý bảo mật trên máy tính
        </span>
    );

    return (
        <Sheet
            isOpen={isOpen}
            onClose={closeModal}
            size="l"
            title={t('karaoke.modalTitle', 'Tách Beat & Tạo Karaoke AI')}
            subtitle={activeSong ? `${activeSong.name} — ${activeSong.artists?.map(a => a.name).join(', ') || (activeSong as any).artist || ''}` : undefined}
            isDaylight={isDaylight}
            footer={footerButtons}
            footerNote={footerNote}
        >
            <div className="space-y-6 pb-4">
                {/* 1. Cached Result Banner (If already separated) */}
                {lastResult && (
                    <div className={`p-4 rounded-2xl border space-y-3 ${isDaylight ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold text-sm">
                                <Check size={18} className="text-emerald-500" />
                                <span>Bản Karaoke (Beat & Lời) đã sẵn sàng!</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => void toggleKaraokeBeatMode(activeSong)}
                                    title={isKaraokeBeatMode ? 'Trở lại bài hát gốc có giọng ca sĩ' : 'Chỉ phát Beat karaoke, tắt giọng ca sĩ'}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                                        isKaraokeBeatMode
                                            ? 'bg-amber-500 text-white animate-pulse'
                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    }`}
                                >
                                    <Mic size={14} />
                                    <span>{isKaraokeBeatMode ? 'Đang phát Beat (Tắt)' : 'Phát Beat Karaoke'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleOpenInLrcEditor}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
                                    style={{ backgroundColor: accentBg }}
                                >
                                    <Edit3 size={14} />
                                    <span>Sửa lời trong Visual LRC Studio</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void openAiKaraokeOutputDirectory(String(activeSong?.id))}
                                    title="Mở thư mục chứa file Beat và Lời trên máy"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-current/20 hover:bg-black/5 transition-colors"
                                >
                                    <FolderOpen size={14} />
                                    <span>Mở thư mục file</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportLrc}
                                    title="Xuất file .lrc"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-current/20 hover:bg-black/5 transition-colors"
                                >
                                    <Download size={14} />
                                    <span>Xuất .lrc</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setResult(null)}
                                    title="Tách lại bằng model khác"
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium opacity-70 hover:opacity-100 hover:bg-black/5 transition-colors"
                                >
                                    Tách lại
                                </button>
                            </div>
                        </div>

                        {/* Collapsible preview box */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs opacity-75">
                                <span>Xem trước lời Karaoke:</span>
                                <button
                                    type="button"
                                    onClick={() => setPreviewTab(previewTab === 'enhanced' ? 'standard' : 'enhanced')}
                                    className="underline hover:opacity-100"
                                >
                                    {previewTab === 'enhanced' ? 'Chuyển sang Standard LRC' : 'Chuyển sang Enhanced LRC (Nhảy từng từ)'}
                                </button>
                            </div>
                            <div className="max-h-36 overflow-y-auto font-mono text-xs p-3 rounded-xl bg-black/40 text-neutral-200 border border-white/5 whitespace-pre st-scroll">
                                {previewTab === 'enhanced' ? lastResult.enhancedLrcText : lastResult.lrcText}
                            </div>
                        </div>

                        {/* File Output Paths */}
                        {lastResult.instrumentalPath && (
                            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/20 border border-white/5 text-[11px] font-mono">
                                <span className="truncate opacity-80" title={lastResult.instrumentalPath}>
                                    🎵 File Beat: <span className="text-emerald-400 font-semibold">{lastResult.instrumentalPath}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void openAiKaraokeOutputDirectory(String(activeSong?.id))}
                                    className="shrink-0 flex items-center gap-1 font-sans text-xs underline font-medium hover:opacity-100 text-emerald-400"
                                >
                                    <FolderOpen size={12} />
                                    <span>Mở thư mục</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* 2. Job Running Progress */}
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
                                        <span>Tốc độ Tối đa: C++ MNN AVX2 Turbo (P-Cores)</span>
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
                            💡 <b>Mẹo:</b> Bạn có thể bấm <b>"Thu nhỏ"</b> để nghe nhạc hoặc làm việc khác. Thanh hiển thị tiến trình ở góc màn hình sẽ thông báo và cho phép mở lại bất cứ lúc nào.
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
                                onClick={resetJob}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm"
                            >
                                Đóng lỗi & Thử lại
                            </button>
                        </div>
                    </div>
                )}

                {/* Validation Error Message */}
                {validationError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                        <AlertCircle size={16} />
                        <span>{validationError}</span>
                    </div>
                )}

                {/* Configuration Options (When not running and no active result) */}
                {!isJobRunning && !lastResult && (
                    <div className="space-y-6">
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
                                            <span className={`text-xs font-bold ${textColor}`}>Tốc độ Tối đa (Turbo Đa luồng C++ AVX2)</span>
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
                                        Tận dụng tối đa các nhân Performance (P-Cores) với C++ Native MNN AVX2/AVX-512. Tốc độ tách cực nhanh, chỉ mất khoảng 40–60 giây cho cả bài hát.
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
                                                        <span className="text-[11px] text-emerald-500 font-medium">✓ Có sẵn trong Folia</span>
                                                    ) : model.isDownloaded ? (
                                                        <div className="flex items-center justify-between w-full">
                                                            <span className="text-[11px] text-emerald-500 font-medium">✓ Đã sẵn sàng trên máy</span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleDeleteModel(model.id);
                                                                }}
                                                                title="Xóa model để giải phóng dung lượng ổ cứng"
                                                                className="text-neutral-400 hover:text-red-400 p-1 rounded"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    ) : isDownloading ? (
                                                        <div className="w-full space-y-1.5">
                                                            <div className="flex items-center justify-between text-[11px]">
                                                                <span className="text-amber-500 font-medium animate-pulse">Đang tải: {model.downloadProgress || 0}%</span>
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
                                                            <span>Tải về ({model.fileSizeMb} MB)</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Section 2: Lyrics & Alignment Source */}
                        <div className="space-y-3">
                            <label className={`text-xs font-bold uppercase tracking-wider ${subTextColor} flex items-center gap-1.5`}>
                                <FileText size={14} />
                                <span>2. Nguồn Lời Bài Hát & Căn Chỉnh Mốc (Karaoke Alignment)</span>
                            </label>

                            {/* Mode choice */}
                            <div className="grid grid-cols-2 gap-3">
                                <div
                                    onClick={() => setAlignmentMode('align_existing')}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                        alignmentMode === 'align_existing' ? cardSelectedBg : cardBg
                                    }`}
                                >
                                    <span className="text-xs font-bold block">Căn mốc từ lời có sẵn (Khuyên dùng)</span>
                                    <p className={`text-[11px] ${subTextColor} mt-1 leading-relaxed`}>
                                        Dán lời chữ chuẩn, AI sẽ dùng thuật toán Forced Alignment căn mốc thời gian chuẩn 100% vào giọng hát.
                                    </p>
                                </div>

                                <div
                                    onClick={() => setAlignmentMode('auto_transcribe')}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                        alignmentMode === 'auto_transcribe' ? cardSelectedBg : cardBg
                                    }`}
                                >
                                    <span className="text-xs font-bold block">Tự nghe toàn bài (Whisper ASR)</span>
                                    <p className={`text-[11px] ${subTextColor} mt-1 leading-relaxed`}>
                                        Dùng khi bài hát không thể tìm thấy lời ở bất kỳ đâu trên mạng.
                                    </p>
                                </div>
                            </div>

                            {/* Textarea for raw lyrics */}
                            {alignmentMode === 'align_existing' && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className={`font-medium ${textColor}`}>Lời bài hát thô (Plain Text):</span>
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
                                            <span className={subTextColor}>Không cần có [00:00.00]</span>
                                        </div>
                                    </div>
                                    <textarea
                                        value={rawLyricsText}
                                        onChange={(e) => setRawLyricsText(e.target.value)}
                                        rows={5}
                                        placeholder="Dán lời bài hát thô vào đây (hoặc để trống nếu bạn chỉ muốn tách Beat Karaoke)..."
                                        className={`w-full p-3 rounded-xl text-xs leading-relaxed resize-none border ${cardBg} ${textColor} focus:outline-none focus:ring-1 focus:ring-current font-sans`}
                                    />
                                    {!rawLyricsText.trim() && (
                                        <p className="text-[11px] text-amber-500/90 leading-normal">
                                            * Lưu ý: Nếu để trống lời bài hát, AI vẫn tách và lưu Beat Karaoke (.wav) bình thường để bạn hát, và sẽ bỏ qua bước tạo file lời Karaoke .lrc.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* ASR / STT Model Selection when auto_transcribe is active */}
                            {alignmentMode === 'auto_transcribe' && (
                                <div className="space-y-3 pt-1">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-xs font-bold ${textColor} flex items-center gap-1.5`}>
                                            <Sparkles size={13} className="text-amber-400" />
                                            <span>Mô hình Nhận diện Giọng nói (ASR / STT)</span>
                                        </span>
                                        <span className={`text-[11px] ${subTextColor}`}>
                                            Tự động bóc tách từ giọng hát vocal
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {models
                                            .filter((m) => m.category === 'asr')
                                            .map((model) => {
                                                const isSelected = selectedAsrModel === model.id;
                                                const isDownloading = downloadingModelId === model.id;
                                                const details = model.downloadDetails;

                                                return (
                                                    <div
                                                        key={model.id}
                                                        onClick={() => setAsrModel(model.id as AsrModelId)}
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
                                                            {model.isDownloaded ? (
                                                                <div className="flex items-center justify-between w-full">
                                                                    <span className="text-[11px] text-emerald-500 font-medium">✓ Đã sẵn sàng trên máy</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            void handleDeleteModel(model.id);
                                                                        }}
                                                                        title="Xóa model để giải phóng dung lượng ổ cứng"
                                                                        className="text-neutral-400 hover:text-red-400 p-1 rounded"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </div>
                                                            ) : isDownloading ? (
                                                                <div className="w-full space-y-1.5">
                                                                    <div className="flex items-center justify-between text-[11px]">
                                                                        <span className="text-amber-500 font-medium animate-pulse">Đang tải: {model.downloadProgress || 0}%</span>
                                                                        {details && details.totalBytes > 0 && (
                                                                            <span className="font-mono text-[10px] text-neutral-400">
                                                                                {(details.receivedBytes / 1048576).toFixed(1)} / {(details.totalBytes / 1048576).toFixed(1)} MB
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
                                                                    <span>Tải về ({model.fileSizeMb} MB)</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                    <p className={`text-[11px] ${subTextColor} leading-relaxed`}>
                                        * Lưu ý: AI Whisper sẽ nghe giọng hát ca sĩ bóc tách từ âm thanh để nhận diện. Với các ca khúc tiếng Việt remix/sped up, phương thức <b>Căn mốc từ lời có sẵn</b> sẽ đảm bảo từ ngữ chuẩn xác nhất.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Sheet>
    );
};

export default AiKaraokeModal;
