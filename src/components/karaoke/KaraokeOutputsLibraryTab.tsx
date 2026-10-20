// src/components/karaoke/KaraokeOutputsLibraryTab.tsx
// Dedicated AI Karaoke Stems & Separated Tracks Manager.
// Allows browsing, searching, model-filtering, stem playback (Beat/Vocal),
// lyric editing in Visual LRC Studio, and disk cleanup.

import React, { useState, useMemo } from 'react';
import {
    Mic,
    Volume2,
    FolderOpen,
    Trash2,
    Edit3,
    Download,
    Search,
    RefreshCw,
    Layers,
    Music,
    HardDrive,
    Sparkles,
    Pause,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore, selectDisplayPlayerState } from '../../stores/usePlaybackStore';
import { PlayerState } from '../../types';
import { useAiKaraokeStore } from '../../stores/useAiKaraokeStore';
import { openVisualLrcEditor } from '../../stores/useLrcEditorStore';
import {
    openAiKaraokeOutputDirectory,
    exportKaraokeLrcFile,
    fetchKaraokeOutputs,
} from '../../services/aiKaraokeService';
import { formatByteSize } from '../../utils/formatByteSize';
import { CustomSelect } from '../shared/CustomSelect';
import type { CustomSelectOption } from '../shared/CustomSelectMenu';
import type { KaraokeOutputSummary, MssModelId } from '../../types/aiKaraoke';
import type { Theme } from '../../types';

interface KaraokeOutputsLibraryTabProps {
    theme?: Theme;
    isDaylight?: boolean;
    onSelectSongForReprocess?: (songId: string) => void;
}

const MSS_MODEL_NAMES: Record<string, string> = {
    htdemucs_mnn: 'HTDemucs v4 (MNN)',
    uvr_mdxnet_kara_2: 'UVR-MDX-Net Kara 2',
    kim_vocal_2: 'Kim Vocal 2',
    bs_roformer: 'BS-RoFormer 12.97',
};

const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatDate = (timestamp: number): string => {
    if (!timestamp) return '';
    try {
        const d = new Date(timestamp);
        return d.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
};

export const KaraokeOutputsLibraryTab: React.FC<KaraokeOutputsLibraryTabProps> = ({
    theme,
    isDaylight = false,
    onSelectSongForReprocess,
}) => {
    const { t } = useTranslation();
    const currentSong = usePlaybackStore((state) => state.currentSong);
    const playerState = usePlaybackStore(selectDisplayPlayerState);
    const {
        outputs,
        isLoadingOutputs,
        deleteOutput,
        playOutputStem,
        applyLyricsToCurrentSong,
        setActiveTab,
    } = useAiKaraokeStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedModelFilter, setSelectedModelFilter] = useState<string>('all');
    const [deletingSongId, setDeletingSongId] = useState<string | null>(null);

    const accentBg = theme?.accentColor || theme?.primaryColor || '#ec4899';
    const cardBg = isDaylight ? 'bg-neutral-100/90 border-neutral-200' : 'bg-neutral-800/40 border-white/5';
    const textColor = isDaylight ? 'text-neutral-900' : 'text-neutral-100';
    const subTextColor = isDaylight ? 'text-neutral-500' : 'text-neutral-400';

    const totalBytes = useMemo(() => {
        return outputs.reduce((sum, item) => sum + (item.totalSizeBytes || 0), 0);
    }, [outputs]);

    const filteredOutputs = useMemo(() => {
        return outputs.filter((item) => {
            const matchesSearch =
                !searchQuery.trim() ||
                item.songTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.artist.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesModel =
                selectedModelFilter === 'all' || item.mssModelUsed === selectedModelFilter;

            return matchesSearch && matchesModel;
        });
    }, [outputs, searchQuery, selectedModelFilter]);

    const handleDelete = async (songId: string, title: string) => {
        if (!window.confirm(`Bạn có chắc chắn muốn xóa toàn bộ file Beat, Vocal và Lời của bài hát "${title}"?`)) {
            return;
        }
        setDeletingSongId(songId);
        try {
            await deleteOutput(songId);
        } finally {
            setDeletingSongId(null);
        }
    };

    const handleOpenInEditor = async (item: KaraokeOutputSummary) => {
        let lrcText = '';
        if (window.electron?.aiKaraoke?.getCachedResult) {
            try {
                const cached = await window.electron.aiKaraoke.getCachedResult(item.songId);
                lrcText = cached?.enhancedLrcText || cached?.lrcText || '';
            } catch {}
        }
        openVisualLrcEditor(
            {
                id: item.songId,
                name: item.songTitle,
                artists: item.artist ? [{ id: 0, name: item.artist }] : [],
                album: { id: 0, name: 'AI Karaoke Stems' },
                durationMs: (item.duration || 0) * 1000,
            },
            lrcText,
        );
    };

    const handleExportLrc = async (item: KaraokeOutputSummary) => {
        const defaultName = `${item.songTitle || 'karaoke'}.lrc`;
        let lrcContent = '';
        if (window.electron?.aiKaraoke?.getCachedResult) {
            try {
                const cached = await window.electron.aiKaraoke.getCachedResult(item.songId);
                lrcContent = cached?.enhancedLrcText || cached?.lrcText || '';
            } catch {}
        }
        if (!lrcContent) {
            lrcContent = `[ti:${item.songTitle}]\n[ar:${item.artist}]\n[by:Folia AI Karaoke]`;
        }
        await exportKaraokeLrcFile(lrcContent, defaultName);
    };

    return (
        <div className="space-y-4">
            {/* Header summary & quick actions */}
            <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${cardBg}`}>
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5 font-bold">
                        <Layers size={15} style={{ color: accentBg }} />
                        <span>Tổng số bài đã tách:</span>
                        <span className="px-2 py-0.5 rounded-full font-mono bg-black/10 dark:bg-white/10">
                            {outputs.length}
                        </span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${subTextColor}`}>
                        <HardDrive size={14} />
                        <span>Dung lượng đã dùng:</span>
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                            {formatByteSize(totalBytes)}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void fetchKaraokeOutputs()}
                        disabled={isLoadingOutputs}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                            isDaylight
                                ? 'border-neutral-300 hover:bg-neutral-200 text-neutral-800'
                                : 'border-white/10 hover:bg-white/10 text-neutral-200'
                        }`}
                        title="Tải lại danh sách bài đã tách"
                    >
                        <RefreshCw size={13} className={isLoadingOutputs ? 'animate-spin' : ''} />
                        <span>Làm mới</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => void openAiKaraokeOutputDirectory()}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                            isDaylight
                                ? 'border-neutral-300 hover:bg-neutral-200 text-neutral-800'
                                : 'border-white/10 hover:bg-white/10 text-neutral-200'
                        }`}
                        title="Mở thư mục gốc chứa các file stem đã tách trên máy tính"
                    >
                        <FolderOpen size={13} />
                        <span>Thư mục gốc</span>
                    </button>
                </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                {/* Search input */}
                <div className="relative flex-1">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none"
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm bài hát hoặc nghệ sĩ đã tách..."
                        className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border outline-none transition-colors ${
                            isDaylight
                                ? 'bg-white border-neutral-300 text-neutral-900 focus:border-neutral-500'
                                : 'bg-neutral-900/60 border-white/10 text-neutral-100 focus:border-white/30'
                        }`}
                    />
                </div>

                {/* Model filter dropdown */}
                <div className="w-full sm:w-44 shrink-0">
                    <CustomSelect
                        value={selectedModelFilter}
                        onChange={setSelectedModelFilter}
                        options={[
                            { value: 'all', label: 'Tất cả model' },
                            { value: 'htdemucs_mnn', label: 'HTDemucs v4' },
                            { value: 'uvr_mdxnet_kara_2', label: 'UVR Kara 2' },
                            { value: 'kim_vocal_2', label: 'Kim Vocal 2' },
                            { value: 'bs_roformer', label: 'BS-RoFormer' },
                        ]}
                        isDaylight={isDaylight}
                        theme={theme}
                        size="compact"
                        ariaLabel="Lọc theo model tách"
                    />
                </div>
            </div>

            {/* List of outputs */}
            {filteredOutputs.length === 0 ? (
                <div className={`p-10 rounded-2xl border text-center space-y-3 ${cardBg}`}>
                    <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 opacity-60">
                        <Music size={24} />
                    </div>
                    <div className="space-y-1">
                        <h4 className={`text-sm font-bold ${textColor}`}>
                            {outputs.length === 0
                                ? 'Chưa có bài hát nào được tách lời'
                                : 'Không tìm thấy bài hát phù hợp'}
                        </h4>
                        <p className={`text-xs max-w-md mx-auto ${subTextColor}`}>
                            {outputs.length === 0
                                ? 'Các bài hát sau khi được tách lời qua mô hình AI sẽ được lưu trữ và quản lý độc lập tại đây.'
                                : 'Thử đổi từ khóa tìm kiếm hoặc bỏ chọn bộ lọc model.'}
                        </p>
                    </div>
                    {outputs.length === 0 && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('process')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
                            style={{ backgroundColor: accentBg }}
                        >
                            <Sparkles size={14} />
                            <span>Tách bài hát đang phát</span>
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {filteredOutputs.map((item) => {
                        const mssName = (item.mssModelUsed && item.mssModelUsed !== 'none')
                            ? (MSS_MODEL_NAMES[item.mssModelUsed] || item.mssModelUsed)
                            : 'Trích xuất trực tiếp';
                        const isDeleting = deletingSongId === item.songId;

                        return (
                            <div
                                key={item.songId}
                                className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${cardBg} hover:border-neutral-400 dark:hover:border-white/20`}
                            >
                                {/* Left: Song Title, Artist, Badges */}
                                <div className="space-y-1.5 min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`font-bold text-sm truncate ${textColor}`}>
                                            {item.songTitle}
                                        </span>
                                        {item.artist && (
                                            <span className={`text-xs truncate ${subTextColor}`}>
                                                — {item.artist}
                                            </span>
                                        )}
                                    </div>

                                    {/* Metadata & Model badges */}
                                    <div className="flex items-center gap-2 flex-wrap text-xs">
                                        <span
                                            className="px-2 py-0.5 rounded-md font-semibold text-[10px] tracking-wide text-white uppercase shadow-sm"
                                            style={{ backgroundColor: accentBg }}
                                        >
                                            {mssName}
                                        </span>
                                        {item.asrModelUsed && (
                                            <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                                {item.asrModelUsed}
                                            </span>
                                        )}
                                        {item.duration > 0 && (
                                            <span className={`text-[11px] ${subTextColor}`}>
                                                {formatDuration(item.duration)}
                                            </span>
                                        )}
                                        <span className={`text-[11px] ${subTextColor}`}>·</span>
                                        <span className={`text-[11px] ${subTextColor}`}>
                                            {formatByteSize(item.totalSizeBytes)}
                                        </span>
                                        {item.generatedAt > 0 && (
                                            <>
                                                <span className={`text-[11px] ${subTextColor}`}>·</span>
                                                <span className={`text-[11px] opacity-60 ${subTextColor}`}>
                                                    {formatDate(item.generatedAt)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Action buttons */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {/* Direct Lyrics Mode or No Beat: Quick Apply Lyric */}
                                    {(!item.hasInstrumental && item.hasLrc) && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const cached = await window.electron?.aiKaraoke?.getCachedResult?.(item.songId);
                                                if (cached) {
                                                    let target = currentSong && String(currentSong.id) === String(item.songId) ? currentSong : null;
                                                    if (!target) {
                                                        const { getLocalSong } = await import('../../services/db');
                                                        const local = await getLocalSong(item.songId);
                                                        if (local) {
                                                            target = {
                                                                id: local.id,
                                                                name: local.title,
                                                                isLocal: true,
                                                                localRef: { songId: local.id },
                                                            } as any;
                                                        } else {
                                                            target = currentSong;
                                                        }
                                                    }
                                                    void applyLyricsToCurrentSong(cached, target);
                                                }
                                            }}
                                            title="Áp dụng bản lyric AI Karaoke này cho bài hát"
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-all shadow-sm"
                                        >
                                            <Sparkles size={13} />
                                            <span>Áp dụng Lyric</span>
                                        </button>
                                    )}

                                    {/* Play Beat */}
                                    {item.hasInstrumental && (() => {
                                        const isBeatActive = currentSong?.id === `karaoke-${item.songId}-beat`;
                                        const isBeatPlaying = isBeatActive && playerState === PlayerState.PLAYING;
                                        return (
                                            <button
                                                type="button"
                                                onClick={() => void playOutputStem(item, 'beat')}
                                                title={isBeatPlaying ? 'Tạm dừng Beat Karaoke' : 'Nghe Beat Karaoke tách từ bài này'}
                                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                                                    isBeatActive
                                                        ? 'bg-emerald-600 ring-2 ring-emerald-400 text-white'
                                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                }`}
                                            >
                                                {isBeatPlaying ? <Pause size={13} /> : <Mic size={13} />}
                                                <span>{isBeatPlaying ? 'Đang phát Beat' : 'Phát Beat'}</span>
                                            </button>
                                        );
                                    })()}

                                    {/* Play Vocal */}
                                    {item.hasVocals && (() => {
                                        const isVocalActive = currentSong?.id === `karaoke-${item.songId}-vocal`;
                                        const isVocalPlaying = isVocalActive && playerState === PlayerState.PLAYING;
                                        return (
                                            <button
                                                type="button"
                                                onClick={() => void playOutputStem(item, 'vocal')}
                                                title={isVocalPlaying ? 'Tạm dừng giọng hát' : 'Nghe riêng giọng ca sĩ (Isolated Vocal)'}
                                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                                    isVocalActive
                                                        ? 'bg-blue-600 border-blue-400 text-white ring-2 ring-blue-400/50'
                                                        : 'border-neutral-300 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                                                }`}
                                            >
                                                {isVocalPlaying ? <Pause size={13} /> : <Volume2 size={13} />}
                                                <span>{isVocalPlaying ? 'Đang phát Vocal' : 'Giọng hát'}</span>
                                            </button>
                                        );
                                    })()}

                                    {/* Edit in Visual LRC Studio */}
                                    <button
                                        type="button"
                                        onClick={() => handleOpenInEditor(item)}
                                        title="Chỉnh sửa lời trong Visual LRC Studio"
                                        className="p-1.5 rounded-lg border border-neutral-300 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <Edit3 size={13} />
                                    </button>

                                    {/* Open Folder */}
                                    <button
                                        type="button"
                                        onClick={() => void openAiKaraokeOutputDirectory(item.songId)}
                                        title="Mở thư mục chứa file stem"
                                        className="p-1.5 rounded-lg border border-neutral-300 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <FolderOpen size={13} />
                                    </button>

                                    {/* Export LRC */}
                                    <button
                                        type="button"
                                        onClick={() => void handleExportLrc(item)}
                                        title="Xuất file .lrc"
                                        className="p-1.5 rounded-lg border border-neutral-300 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <Download size={13} />
                                    </button>

                                    {/* Delete Stems */}
                                    <button
                                        type="button"
                                        disabled={isDeleting}
                                        onClick={() => void handleDelete(item.songId, item.songTitle)}
                                        title="Xóa bản tách khỏi máy tính"
                                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default KaraokeOutputsLibraryTab;
