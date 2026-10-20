// src/components/modal/lyric-editor/LrcEditorModal.tsx
// Comprehensive Visual LRC Studio for Folia-major:
// - Interactive Table View with per-line audio preview and millisecond time nudging
// - Tap-to-Sync real-time karaoke timing mode with Space/Enter keyboard triggers
// - Raw LRC monospace editor with bi-directional syncing
// - Undo / Redo history stack and native Folia theme styling

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, type MotionValue } from 'framer-motion';
import {
    X,
    Play,
    Pause,
    Plus,
    Trash2,
    RotateCcw,
    RotateCw,
    Save,
    Download,
    FileText,
    List,
    Clock,
    Sparkles,
    Pin,
    ArrowDown,
    ArrowUp,
    Volume2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGlass } from '../../../mods/useGlass';
import type { Theme, SongResult } from '../../../types';
import { useLrcEditorStore } from '../../../stores/useLrcEditorStore';
import {
    type EditableLyricLine,
    shiftLineTime,
    shiftAllLinesTime,
    insertLineAfter,
    deleteLine,
    updateLineText,
    updateLineTranslation,
    splitLineAt,
    mergeLineWithNext,
    rawLrcToEditableLines,
    editableLinesToLrc,
} from '../../../utils/lyrics/lyricEditorModel';
import { formatLrcTimestamp } from '../../../utils/lyrics/lrcSerializer';

interface LrcEditorModalProps {
    currentTime: MotionValue<number>;
    onSeek: (time: number) => void;
    onSave?: (lrcContent: string) => void;
    theme?: Theme;
    isDaylight: boolean;
}

export const LrcEditorModal: React.FC<LrcEditorModalProps> = ({
    currentTime,
    onSeek,
    onSave,
    theme,
    isDaylight,
}) => {
    useGlass();
    const { t } = useTranslation();
    const {
        isOpen,
        song,
        lines,
        activeLineIndex,
        isTapSyncActive,
        viewMode,
        metadata,
        history,
        closeEditor,
        setViewMode,
        setLines,
        setActiveLineIndex,
        setIsTapSyncActive,
        undo,
        redo,
        stampCurrentLineTime,
        getSerializedLrc,
    } = useLrcEditorStore();

    const [rawText, setRawText] = useState('');
    const [liveCurrentTime, setLiveCurrentTime] = useState(0);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const activeRowRef = useRef<HTMLDivElement>(null);

    // Track live playback time from MotionValue
    useEffect(() => {
        const unsub = currentTime.on('change', (latest) => {
            setLiveCurrentTime(latest);
        });
        return () => unsub();
    }, [currentTime]);

    // Keep raw text synced when entering raw view
    useEffect(() => {
        if (viewMode === 'raw') {
            setRawText(getSerializedLrc());
        }
    }, [viewMode, getSerializedLrc]);

    // Keyboard shortcuts for Tap-to-Sync & Undo/Redo
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
                return;
            }
            // Redo: Ctrl+Y or Ctrl+Shift+Z
            if (
                ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
            ) {
                e.preventDefault();
                redo();
                return;
            }

            // In Tap-to-Sync mode: Space or Enter stamps time
            if (isTapSyncActive) {
                if (e.code === 'Space' || e.key === 'Enter') {
                    // Prevent page scroll
                    e.preventDefault();
                    stampCurrentLineTime(currentTime.get());
                } else if (e.key === 'Backspace') {
                    e.preventDefault();
                    if (activeLineIndex > 0) {
                        setActiveLineIndex(activeLineIndex - 1);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsTapSyncActive(false);
                }
            } else if (e.key === 'Escape') {
                closeEditor();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isTapSyncActive, activeLineIndex, currentTime, stampCurrentLineTime, undo, redo, closeEditor, setIsTapSyncActive, setActiveLineIndex]);

    // Auto-scroll to active row in Tap-to-Sync mode
    useEffect(() => {
        if (isTapSyncActive && activeRowRef.current) {
            activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeLineIndex, isTapSyncActive]);

    if (!isOpen) return null;

    const accentBg = theme?.accentColor || theme?.primaryColor || '#ec4899';
    const glassBg = isDaylight ? 'bg-white/95' : 'bg-neutral-900/95';
    const borderColor = isDaylight ? 'border-neutral-200' : 'border-neutral-800';
    const cardBg = isDaylight ? 'bg-neutral-50' : 'bg-neutral-800/50';
    const textColor = isDaylight ? 'text-neutral-900' : 'text-neutral-100';
    const subTextColor = isDaylight ? 'text-neutral-500' : 'text-neutral-400';

    const handleSave = () => {
        let serialized = '';
        if (viewMode === 'raw') {
            serialized = rawText;
            const reParsed = rawLrcToEditableLines(rawText);
            setLines(reParsed, true);
        } else {
            serialized = getSerializedLrc();
        }
        onSave?.(serialized);
        closeEditor();
    };

    const handleExport = async () => {
        const serialized = viewMode === 'raw' ? rawText : getSerializedLrc();
        const defaultName = `${song?.name || 'lyrics'}.lrc`;
        if (window.electron?.aiKaraoke?.exportLrcFile) {
            await window.electron.aiKaraoke.exportLrcFile({ defaultFileName: defaultName, content: serialized });
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                    className={`flex flex-col w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden border ${glassBg} ${borderColor} ${textColor}`}
                >
                    {/* Header */}
                    <div className={`flex items-center justify-between px-6 py-4 border-b ${borderColor}`}>
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
                                style={{ backgroundColor: accentBg }}
                            >
                                <Clock size={20} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold leading-tight flex items-center gap-2">
                                    {t('lyricEditor.title', 'Trình chỉnh sửa lời bài hát')}
                                </h2>
                                <p className={`text-xs ${subTextColor} truncate max-w-md`}>
                                    {song ? `${song.name} — ${song.artists?.map(a => a.name).join(', ') || (song as any).artist || ''}` : 'Chỉnh sửa và đồng bộ mốc thời gian'}
                                </p>
                            </div>
                        </div>

                        {/* Top Action Tools */}
                        <div className="flex items-center gap-2">
                            {/* Undo / Redo */}
                            <div className={`flex items-center rounded-lg border ${borderColor} overflow-hidden`}>
                                <button
                                    type="button"
                                    onClick={undo}
                                    disabled={history.past.length === 0}
                                    title="Hoàn tác (Ctrl+Z)"
                                    className={`p-2 transition-colors hover:bg-white/10 ${history.past.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                    <RotateCcw size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={redo}
                                    disabled={history.future.length === 0}
                                    title="Làm lại (Ctrl+Y)"
                                    className={`p-2 transition-colors hover:bg-white/10 ${history.future.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                    <RotateCw size={16} />
                                </button>
                            </div>

                            {/* Mode Toggles */}
                            <div className={`flex items-center p-0.5 rounded-lg border ${borderColor} ${cardBg}`}>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                        viewMode === 'table' ? 'bg-white/20 text-white shadow-sm' : subTextColor
                                    }`}
                                >
                                    <List size={14} />
                                    <span>Bảng dòng</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('raw')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                        viewMode === 'raw' ? 'bg-white/20 text-white shadow-sm' : subTextColor
                                    }`}
                                >
                                    <FileText size={14} />
                                    <span>Văn bản thô</span>
                                </button>
                            </div>

                            {/* Tap-to-Sync Toggle */}
                            <button
                                type="button"
                                onClick={() => setIsTapSyncActive(!isTapSyncActive)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    isTapSyncActive
                                        ? 'bg-amber-500 text-white shadow-md animate-pulse'
                                        : 'bg-white/10 hover:bg-white/15'
                                }`}
                            >
                                <Sparkles size={14} />
                                <span>{isTapSyncActive ? 'Đang Bắt Nhịp...' : 'Gõ nhịp (Tap-to-Sync)'}</span>
                            </button>

                            {/* Export */}
                            <button
                                type="button"
                                onClick={handleExport}
                                title="Xuất file .lrc ra ổ đĩa"
                                className="p-2 rounded-lg bg-white/10 hover:bg-white/15 transition-colors"
                            >
                                <Download size={16} />
                            </button>

                            {/* Save */}
                            <button
                                type="button"
                                onClick={handleSave}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
                                style={{ backgroundColor: accentBg }}
                            >
                                <Save size={15} />
                                <span>Lưu lời</span>
                            </button>

                            {/* Close */}
                            <button
                                type="button"
                                onClick={closeEditor}
                                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Tap-to-Sync Active Floating Banner */}
                    {isTapSyncActive && (
                        <div className="bg-amber-500/20 border-b border-amber-500/30 px-6 py-2.5 flex items-center justify-between text-amber-300 text-xs">
                            <div className="flex items-center gap-2 font-medium">
                                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                                <span>
                                    Chế độ Bắt nhịp đang bật: Nhấn phím <strong>[SPACE]</strong> hoặc <strong>[ENTER]</strong> khi ca sĩ bắt đầu câu hát. Phím <strong>[BACKSPACE]</strong> để lùi câu.
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsTapSyncActive(false)}
                                className="px-2.5 py-1 rounded bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 text-xs font-bold transition-colors"
                            >
                                Thoát chế độ
                            </button>
                        </div>
                    )}

                    {/* Content Body */}
                    <div className="flex-1 overflow-hidden relative">
                        {viewMode === 'raw' ? (
                            <div className="w-full h-full p-4">
                                <textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder="[00:12.30]Lời bài hát..."
                                    className={`w-full h-full p-4 rounded-xl font-mono text-xs leading-relaxed resize-none border ${borderColor} ${cardBg} ${textColor} focus:outline-none focus:ring-1 focus:ring-white/30`}
                                />
                            </div>
                        ) : (
                            <div
                                ref={tableScrollRef}
                                className="w-full h-full overflow-y-auto px-6 py-4 space-y-2 st-scroll"
                            >
                                {lines.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-16">
                                        <Clock size={36} className="opacity-30" />
                                        <p className="text-sm font-medium">Chưa có câu lyric nào.</p>
                                        <button
                                            type="button"
                                            onClick={() => setLines([{ id: `line-${Date.now()}`, startTime: 0, text: '' }])}
                                            className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-md"
                                            style={{ backgroundColor: accentBg }}
                                        >
                                            Thêm dòng đầu tiên
                                        </button>
                                    </div>
                                ) : (
                                    lines.map((line, idx) => {
                                        const isCurrentSyncLine = isTapSyncActive && activeLineIndex === idx;
                                        const isPlaybackActive =
                                            liveCurrentTime >= line.startTime &&
                                            (idx === lines.length - 1 || liveCurrentTime < lines[idx + 1].startTime);
                                        const hasWords = Boolean(line.words && line.words.length > 0);

                                        return (
                                            <div
                                                key={line.id}
                                                ref={isCurrentSyncLine ? activeRowRef : null}
                                                className={`group flex ${hasWords ? 'items-start' : 'items-center'} gap-3 p-2.5 rounded-xl border transition-all ${
                                                    isCurrentSyncLine
                                                        ? 'border-amber-400 bg-amber-500/15 shadow-md ring-1 ring-amber-400/50'
                                                        : isPlaybackActive
                                                        ? 'border-white/20 bg-white/10'
                                                        : `${borderColor} ${cardBg} hover:border-white/15`
                                                }`}
                                            >
                                                {/* Line Number */}
                                                <span className={`w-7 text-[11px] font-mono text-center ${subTextColor} ${hasWords ? 'mt-1.5' : ''}`}>
                                                    #{idx + 1}
                                                </span>

                                                {/* Play Preview */}
                                                <button
                                                    type="button"
                                                    onClick={() => onSeek(line.startTime)}
                                                    title={`Nghe thử từ ${formatLrcTimestamp(line.startTime)}`}
                                                    className={`p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors ${hasWords ? 'mt-0.5' : ''}`}
                                                >
                                                    <Play size={14} />
                                                </button>

                                                {/* Timestamp Input & Quick Nudge Buttons */}
                                                <div className={`flex items-center gap-1 font-mono ${hasWords ? 'mt-0.5' : ''}`}>
                                                    <span className="text-xs font-bold px-2 py-1 rounded bg-black/30 border border-white/5 tabular-nums">
                                                        [{formatLrcTimestamp(line.startTime)}]
                                                    </span>

                                                    {/* Nudge Buttons */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setLines(shiftLineTime(lines, line.id, -0.5))}
                                                        title="Lùi 0.5 giây"
                                                        className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/15"
                                                    >
                                                        -0.5s
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setLines(shiftLineTime(lines, line.id, -0.1))}
                                                        title="Lùi 0.1 giây"
                                                        className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/15"
                                                    >
                                                        -0.1s
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setLines(shiftLineTime(lines, line.id, 0.1))}
                                                        title="Tiến 0.1 giây"
                                                        className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/15"
                                                    >
                                                        +0.1s
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setLines(shiftLineTime(lines, line.id, 0.5))}
                                                        title="Tiến 0.5 giây"
                                                        className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/15"
                                                    >
                                                        +0.5s
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setLines(shiftLineTime(lines, line.id, liveCurrentTime - line.startTime))}
                                                        title="Ghim vị trí nhạc hiện tại"
                                                        className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10"
                                                    >
                                                        <Pin size={12} />
                                                    </button>
                                                </div>

                                                {/* Text Input & Word-level Karaoke Chips */}
                                                <div className="flex-1 flex flex-col gap-1 min-w-0">
                                                    <input
                                                        type="text"
                                                        value={line.text}
                                                        onChange={(e) => setLines(updateLineText(lines, line.id, e.target.value), false)}
                                                        placeholder="Nội dung câu hát..."
                                                        className="w-full bg-transparent px-2.5 py-1 text-xs focus:outline-none focus:bg-white/5 rounded border border-transparent focus:border-white/20 transition-all font-sans"
                                                    />
                                                    {line.words && line.words.length > 0 && (
                                                        <div className="flex flex-wrap items-center gap-1 px-1 pt-0.5">
                                                            <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                                                Karaoke ({line.words.length} từ)
                                                            </span>
                                                            {line.words.map((w, wIdx) => (
                                                                <span
                                                                    key={wIdx}
                                                                    title={`${formatLrcTimestamp(w.startTime)}${w.endTime !== undefined ? ' -> ' + formatLrcTimestamp(w.endTime) : ''}`}
                                                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10"
                                                                >
                                                                    <span className="text-neutral-400">&lt;{formatLrcTimestamp(w.startTime)}&gt;</span>
                                                                    <span className="font-sans text-neutral-200">{w.text}</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Action Buttons */}
                                                <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${hasWords ? 'mt-1' : ''}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setLines(insertLineAfter(lines, idx))}
                                                        title="Thêm dòng dưới"
                                                        className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setLines(deleteLine(lines, line.id))}
                                                        title="Xóa dòng"
                                                        className="p-1 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className={`flex items-center justify-between px-6 py-3 border-t ${borderColor} text-xs ${subTextColor}`}>
                        <div className="flex items-center gap-4">
                            <span>Tổng số dòng: <strong>{lines.length}</strong></span>
                            <span>Thời gian phát: <strong>{formatLrcTimestamp(liveCurrentTime)}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>Phím tắt: [Ctrl+Z] Hoàn tác · [Ctrl+Y] Làm lại · [Space] Bắt nhịp</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
