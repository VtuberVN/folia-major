// src/components/karaoke/AiKaraokeFloatingPill.tsx
// Floating interactive pill showing background AI Karaoke separation progress and status.
// Allows users to minimize the modal, keep working or listening to music, and reopen anytime with one click.

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Check, AlertCircle, X, ChevronUp, Mic } from 'lucide-react';
import { useAiKaraokeStore, openAiKaraokeModal } from '../../stores/useAiKaraokeStore';
import { useAppChromeStore } from '../../stores/useAppChromeStore';
import { useDownloadStore } from '../../stores/useDownloadStore';

export const AiKaraokeFloatingPill: React.FC = () => {
    const {
        isOpen,
        activeSong,
        jobStage,
        jobProgress,
        jobMessage,
    } = useAiKaraokeStore();

    const isPlayerChromeHidden = useAppChromeStore((state) => state.isPlayerChromeHidden);
    const hasActiveDownloads = useDownloadStore((state) =>
        state.items.some((it) => it.status === 'downloading' || it.status === 'resolving'),
    );
    const [dismissedCompleted, setDismissedCompleted] = useState(false);

    // Reset dismissal when a new job starts
    useEffect(() => {
        if (jobStage !== 'completed') {
            setDismissedCompleted(false);
        }
    }, [jobStage]);

    // Don't show if modal is already open, or if idle
    if (isOpen || jobStage === 'idle') return null;

    const isRunning = jobStage !== 'completed' && jobStage !== 'error';

    // Auto-dismiss completed notice after dismissed by user
    if (jobStage === 'completed' && dismissedCompleted) return null;

    const handleClick = () => {
        openAiKaraokeModal(activeSong);
    };

    // If download pill is active, shift slightly higher (bottom-36) to prevent overlap
    const bottomClass = hasActiveDownloads ? 'bottom-36' : 'bottom-24';

    return createPortal(
        <aside
            aria-hidden={isPlayerChromeHidden}
            className={`fixed ${bottomClass} right-4 z-[290] flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold shadow-2xl backdrop-blur-xl border transition-all duration-300 ${
                isPlayerChromeHidden ? 'opacity-0 translate-y-3 pointer-events-none' : 'opacity-100 translate-y-0'
            } ${
                isRunning
                    ? 'bg-neutral-900/90 border-pink-500/30 text-white hover:bg-neutral-800'
                    : jobStage === 'completed'
                    ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100 hover:bg-emerald-900'
                    : 'bg-red-950/90 border-red-500/40 text-red-100 hover:bg-red-900'
            }`}
        >
            <button
                type="button"
                onClick={handleClick}
                className="flex items-center gap-2.5 focus:outline-none"
                title="Bấm để mở lại bảng chi tiết AI Karaoke"
            >
                {isRunning ? (
                    <RefreshCw size={14} className="animate-spin text-pink-400 shrink-0" />
                ) : jobStage === 'completed' ? (
                    <Check size={15} className="text-emerald-400 shrink-0" />
                ) : (
                    <AlertCircle size={15} className="text-red-400 shrink-0" />
                )}

                <div className="flex flex-col text-left leading-tight">
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold flex items-center gap-1">
                            <Mic size={13} className="text-pink-400" />
                            <span>{isRunning ? 'Tách lời & nhạc:' : jobStage === 'completed' ? 'Karaoke sẵn sàng!' : 'Lỗi tách'}</span>
                        </span>
                        {isRunning && (
                            <span className="font-mono text-pink-300 font-bold tabular-nums">
                                {jobProgress}%
                            </span>
                        )}
                    </div>
                    <span className="text-[10px] opacity-75 max-w-[180px] truncate">
                        {activeSong?.name || jobMessage}
                    </span>
                </div>

                <div className="flex items-center gap-1 pl-2 border-l border-white/10 text-[11px] text-pink-300 opacity-90 hover:opacity-100 font-medium">
                    <span>Mở lại</span>
                    <ChevronUp size={12} />
                </div>
            </button>

            {!isRunning && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setDismissedCompleted(true);
                    }}
                    className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors ml-1"
                    title="Đóng thông báo"
                >
                    <X size={12} />
                </button>
            )}
        </aside>,
        document.body,
    );
};

export default AiKaraokeFloatingPill;
