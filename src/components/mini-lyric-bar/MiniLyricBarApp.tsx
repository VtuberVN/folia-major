import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Lock,
    Maximize2,
    Minus,
    Music,
    Pause,
    Play,
    RotateCcw,
    SkipBack,
    SkipForward,
    Unlock,
    X,
} from 'lucide-react';
import { PlayerState, type Line, type LyricData } from '../../types';
import type { RemoteControlCommand, RemoteControlSnapshot } from '../../types/remoteControl';
import { findLatestActiveLineIndex } from '../../utils/appPlaybackHelpers';
import { buildMonetDisplayTokens, type MonetDisplayToken } from '../visualizer/monet/monetLyricsModel';

// src/components/mini-lyric-bar/MiniLyricBarApp.tsx
// Desktop Mini Lyric Bar inspired by lia.lines.
// Runs in an independent transparent, frameless, always-on-top window.

const clampProgress = (value: number) => Math.max(0, Math.min(100, value));

const getInterpolatedTime = (
    playerState: PlayerState,
    duration: number,
    sync: { snapshotTime: number; localTime: number },
) => {
    if (playerState !== PlayerState.PLAYING) {
        return sync.snapshotTime;
    }

    const elapsed = (performance.now() - sync.localTime) / 1000;
    const upperBound = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
    return Math.min(upperBound, sync.snapshotTime + elapsed);
};

const resolveDisplayLines = (lyrics: LyricData | null | undefined, time: number) => {
    if (!lyrics?.lines?.length) {
        return { currentLine: null, nextLine: null };
    }

    const index = findLatestActiveLineIndex(lyrics.lines, time);
    if (index !== -1) {
        return {
            currentLine: lyrics.lines[index] ?? null,
            nextLine: lyrics.lines[index + 1] ?? null,
        };
    }

    const upcomingIndex = lyrics.lines.findIndex(line => line.startTime > time);
    const previousIndex = upcomingIndex === -1 ? lyrics.lines.length - 1 : upcomingIndex - 1;
    return {
        currentLine: previousIndex >= 0 ? lyrics.lines[previousIndex] ?? null : null,
        nextLine: upcomingIndex === -1 ? null : lyrics.lines[upcomingIndex] ?? null,
    };
};

export default function MiniLyricBarApp() {
    const { t } = useTranslation();
    const [snapshot, setSnapshot] = useState<RemoteControlSnapshot | null>(null);
    const [isClickThrough, setIsClickThrough] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);

    const syncRef = useRef({ snapshotTime: 0, localTime: performance.now() });
    const animFrameRef = useRef<number | null>(null);

    // Subscribe to IPC snapshot and click-through updates
    useEffect(() => {
        const electron = window.electron;
        if (!electron) return;

        let active = true;

        // Fetch initial state
        void electron.getMiniLyricBarState?.().then(state => {
            if (!active || !state) return;
            setIsClickThrough(Boolean(state.clickThrough));
            if (state.snapshot) {
                const snapshotData = state.snapshot as unknown as RemoteControlSnapshot;
                setSnapshot(snapshotData);
                const baseTime = snapshotData.currentTime - (snapshotData.lyricOffsetMs || 0) / 1000;
                syncRef.current = { snapshotTime: baseTime, localTime: performance.now() };
                setCurrentTime(baseTime);
            }
        });

        // Listen for live snapshot updates
        const unsubsSnapshot = electron.onMiniLyricBarSnapshot?.(next => {
            if (!active) return;
            const nextSnapshot = next as unknown as RemoteControlSnapshot;
            setSnapshot(prev => ({
                ...(prev || {}),
                ...nextSnapshot,
                lyrics: Object.prototype.hasOwnProperty.call(next, 'lyrics')
                    ? next.lyrics ?? null
                    : prev?.lyrics ?? null,
            } as RemoteControlSnapshot));

            const baseTime = nextSnapshot.currentTime - (nextSnapshot.lyricOffsetMs || 0) / 1000;
            syncRef.current = { snapshotTime: baseTime, localTime: performance.now() };
            setCurrentTime(baseTime);
        });

        // Listen for click-through toggles
        const unsubsClickThrough = electron.onMiniLyricBarClickThroughChanged?.(enabled => {
            if (active) setIsClickThrough(enabled);
        });

        return () => {
            active = false;
            unsubsSnapshot?.();
            unsubsClickThrough?.();
        };
    }, []);

    // Interpolate playback position smoothly during active playback
    useEffect(() => {
        const isPlaying = snapshot?.playerState === PlayerState.PLAYING;
        if (!isPlaying) {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
            return;
        }

        const updateLoop = () => {
            const interpolated = getInterpolatedTime(
                PlayerState.PLAYING,
                snapshot?.duration || 0,
                syncRef.current,
            );
            setCurrentTime(interpolated);
            animFrameRef.current = requestAnimationFrame(updateLoop);
        };

        animFrameRef.current = requestAnimationFrame(updateLoop);

        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
                animFrameRef.current = null;
            }
        };
    }, [snapshot?.playerState, snapshot?.duration]);

    // Send playback commands to main window
    const handleCommand = useCallback((command: RemoteControlCommand) => {
        void window.electron?.sendMiniLyricBarCommand?.(command);
    }, []);

    // Toggle click-through lock mode
    const handleToggleClickThrough = useCallback((nextEnabled: boolean) => {
        setIsClickThrough(nextEnabled);
        void window.electron?.setMiniLyricBarClickThrough?.(nextEnabled);
    }, []);

    // Close window
    const handleClose = useCallback(() => {
        void window.electron?.closeMiniLyricBar?.();
    }, []);

    // Current lines resolution
    const { currentLine } = useMemo(() => {
        return resolveDisplayLines(snapshot?.lyrics, currentTime);
    }, [snapshot?.lyrics, currentTime]);

    // Build stable display tokens matching fullText spaces and punctuation around timed words
    const displayTokens = useMemo<MonetDisplayToken[]>(() => {
        if (!currentLine) return [];
        return buildMonetDisplayTokens({
            ...currentLine,
            words: currentLine.words || [],
        });
    }, [currentLine]);

    // Translation or Romanization subtitle
    const secondaryText = useMemo(() => {
        if (!currentLine) return null;
        return currentLine.translation || currentLine.romanization || null;
    }, [currentLine]);

    const isPlaying = snapshot?.playerState === PlayerState.PLAYING;

    return (
        <div
            className="w-screen h-screen select-none overflow-hidden p-1 flex items-center justify-center font-sans antialiased"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
                setIsHovered(false);
                if (isClickThrough) {
                    void window.electron?.setMiniLyricBarMouseIgnore?.(true);
                }
            }}
        >
            {/* Main Floating Capsule Bar */}
            <div
                className={`relative w-full h-full flex items-center px-3.5 py-1.5 rounded-2xl transition-all duration-300 ${
                    isClickThrough
                        ? 'bg-black/40 backdrop-blur-md border border-white/10 shadow-lg'
                        : isHovered
                            ? 'bg-neutral-900/90 backdrop-blur-2xl border border-white/20 shadow-2xl ring-1 ring-white/10'
                            : 'bg-neutral-900/75 backdrop-blur-xl border border-white/15 shadow-xl'
                }`}
                style={{
                    WebkitAppRegion: isClickThrough ? 'no-drag' : 'drag',
                    cursor: isClickThrough ? 'default' : 'move',
                } as React.CSSProperties}
            >
                {/* Left: Album cover / music icon */}
                <div
                    className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-xl overflow-hidden bg-white/10 border border-white/10 shadow-sm mr-3"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    {snapshot?.coverUrl ? (
                        <img
                            src={snapshot.coverUrl}
                            alt=""
                            className="w-full h-full object-cover select-none pointer-events-none"
                            draggable={false}
                        />
                    ) : (
                        <Music size={16} className="text-white/60 animate-pulse" />
                    )}
                </div>

                {/* Center: Synced Lyrics display */}
                <div className="flex-1 min-w-0 flex flex-col justify-center overflow-hidden">
                    {currentLine ? (
                        <div className="flex flex-col justify-center">
                            {/* Primary lyric line with word-level or line progress fill */}
                            <div className="text-sm sm:text-base font-bold tracking-wide truncate text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] leading-tight">
                                {displayTokens.length > 0 ? (
                                    displayTokens.map((token, idx) => {
                                        if (token.timed && token.startTime !== null && token.endTime !== null) {
                                            const progress = token.endTime > token.startTime
                                                ? clampProgress(((currentTime - token.startTime) / (token.endTime - token.startTime)) * 100)
                                                : (currentTime >= token.startTime ? 100 : 0);

                                            return (
                                                <span
                                                    key={token.key}
                                                    className="inline-block whitespace-pre transition-colors duration-75"
                                                    style={{
                                                        backgroundImage: `linear-gradient(to right, #38bdf8 ${progress}%, #f1f5f9 ${progress}%)`,
                                                        WebkitBackgroundClip: 'text',
                                                        WebkitTextFillColor: 'transparent',
                                                    }}
                                                >
                                                    {token.text}
                                                </span>
                                            );
                                        }

                                        // Static delimiter token (e.g. space, punctuation) preserving original text spacing
                                        let isPassed = false;
                                        for (let i = idx - 1; i >= 0; i--) {
                                            const prev = displayTokens[i];
                                            if (prev.timed && prev.endTime !== null) {
                                                isPassed = currentTime >= prev.endTime;
                                                break;
                                            }
                                        }

                                        return (
                                            <span
                                                key={token.key}
                                                className="inline-block whitespace-pre select-none"
                                                style={{
                                                    color: isPassed ? '#38bdf8' : '#f1f5f9',
                                                }}
                                            >
                                                {token.text}
                                            </span>
                                        );
                                    })
                                ) : (
                                    <span style={{ color: '#f1f5f9' }}>
                                        {currentLine.fullText}
                                    </span>
                                )}
                            </div>

                            {/* Secondary translation or romanization subtitle */}
                            {secondaryText && (
                                <div className="text-[11px] text-white/70 font-medium truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-0.5">
                                    {secondaryText}
                                </div>
                            )}
                        </div>
                    ) : snapshot?.hasTrack ? (
                        <div className="flex flex-col justify-center">
                            <span className="text-sm font-semibold text-white/90 truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                                {snapshot.title || t('ui.waitingForMusic')}
                            </span>
                            <span className="text-[11px] text-white/50 truncate">
                                {snapshot.artist || 'Folia Major'}
                            </span>
                        </div>
                    ) : (
                        <div className="text-xs text-white/50 font-medium tracking-wide truncate">
                            {t('ui.noTrack', 'Folia Major')}
                        </div>
                    )}
                </div>

                {/* Right: Floating control toolbar or Lock icon */}
                {!isClickThrough ? (
                    <div
                        className={`flex items-center space-x-1 ml-2 transition-opacity duration-200 ${
                            isHovered ? 'opacity-100' : 'opacity-0'
                        }`}
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    >
                        {/* Previous track */}
                        <button
                            type="button"
                            onClick={() => handleCommand({ type: 'previous' })}
                            title={t('ui.previousTrack')}
                            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                        >
                            <SkipBack size={14} />
                        </button>

                        {/* Play / Pause */}
                        <button
                            type="button"
                            onClick={() => handleCommand({ type: 'play-pause' })}
                            title={isPlaying ? t('ui.pause') : t('ui.play')}
                            className="p-1.5 rounded-lg text-white bg-white/15 hover:bg-white/25 active:scale-95 transition-all shadow-sm"
                        >
                            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                        </button>

                        {/* Next track */}
                        <button
                            type="button"
                            onClick={() => handleCommand({ type: 'next' })}
                            title={t('ui.nextTrack')}
                            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                        >
                            <SkipForward size={14} />
                        </button>

                        {/* Lock Click-Through Toggle */}
                        <button
                            type="button"
                            onClick={() => handleToggleClickThrough(true)}
                            title={t('ui.miniLyricBarLock')}
                            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                        >
                            <Unlock size={14} />
                        </button>

                        {/* Close window */}
                        <button
                            type="button"
                            onClick={handleClose}
                            title={t('ui.close')}
                            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-red-500/80 active:scale-95 transition-all"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    /* Locked mode: only lock icon shown on hover to unlock, action buttons hidden */
                    <div
                        className={`flex items-center ml-2 transition-opacity duration-200 ${
                            isHovered ? 'opacity-100' : 'opacity-0'
                        }`}
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        onMouseEnter={() => {
                            void window.electron?.setMiniLyricBarMouseIgnore?.(false);
                        }}
                        onMouseLeave={() => {
                            if (isClickThrough) {
                                void window.electron?.setMiniLyricBarMouseIgnore?.(true);
                            }
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => handleToggleClickThrough(false)}
                            title={t('ui.miniLyricBarUnlock')}
                            className="p-1.5 rounded-lg text-amber-400 bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 shadow-md transition-all active:scale-95"
                        >
                            <Lock size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
