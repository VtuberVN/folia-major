import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Lock,
    Music,
    Pause,
    Play,
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
// High-performance Desktop Mini Lyric Bar.
// Runs in an independent transparent, frameless, always-on-top window.
// Uses direct DOM manipulation in requestAnimationFrame to decouple 60fps/144fps gradient animation
// from React component reconciliation, and soft slew drift correction to prevent 500ms IPC clock snapping.

export const clampProgress = (value: number) => Math.max(0, Math.min(100, value));

export interface MiniLyricDisplay {
    currentLine: Line | null;
    nextLine: Line | null;
}

export const resolveDisplayLines = (lyrics: LyricData | null | undefined, time: number): MiniLyricDisplay => {
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

export interface MiniLyricClockSyncState {
    currentTime: number;
    lastTrackKey: string | null;
    lastPlayerState: PlayerState;
    isInitialized: boolean;
}

export const calculateClockSyncOnSnapshot = (
    state: MiniLyricClockSyncState,
    snapshot: RemoteControlSnapshot,
    nowWallMs: number,
): number => {
    const rawTime = snapshot.currentTime;
    const offsetSec = (snapshot.lyricOffsetMs || 0) / 1000;
    const baseTime = rawTime - offsetSec;

    // Compensate for IPC / event-loop transit latency
    const transitLatencySec = (typeof snapshot.updatedAt === 'number' && snapshot.updatedAt > 0 && nowWallMs >= snapshot.updatedAt)
        ? Math.min(0.5, (nowWallMs - snapshot.updatedAt) / 1000)
        : 0;

    const targetTime = snapshot.playerState === PlayerState.PLAYING
        ? baseTime + transitLatencySec
        : baseTime;

    const isTrackChange = state.lastTrackKey !== snapshot.trackKey;
    const isStateChange = state.lastPlayerState !== snapshot.playerState;
    const drift = targetTime - state.currentTime;

    // Hard jump on init, track change, play/pause change, or user seek (|drift| > 0.35s)
    if (!state.isInitialized || isTrackChange || isStateChange || Math.abs(drift) > 0.35) {
        return targetTime;
    }

    // Soft slew during continuous playback: gently correct 15% of the drift per snapshot
    return state.currentTime + drift * 0.15;
};

export default function MiniLyricBarApp() {
    const { t } = useTranslation();
    const [snapshot, setSnapshot] = useState<RemoteControlSnapshot | null>(null);
    const [isClickThrough, setIsClickThrough] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // React state only updates when active lyric line changes (avoiding 60fps VDOM churn)
    const [display, setDisplay] = useState<MiniLyricDisplay>({ currentLine: null, nextLine: null });
    const displayRef = useRef<MiniLyricDisplay>(display);

    // Refs for continuous 60fps/144fps interpolation
    const latestSnapshotRef = useRef<RemoteControlSnapshot | null>(null);
    const currentTimeRef = useRef<number>(0);
    const lastTickTimeRef = useRef<number>(performance.now());
    const clockSyncStateRef = useRef<MiniLyricClockSyncState>({
        currentTime: 0,
        lastTrackKey: null,
        lastPlayerState: PlayerState.PAUSED,
        isInitialized: false,
    });

    // DOM node refs for direct GPU styling without React reconciliation
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const tokenNodesRef = useRef<(HTMLSpanElement | null)[]>([]);
    const singleLineNodeRef = useRef<HTMLSpanElement | null>(null);
    const tokenCentersRef = useRef<number[]>([]);
    const scrollMetricsRef = useRef({ containerWidth: 0, maxScroll: 0 });
    const targetScrollRef = useRef<number>(0);

    const currentLine = display.currentLine;

    // Tokens for current line
    const displayTokens = useMemo<MonetDisplayToken[]>(() => {
        if (!currentLine) return [];
        return buildMonetDisplayTokens({
            ...currentLine,
            words: currentLine.words || [],
        });
    }, [currentLine]);

    const displayTokensRef = useRef<MonetDisplayToken[]>(displayTokens);
    useEffect(() => {
        displayTokensRef.current = displayTokens;
        tokenNodesRef.current = [];
    }, [displayTokens]);

    useEffect(() => {
        displayRef.current = display;
    }, [display]);

    // Measure horizontal scroll bounding boxes
    const measureScrollTargets = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) {
            tokenCentersRef.current = [];
            scrollMetricsRef.current = { containerWidth: 0, maxScroll: 0 };
            return;
        }

        const containerWidth = container.clientWidth;
        const maxScroll = Math.max(0, container.scrollWidth - containerWidth);
        scrollMetricsRef.current = { containerWidth, maxScroll };
        tokenCentersRef.current = tokenNodesRef.current.map(child =>
            child ? child.offsetLeft + child.offsetWidth / 2 : 0
        );

        if (maxScroll <= 0) {
            container.scrollLeft = 0;
            targetScrollRef.current = 0;
        }
    }, []);

    useEffect(() => {
        measureScrollTargets();
        const handleResize = () => measureScrollTargets();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [measureScrollTargets, displayTokens]);

    // Direct DOM text gradient updates (runs on every rAF frame at 60fps/144fps)
    const updateLineProgress = useCallback((time: number) => {
        const line = displayRef.current.currentLine;
        if (!line) return;

        const tokens = displayTokensRef.current;
        if (tokens.length > 0) {
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                const node = tokenNodesRef.current[i];
                if (!node) continue;

                if (token.timed && token.startTime !== null && token.endTime !== null) {
                    const progress = token.endTime > token.startTime
                        ? clampProgress(((time - token.startTime) / (token.endTime - token.startTime)) * 100)
                        : (time >= token.startTime ? 100 : 0);
                    node.style.backgroundImage = `linear-gradient(to right, #38bdf8 ${progress}%, #f1f5f9 ${progress}%)`;
                } else {
                    // Delimiter token (space, punctuation): highlight if preceding word passed
                    let isPassed = false;
                    for (let j = i - 1; j >= 0; j--) {
                        const prev = tokens[j];
                        if (prev.timed && prev.endTime !== null) {
                            isPassed = time >= prev.endTime;
                            break;
                        }
                    }
                    node.style.color = isPassed ? '#38bdf8' : '#f1f5f9';
                }
            }
            return;
        }

        // Plain LRC fallback for single line
        if (singleLineNodeRef.current) {
            const duration = line.endTime > line.startTime ? line.endTime - line.startTime : 3.5;
            const progress = clampProgress(((time - line.startTime) / duration) * 100);
            singleLineNodeRef.current.style.backgroundImage = `linear-gradient(to right, #38bdf8 ${progress}%, #f1f5f9 ${progress}%)`;
        }
    }, []);

    // Smooth horizontal autoscroll centering the currently sung word
    const updateScroll = useCallback((time: number) => {
        const container = scrollContainerRef.current;
        const line = displayRef.current.currentLine;
        const { containerWidth, maxScroll } = scrollMetricsRef.current;
        if (!container || !line || maxScroll <= 0) {
            if (container && container.scrollLeft !== 0) {
                container.scrollLeft = 0;
            }
            return;
        }

        let targetScroll = 0;
        const tokens = displayTokensRef.current;
        if (tokens.length > 0) {
            const activeIdx = tokens.findIndex(t => t.timed && t.startTime !== null && t.endTime !== null && time >= t.startTime && time <= t.endTime);
            if (activeIdx !== -1) {
                targetScroll = (tokenCentersRef.current[activeIdx] ?? 0) - containerWidth / 2;
            } else {
                const lastTimed = [...tokens].reverse().find(t => t.timed && t.endTime !== null);
                if (lastTimed && lastTimed.endTime !== null && time >= lastTimed.endTime) {
                    targetScroll = maxScroll;
                } else {
                    const firstTimed = tokens.find(t => t.timed && t.startTime !== null);
                    if (firstTimed && firstTimed.startTime !== null && time < firstTimed.startTime) {
                        targetScroll = 0;
                    }
                }
            }
        } else if (line.endTime > line.startTime && time >= line.startTime) {
            targetScroll = ((time - line.startTime) / (line.endTime - line.startTime)) * maxScroll;
        }

        const bounded = Math.max(0, Math.min(maxScroll, targetScroll));
        targetScrollRef.current = bounded;

        const diff = bounded - container.scrollLeft;
        if (Math.abs(diff) > 0.2) {
            container.scrollLeft += diff * 0.14;
        } else {
            container.scrollLeft = bounded;
        }
    }, []);

    // Line switcher: only updates React state when line index actually changes
    const updateDisplay = useCallback((time: number) => {
        const lyrics = latestSnapshotRef.current?.lyrics;
        const nextDisplay = resolveDisplayLines(lyrics, time);
        const prev = displayRef.current;

        if (
            prev.currentLine !== nextDisplay.currentLine ||
            prev.nextLine !== nextDisplay.nextLine
        ) {
            displayRef.current = nextDisplay;
            setDisplay(nextDisplay);
            requestAnimationFrame(() => {
                measureScrollTargets();
                updateLineProgress(time);
            });
        }
    }, [measureScrollTargets, updateLineProgress]);

    // Apply snapshot with soft drift slew
    const applySnapshot = useCallback((next: unknown) => {
        if (!next) return;
        const nextSnapshot = next as unknown as RemoteControlSnapshot;
        latestSnapshotRef.current = nextSnapshot;

        const syncState = clockSyncStateRef.current;
        const nextTime = calculateClockSyncOnSnapshot(syncState, nextSnapshot, Date.now());

        currentTimeRef.current = nextTime;
        syncState.currentTime = nextTime;
        syncState.lastTrackKey = nextSnapshot.trackKey;
        syncState.lastPlayerState = nextSnapshot.playerState;
        syncState.isInitialized = true;

        setSnapshot(prev => {
            const rawNext = next as { lyrics?: unknown };
            const hasLyricsProp = Object.prototype.hasOwnProperty.call(rawNext, 'lyrics');
            const hasMetaChange = !prev ||
                prev.trackKey !== nextSnapshot.trackKey ||
                prev.playerState !== nextSnapshot.playerState ||
                prev.title !== nextSnapshot.title ||
                prev.artist !== nextSnapshot.artist ||
                prev.coverUrl !== nextSnapshot.coverUrl ||
                prev.duration !== nextSnapshot.duration ||
                (hasLyricsProp && rawNext.lyrics !== prev.lyrics);

            if (!hasMetaChange) {
                return prev;
            }

            return {
                ...(prev || {}),
                ...nextSnapshot,
                lyrics: hasLyricsProp
                    ? (rawNext.lyrics as LyricData | null) ?? null
                    : prev?.lyrics ?? null,
            } as RemoteControlSnapshot;
        });
    }, []);

    // Subscribe to IPC snapshot and click-through updates
    useEffect(() => {
        const electron = window.electron;
        if (!electron) return;

        let active = true;

        void electron.getMiniLyricBarState?.().then(state => {
            if (!active || !state) return;
            setIsClickThrough(Boolean(state.clickThrough));
            if (state.snapshot) {
                applySnapshot(state.snapshot);
            }
        });

        const unsubsSnapshot = electron.onMiniLyricBarSnapshot?.(next => {
            if (!active) return;
            applySnapshot(next);
        });

        const unsubsClickThrough = electron.onMiniLyricBarClickThroughChanged?.(enabled => {
            if (active) setIsClickThrough(enabled);
        });

        return () => {
            active = false;
            unsubsSnapshot?.();
            unsubsClickThrough?.();
        };
    }, [applySnapshot]);

    // Silky smooth rAF animation loop running at native display refresh rate
    useEffect(() => {
        let frameId: number | null = null;
        lastTickTimeRef.current = performance.now();

        const tick = (now: number) => {
            const dt = Math.min(0.1, (now - lastTickTimeRef.current) / 1000);
            lastTickTimeRef.current = now;

            const currentSnapshot = latestSnapshotRef.current;
            const isPlaying = currentSnapshot?.playerState === PlayerState.PLAYING;

            if (isPlaying) {
                const duration = currentSnapshot?.duration || Number.POSITIVE_INFINITY;
                currentTimeRef.current = Math.min(duration, currentTimeRef.current + dt);
                clockSyncStateRef.current.currentTime = currentTimeRef.current;
            }

            const lyricTime = currentTimeRef.current;
            updateDisplay(lyricTime);
            updateLineProgress(lyricTime);
            updateScroll(lyricTime);

            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);
        return () => {
            if (frameId !== null) cancelAnimationFrame(frameId);
        };
    }, [updateDisplay, updateLineProgress, updateScroll]);

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
                            {/* Primary lyric line with word-level or line progress fill and smooth autoscroll */}
                            <div
                                ref={scrollContainerRef}
                                className="text-sm sm:text-base font-bold tracking-wide overflow-x-hidden whitespace-nowrap text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] leading-tight select-none"
                            >
                                {displayTokens.length > 0 ? (
                                    displayTokens.map((token, idx) => (
                                        <span
                                            key={token.key}
                                            ref={el => { tokenNodesRef.current[idx] = el; }}
                                            className="inline-block whitespace-pre select-none"
                                            style={token.timed && token.startTime !== null && token.endTime !== null ? {
                                                backgroundImage: 'linear-gradient(to right, #38bdf8 0%, #f1f5f9 0%)',
                                                WebkitBackgroundClip: 'text',
                                                WebkitTextFillColor: 'transparent',
                                                willChange: 'background-image',
                                            } : {
                                                color: '#f1f5f9',
                                            }}
                                        >
                                            {token.text}
                                        </span>
                                    ))
                                ) : (
                                    <span
                                        ref={singleLineNodeRef}
                                        className="inline-block whitespace-pre select-none"
                                        style={{
                                            backgroundImage: 'linear-gradient(to right, #38bdf8 0%, #f1f5f9 0%)',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            willChange: 'background-image',
                                        }}
                                    >
                                        {currentLine.fullText}
                                    </span>
                                )}
                            </div>

                            {/* Secondary translation or romanization subtitle */}
                            {secondaryText && (
                                <div className="text-[11px] text-white/70 font-medium truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-0.5 select-none">
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
