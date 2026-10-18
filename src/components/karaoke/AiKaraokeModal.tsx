// src/components/karaoke/AiKaraokeModal.tsx
// Comprehensive AI Karaoke Modal for Folia-major.
// Handles Music Source Separation (MSS) + ASR / Word-Level Forced Alignment.

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mic,
    Sparkles,
    X,
    Music2,
    Sliders,
    Play,
    Check,
    AlertCircle,
    Download,
    FileText,
    Share2,
    RefreshCw,
    Layers,
    Cpu,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAiKaraokeStore } from '../../stores/useAiKaraokeStore';
import {
    fetchAiModels,
    downloadAiModel,
    startKaraokeJob,
    cancelCurrentKaraokeJob,
    exportKaraokeLrcFile,
} from '../../services/aiKaraokeService';
import type { MssModelId, AsrModelId, KaraokeAlignmentMode } from '../../types/aiKaraoke';
import type { Theme } from '../../types';

interface AiKaraokeModalProps {
    theme?: Theme;
    onApplyLyrics?: (lrcContent: string) => void;
}

export const AiKaraokeModal: React.FC<AiKaraokeModalProps> = ({ theme, onApplyLyrics }) => {
    const { t } = useTranslation();
    const {
        isOpen,
        activeSong,
        models,
        selectedMssModel,
        selectedAsrModel,
        alignmentMode,
        rawLyricsText,
        jobStage,
        jobProgress,
        jobMessage,
        jobDetail,
        elapsedSeconds,
        lastResult,
        closeModal,
        setMssModel,
        setAsrModel,
        setAlignmentMode,
        setRawLyricsText,
        resetJob,
    } = useAiKaraokeStore();

    const [previewTab, setPreviewTab] = useState<'enhanced' | 'standard'>('enhanced');
    const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            void fetchAiModels();
        }
    }, [isOpen]);

    const isJobRunning = jobStage !== 'idle' && jobStage !== 'completed' && jobStage !== 'error';

    const selectedMssModelInfo = useMemo(
        () => models.find((m) => m.id === selectedMssModel),
        [models, selectedMssModel],
    );

    const handleDownloadSelectedModel = async (modelId: string) => {
        try {
            setDownloadingModelId(modelId);
            await downloadAiModel(modelId);
        } finally {
            setDownloadingModelId(null);
        }
    };

    const handleStartJob = async () => {
        if (!activeSong) return;
        try {
            await startKaraokeJob({
                song: activeSong,
                rawLyrics: rawLyricsText,
                mssModel: selectedMssModel,
                asrModel: selectedAsrModel,
                alignmentMode,
            });
        } catch {
            // Handled in store
        }
    };

    const handleApplyToPlayer = () => {
        if (!lastResult) return;
        const textToApply = lastResult.enhancedLrcText || lastResult.lrcText;
        if (onApplyLyrics) {
            onApplyLyrics(textToApply);
        }
        closeModal();
    };

    const handleExportLrc = async () => {
        if (!lastResult || !activeSong) return;
        const content = previewTab === 'enhanced' ? lastResult.enhancedLrcText : lastResult.lrcText;
        const artistName = activeSong.artists?.map(a => a.name).join(', ') || (activeSong as any).artist || 'Unknown';
        const defaultName = `${artistName} - ${activeSong.name}${previewTab === 'enhanced' ? '.karaoke' : ''}.lrc`;
        await exportKaraokeLrcFile(content, defaultName);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 select-none">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={isJobRunning ? undefined : closeModal}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                />

                {/* Dialog Content */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-white/10 bg-[var(--bg-color,#1e1e24)] text-[var(--text-primary,#fff)] shadow-2xl overflow-hidden"
                    style={{
                        backdropFilter: 'blur(20px)',
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-purple-500/20 text-pink-400 border border-pink-500/30">
                                <Mic size={22} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold flex items-center gap-2">
                                    {t('karaoke.modalTitle', 'Tách nhạc & Tạo Karaoke AI')}
                                    <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                                        MSS + ASR
                                    </span>
                                </h3>
                                <p className="text-xs text-neutral-400 truncate max-w-md">
                                    {activeSong ? `${activeSong.name} — ${activeSong.artists?.map(a => a.name).join(', ') || (activeSong as any).artist || ''}` : 'Folia AI Karaoke Engine'}
                                </p>
                            </div>
                        </div>
                        {!isJobRunning && (
                            <button
                                type="button"
                                onClick={closeModal}
                                className="p-2 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                        {/* Status / Result Banner */}
                        {lastResult ? (
                            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                                        <Check size={18} />
                                        <span>{t('karaoke.successBanner', 'Đã tách beat và tạo file Karaoke thành công!')}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPreviewTab(previewTab === 'enhanced' ? 'standard' : 'enhanced')}
                                            className="px-3 py-1 rounded-lg text-xs bg-white/10 hover:bg-white/15 transition-colors"
                                        >
                                            {previewTab === 'enhanced' ? 'Xem Standard LRC' : 'Xem Enhanced LRC (Nhảy chữ)'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleExportLrc}
                                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-pink-600 hover:bg-pink-500 text-white font-medium transition-colors"
                                        >
                                            <Download size={14} />
                                            <span>Xuất file .lrc</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-40 overflow-y-auto font-mono text-xs p-3 rounded-xl bg-black/40 text-neutral-300 border border-white/5 whitespace-pre">
                                    {previewTab === 'enhanced' ? lastResult.enhancedLrcText : lastResult.lrcText}
                                </div>
                            </div>
                        ) : isJobRunning ? (
                            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <RefreshCw size={18} className="animate-spin text-pink-400" />
                                        <div>
                                            <p className="text-sm font-bold text-white">{jobMessage}</p>
                                            <p className="text-xs text-neutral-400">{jobDetail}</p>
                                        </div>
                                    </div>
                                    <span className="font-mono text-xs tabular-nums text-pink-400 font-bold">
                                        {jobProgress}% ({elapsedSeconds}s)
                                    </span>
                                </div>

                                {/* Progress Bar */}
                                <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full"
                                        animate={{ width: `${jobProgress}%` }}
                                        transition={{ duration: 0.3 }}
                                    />
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => void cancelCurrentKaraokeJob()}
                                        className="px-3 py-1.5 rounded-lg text-xs bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
                                    >
                                        {t('ui.cancel', 'Hủy tiến trình')}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {/* Configuration Sections (visible when not running) */}
                        {!isJobRunning && (
                            <div className="space-y-5">
                                {/* 1. MSS Model Picker */}
                                <div className="space-y-2.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                                        <Layers size={14} />
                                        <span>1. {t('karaoke.selectMssModel', 'Mô hình Tách Lời & Nhạc (MSS)')}</span>
                                    </label>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                        {[
                                            {
                                                id: 'uvr_mdxnet_kara_2' as MssModelId,
                                                title: 'UVR-MDX-Net Karaoke 2',
                                                badge: 'Khuyên dùng cho Karaoke',
                                                size: '66.8 MB (ONNX)',
                                                speed: '~6-10 giây',
                                                desc: 'Tách vocal chính, giữ lại vocal bè (backing) trong beat nhạc nền.',
                                            },
                                            {
                                                id: 'kim_vocal_2' as MssModelId,
                                                title: 'Kim Vocal 2',
                                                badge: 'Sạch dải tần ASR',
                                                size: '66.8 MB (ONNX)',
                                                speed: '~6-10 giây',
                                                desc: 'Tách vocal siêu sạch, tối ưu hóa để đưa vào nhận diện lời Whisper.',
                                            },
                                            {
                                                id: 'htdemucs_mnn' as MssModelId,
                                                title: 'HTDemucs v4 (MNN Native)',
                                                badge: 'Có sẵn trong App',
                                                size: '80 MB (C++ MNN)',
                                                speed: '~8-14 giây',
                                                desc: 'Tách 4 luồng âm: Trống, Bass, Nhạc cụ khác, Giọng hát.',
                                            },
                                            {
                                                id: 'bs_roformer' as MssModelId,
                                                title: 'BS-RoFormer Studio',
                                                badge: 'Chuẩn Studio Đỉnh Cao',
                                                size: '639 MB (SDR 12.97)',
                                                speed: '~18-30 giây',
                                                desc: 'Chất lượng cao nhất hiện nay, sạch tiếng vang, không lẹm nhạc nền.',
                                            },
                                        ].map((card) => {
                                            const isSelected = selectedMssModel === card.id;
                                            const modelMeta = models.find((m) => m.id === card.id);
                                            const isReady = card.id === 'htdemucs_mnn' || modelMeta?.isDownloaded;

                                            return (
                                                <div
                                                    key={card.id}
                                                    onClick={() => setMssModel(card.id)}
                                                    className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${
                                                        isSelected
                                                            ? 'border-pink-500 bg-pink-500/10 shadow-lg shadow-pink-500/10'
                                                            : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="text-sm font-bold text-white">{card.title}</h4>
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-neutral-300 font-mono">
                                                                    {card.badge}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-neutral-400 mt-1">{card.desc}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <span className="text-[11px] font-mono text-neutral-400 block">{card.size}</span>
                                                            <span className="text-[10px] text-neutral-500">{card.speed}</span>
                                                        </div>
                                                    </div>

                                                    <div className="mt-2.5 pt-2.5 border-t border-white/5 flex items-center justify-between text-xs">
                                                        {isReady ? (
                                                            <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                                                                <Check size={13} /> Đã sẵn sàng
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleDownloadSelectedModel(card.id);
                                                                }}
                                                                disabled={downloadingModelId === card.id}
                                                                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-pink-500/20 text-pink-300 hover:bg-pink-500/30 transition-colors"
                                                            >
                                                                <Download size={12} className={downloadingModelId === card.id ? 'animate-spin' : ''} />
                                                                <span>{downloadingModelId === card.id ? 'Đang tải...' : 'Tải model'}</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 2. Alignment & ASR Mode */}
                                <div className="space-y-2.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                                        <Cpu size={14} />
                                        <span>2. {t('karaoke.selectAsrMode', 'Nhận diện Lời & Căn chỉnh Thời gian (Karaoke Sync)')}</span>
                                    </label>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setAlignmentMode('align_existing')}
                                            className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                                                alignmentMode === 'align_existing'
                                                    ? 'border-purple-500 bg-purple-500/10'
                                                    : 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                                            }`}
                                        >
                                            <span className="text-xs font-bold block text-white">Đã có lời bài hát (Khuyên dùng)</span>
                                            <span className="text-[11px] text-neutral-400">
                                                Căn chỉnh từ theo nhịp hát (Forced Alignment), độ khớp dưới 30-50ms.
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setAlignmentMode('auto_transcribe')}
                                            className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                                                alignmentMode === 'auto_transcribe'
                                                    ? 'border-purple-500 bg-purple-500/10'
                                                    : 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                                            }`}
                                        >
                                            <span className="text-xs font-bold block text-white">Chưa có lời (Whisper ASR)</span>
                                            <span className="text-[11px] text-neutral-400">
                                                AI tự nghe giọng hát và chép lại thành chữ kèm mốc thời gian.
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {/* 3. Raw Lyrics Input (if align_existing) */}
                                {alignmentMode === 'align_existing' && (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                                                Lời bài hát thô (Lyrics Text)
                                            </label>
                                            <span className="text-[11px] text-neutral-500">
                                                Dán lời bài hát để AI căn chỉnh nhảy chữ
                                            </span>
                                        </div>
                                        <textarea
                                            value={rawLyricsText}
                                            onChange={(e) => setRawLyricsText(e.target.value)}
                                            placeholder="Dán lời bài hát vào đây (không cần mốc thời gian)..."
                                            rows={4}
                                            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white placeholder-neutral-500 focus:border-pink-500 focus:outline-none"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-black/20">
                        <button
                            type="button"
                            onClick={closeModal}
                            disabled={isJobRunning}
                            className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white transition-colors"
                        >
                            {t('ui.close', 'Đóng')}
                        </button>

                        <div className="flex items-center gap-2">
                            {lastResult && (
                                <button
                                    type="button"
                                    onClick={handleApplyToPlayer}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-white text-black hover:bg-neutral-200 transition-all shadow-lg active:scale-95"
                                >
                                    <Check size={15} />
                                    <span>{t('karaoke.applyToPlayer', 'Áp dụng cho bài hát đang phát')}</span>
                                </button>
                            )}

                            {!lastResult && (
                                <button
                                    type="button"
                                    onClick={() => void handleStartJob()}
                                    disabled={isJobRunning || !activeSong}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white transition-all shadow-lg shadow-pink-500/20 active:scale-95 disabled:opacity-50"
                                >
                                    <Sparkles size={15} />
                                    <span>{t('karaoke.startSeparation', 'Bắt đầu Tách Nhạc & Tạo Karaoke')}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default AiKaraokeModal;
