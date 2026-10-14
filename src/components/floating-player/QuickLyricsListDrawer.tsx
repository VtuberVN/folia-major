import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ListMusic, Music2, X } from 'lucide-react';
import type { MotionValue } from 'framer-motion';
import type { LyricData, Theme } from '../../types';
import { findLatestActiveLineIndex } from '../../utils/appPlaybackHelpers';

// src/components/floating-player/QuickLyricsListDrawer.tsx
// Quick scrollable lyrics list drawer for full song view, auto-scrolling, and click-to-seek.

interface QuickLyricsListDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    lyrics: LyricData | null;
    currentTime: MotionValue<number>;
    onSeek: (time: number) => void;
    primaryColor?: string;
    secondaryColor?: string;
    theme?: Theme;
    isDaylight?: boolean;
}

const drawerTransition = {
    duration: 0.22,
    ease: [0.22, 1, 0.36, 1] as const,
};

const drawerMotion = {
    initial: { opacity: 0, x: 20, scale: 0.98 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: 20, scale: 0.98 },
};

const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const FOLLOW_PAUSE_MS = 3000;

export default function QuickLyricsListDrawer({
    isOpen,
    onClose,
    lyrics,
    currentTime,
    onSeek,
    primaryColor = '#ffffff',
    secondaryColor = 'rgba(255,255,255,0.6)',
    theme,
    isDaylight = false,
}: QuickLyricsListDrawerProps) {
    const { t } = useTranslation();
    const listRef = useRef<HTMLDivElement>(null);
    const lineRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
    const [activeLineIndex, setActiveLineIndex] = useState(-1);
    const userScrolledUntilRef = useRef<number>(0);

    const lines = lyrics?.lines ?? [];

    const handleUserScroll = useCallback(() => {
        userScrolledUntilRef.current = Date.now() + FOLLOW_PAUSE_MS;
    }, []);

    // Listen to playback time updates to advance the active line
    useEffect(() => {
        if (!isOpen || lines.length === 0) return;

        const unsubscribe = currentTime.on('change', (timeSec) => {
            const index = findLatestActiveLineIndex(lines, timeSec);
            if (index !== activeLineIndex) {
                setActiveLineIndex(index);
                if (Date.now() > userScrolledUntilRef.current) {
                    const rowEl = lineRefs.current.get(index);
                    rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });

        return unsubscribe;
    }, [isOpen, lines, currentTime, activeLineIndex]);

    // On initial drawer open, immediately scroll to the active line without animation
    useEffect(() => {
        if (isOpen && lines.length > 0) {
            const initialIndex = findLatestActiveLineIndex(lines, currentTime.get());
            setActiveLineIndex(initialIndex);
            userScrolledUntilRef.current = 0;
            const timer = setTimeout(() => {
                lineRefs.current.get(initialIndex)?.scrollIntoView({ block: 'center' });
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen, lines, currentTime]);

    const glassBg = isDaylight ? 'bg-white/80' : 'bg-[#121214]/85';
    const borderColor = isDaylight ? 'border-black/10' : 'border-white/10';
    const cardShadow = 'shadow-[0_20px_60px_rgba(0,0,0,0.4)]';
    const accentColor = theme?.accentColor || (isDaylight ? '#2563eb' : '#38bdf8');

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    {...drawerMotion}
                    transition={drawerTransition}
                    className={`fixed top-20 right-4 sm:right-6 bottom-28 w-[min(380px,calc(100vw-32px))] z-40 rounded-[28px] border ${borderColor} ${glassBg} backdrop-blur-2xl ${cardShadow} flex flex-col overflow-hidden select-none pointer-events-auto`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-2.5">
                            <ListMusic size={18} style={{ color: primaryColor }} />
                            <h2 className="text-sm font-semibold" style={{ color: primaryColor }}>
                                {t('lyrics.lyricsList', 'Lyrics')}
                            </h2>
                            {lines.length > 0 && (
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-white/10 opacity-60" style={{ color: secondaryColor }}>
                                    {t('lyrics.linesCount', { count: lines.length, defaultValue: `${lines.length} lines` })}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            title={t('common.close', 'Close')}
                            aria-label={t('common.close', 'Close')}
                            className="p-1 rounded-full opacity-60 hover:opacity-100 hover:bg-white/10 transition-all cursor-pointer"
                            style={{ color: primaryColor }}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Scrollable list of lines */}
                    <div
                        ref={listRef}
                        onWheel={handleUserScroll}
                        onTouchMove={handleUserScroll}
                        className="flex-1 overflow-y-auto p-2.5 space-y-1 scroll-smooth overscroll-contain"
                    >
                        {lines.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 gap-3 opacity-40">
                                <Music2 size={32} />
                                <span className="text-xs">
                                    {t('lyrics.noLyrics', 'No lyrics available for this song')}
                                </span>
                            </div>
                        ) : (
                            lines.map((line, index) => {
                                const isActive = index === activeLineIndex;
                                const subText = line.translation || line.romanization;

                                return (
                                    <button
                                        key={`${line.startTime}-${index}`}
                                        ref={(el) => {
                                            if (el) lineRefs.current.set(index, el);
                                            else lineRefs.current.delete(index);
                                        }}
                                        type="button"
                                        onClick={() => onSeek(line.startTime)}
                                        className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer flex flex-col gap-0.5 ${
                                            isActive
                                                ? 'bg-white/12 opacity-100 font-semibold shadow-xs'
                                                : 'opacity-55 hover:opacity-90 hover:bg-white/5'
                                        }`}
                                    >
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span
                                                className={`text-[13px] leading-snug break-words ${
                                                    isActive ? 'scale-[1.01] origin-left' : ''
                                                }`}
                                                style={{ color: isActive ? accentColor : primaryColor }}
                                            >
                                                {line.fullText}
                                            </span>
                                            <span className="text-[10px] font-mono shrink-0 opacity-50 tabular-nums">
                                                {formatTime(line.startTime)}
                                            </span>
                                        </div>
                                        {subText && (
                                            <span className="text-[11px] leading-tight opacity-70 italic font-normal" style={{ color: secondaryColor }}>
                                                {subText}
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
