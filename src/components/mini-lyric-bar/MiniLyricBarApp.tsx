import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, motionValue, useTransform, type MotionValue } from 'framer-motion';
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
// Uses Framer Motion MotionValue pipeline for compositor-thread text sweep rendering,
// continuous monotonic rate governor, dynamic responsive album art,
// and floating overlay toolbar so no lyrics are ever cut off.

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
    playbackRate: number;
    lastTrackKey: string | null;
    lastPlayerState: PlayerState;
    isInitialized: boolean;
}

export const calculateClockSyncOnSnapshot = (
    state: MiniLyricClockSyncState,
    snapshot: RemoteControlSnapshot,
    nowWallMs: number,
): { nextTime: number; nextPlaybackRate: number } => {
    const rawTime = snapshot.currentTime;
    const offsetSec = (snapshot.lyricOffsetMs || 0) / 1000;
    const baseTime = rawTime - offsetSec;

    // Compensate for transit latency across IPC
    const transitLatencySec = (typeof snapshot.updatedAt === 'number' && snapshot.updatedAt > 0 && nowWallMs >= snapshot.updatedAt)
        ? Math.min(0.5, (nowWallMs - snapshot.updatedAt) / 1000)
        : 0;

    const targetTime = snapshot.playerState === PlayerState.PLAYING
        ? baseTime + transitLatencySec
        : baseTime;

    const isTrackChange = state.lastTrackKey !== snapshot.trackKey;
    const isStateChange = state.lastPlayerState !== snapshot.playerState;
    const drift = targetTime - state.currentTime;

    // Hard snap on init, track change, pause/play toggle, or user seek (|drift| > 0.4s)
    if (!state.isInitialized || isTrackChange || isStateChange || Math.abs(drift) > 0.4) {
        return {
            nextTime: targetTime,
            nextPlaybackRate: 1.0,
        };
    }

    // Monotonic soft governor: if actively playing and drift is small,
    // adjust clock rate by ±5% to seamlessly eliminate drift without ANY retrograde jumping!
    const rateDelta = (drift / 0.5) * 0.5;
    const nextRate = Math.max(0.92, Math.min(1.08, 1.0 + rateDelta));

    return {
        nextTime: state.currentTime,
        nextPlaybackRate: nextRate,
    };
};

// ─── Compositor-thread word sweep via Framer Motion MotionValue pipeline ───────
// Each timed word creates its own useTransform subscriber chain.
// MotionValue.set() → subscriber runs transform → sets DOM style directly.
// Zero React re-renders per frame. Same architecture as MonetRailTokens.tsx.

const MiniWordSweep: React.FC<{
    text: string;
    startTime: number;
    endTime: number;
    lyricTime: MotionValue<number>;
    nodeRef?: (el: HTMLSpanElement | null) => void;
}> = ({ text, startTime, endTime, lyricTime, nodeRef }) => {
    const clipPath = useTransform(lyricTime, (latest: number) => {
        if (latest <= startTime) return 'inset(0 100% 0 0)';
        if (latest >= endTime) return 'inset(0 0% 0 0)';
        const progress = (latest - startTime) / Math.max(0.001, endTime - startTime);
        return `inset(0 ${(1 - progress) * 100}% 0 0)`;
    });

    return (
        <span
            ref={nodeRef}
            className="relative inline-block whitespace-pre select-none"
        >
            {/* Inactive base text */}
            <span className="text-white/60 select-none">{text}</span>
            {/* Active highlighted text overlay — clipPath driven by MotionValue on compositor thread */}
            <motion.span
                aria-hidden
                className="absolute inset-0 overflow-hidden text-sky-400 select-none pointer-events-none drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                style={{ clipPath }}
            >
                <span className="inline-block whitespace-pre select-none">{text}</span>
            </motion.span>
        </span>
    );
};

const MiniDelimiterToken: React.FC<{
    text: string;
    precedingEndTime: number | null;
    lyricTime: MotionValue<number>;
    nodeRef?: (el: HTMLSpanElement | null) => void;
}> = ({ text, precedingEndTime, lyricTime, nodeRef }) => {
    const color = useTransform(lyricTime, (latest: number) => {
        if (precedingEndTime !== null && latest >= precedingEndTime) return '#38bdf8';
        return 'rgba(255, 255, 255, 0.6)';
    });

    return (
        <motion.span
            ref={nodeRef}
            className="inline-block whitespace-pre select-none"
            style={{ color }}
        >
            {text}
        </motion.span>
    );
};

const MiniSingleLineSweep: React.FC<{
    text: string;
    startTime: number;
    endTime: number;
    lyricTime: MotionValue<number>;
}> = ({ text, startTime, endTime, lyricTime }) => {
    const duration = endTime > startTime ? endTime - startTime : 3.5;

    const clipPath = useTransform(lyricTime, (latest: number) => {
        const progress = Math.max(0, Math.min(100, ((latest - startTime) / duration) * 100));
        return `inset(0 ${100 - progress}% 0 0)`;
    });

    return (
        <span className="relative inline-block whitespace-pre select-none">
            <span className="text-white/60 select-none">{text}</span>
            <motion.span
                aria-hidden
                className="absolute inset-0 overflow-hidden text-sky-400 select-none pointer-events-none drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                style={{ clipPath }}
            >
                <span className="inline-block whitespace-pre select-none">{text}</span>
            </motion.span>
        </span>
    );
};


export default function MiniLyricBarApp() {
    const { t } = useTranslation();
    const [snapshot, setSnapshot] = useState<RemoteControlSnapshot | null>(null);
    const [isClickThrough, setIsClickThrough] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // React state only updates when active lyric line changes (avoiding 60fps VDOM churn)
    const [display, setDisplay] = useState<MiniLyricDisplay>({ currentLine: null, nextLine: null });
    const displayRef = useRef<MiniLyricDisplay>(display);

    // Refs for continuous monotonic 60fps/144fps interpolation
    const latestSnapshotRef = useRef<RemoteControlSnapshot | null>(null);
    const currentTimeRef = useRef<number>(0);
    const playbackRateRef = useRef<number>(1.0);
    const lastTickTimeRef = useRef<number>(performance.now());
    const clockSyncStateRef = useRef<MiniLyricClockSyncState>({
        currentTime: 0,
        playbackRate: 1.0,
        lastTrackKey: null,
        lastPlayerState: PlayerState.PAUSED,
        isInitialized: false,
    });

    // Framer Motion MotionValue — the single source of truth for lyric time.
    // rAF loop sets this once per frame; all MiniWordSweep/MiniDelimiterToken
    // components subscribe via useTransform → DOM updates bypass React entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const lyricTime = useMemo(() => motionValue(0), []);

    // DOM node refs for scroll measurement (NOT for style mutation)
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const wordWrapperNodesRef = useRef<(HTMLSpanElement | null)[]>([]);
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
        wordWrapperNodesRef.current = [];
    }, [displayTokens]);

    useEffect(() => {
        displayRef.current = display;
    }, [display]);

    // Measure horizontal scroll bounding boxes
    const measureScrollTargets = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) {
            scrollMetricsRef.current = { containerWidth: 0, maxScroll: 0 };
            return;
        }

        const containerWidth = container.clientWidth;
        const maxScroll = Math.max(0, container.scrollWidth - containerWidth);
        scrollMetricsRef.current = { containerWidth, maxScroll };

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

    // NOTE: updateLineProgress has been REMOVED.
    // All per-frame text sweep rendering is now handled by Framer Motion MotionValue
    // pipeline in MiniWordSweep / MiniDelimiterToken / MiniSingleLineSweep components.
    // The rAF loop only needs to call lyricTime.set() once per frame.

    // Smooth focal-point horizontal autoscroll (tracks current singing word across long sentences)
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
        const timedTokens = tokens.filter(t => t.timed && t.startTime !== null && t.endTime !== null);

        if (timedTokens.length > 1) {
            // Multi-word line: track active singing word focal point
            const activeIdx = tokens.findIndex(t => t.timed && t.startTime !== null && t.endTime !== null && time >= t.startTime && time <= t.endTime);
            if (activeIdx !== -1) {
                const token = tokens[activeIdx];
                const node = wordWrapperNodesRef.current[activeIdx];
                if (node && token.startTime !== null && token.endTime !== null) {
                    const wordProgress = clampProgress(((time - token.startTime) / Math.max(0.001, token.endTime - token.startTime)) * 100) / 100;
                    const focalX = node.offsetLeft + wordProgress * node.offsetWidth;
                    targetScroll = focalX - containerWidth * 0.35;
                }
            } else {
                // Past end of line
                const lastTimed = timedTokens[timedTokens.length - 1];
                if (lastTimed && lastTimed.endTime !== null && time >= lastTimed.endTime) {
                    targetScroll = maxScroll;
                } else {
                    const firstTimed = timedTokens[0];
                    if (firstTimed && firstTimed.startTime !== null && time < firstTimed.startTime) {
                        targetScroll = 0;
                    } else {
                        // In-between words: keep preceding word in view
                        const nextIdx = tokens.findIndex(t => t.timed && t.startTime !== null && time < t.startTime);
                        if (nextIdx > 0) {
                            const prevNode = wordWrapperNodesRef.current[nextIdx - 1];
                            if (prevNode) {
                                targetScroll = prevNode.offsetLeft + prevNode.offsetWidth - containerWidth * 0.35;
                            }
                        }
                    }
                }
            }
        } else {
            // Plain LRC line (or single token): scroll proportionally from 0 to maxScroll
            const duration = line.endTime > line.startTime ? line.endTime - line.startTime : 3.5;
            const lineProgress = clampProgress(((time - line.startTime) / duration) * 100) / 100;
            const focalX = lineProgress * (containerWidth + maxScroll);
            targetScroll = focalX - containerWidth * 0.35;
        }

        const bounded = Math.max(0, Math.min(maxScroll, targetScroll));
        targetScrollRef.current = bounded;

        const diff = bounded - container.scrollLeft;
        if (Math.abs(diff) > 0.2) {
            container.scrollLeft += diff * 0.12;
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
            });
        }
    }, [measureScrollTargets]);

    // Apply snapshot with monotonic clock governor
    const applySnapshot = useCallback((next: unknown) => {
        if (!next) return;
        const nextSnapshot = next as unknown as RemoteControlSnapshot;
        latestSnapshotRef.current = nextSnapshot;

        const syncState = clockSyncStateRef.current;
        const { nextTime, nextPlaybackRate } = calculateClockSyncOnSnapshot(syncState, nextSnapshot, Date.now());

        currentTimeRef.current = nextTime;
        playbackRateRef.current = nextPlaybackRate;
        syncState.currentTime = nextTime;
        syncState.playbackRate = nextPlaybackRate;
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

    // Handle mouse movement to un-ignore mouse events over interactive controls in click-through mode
    useEffect(() => {
        const handleWindowMouseMove = (e: MouseEvent) => {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const isInteractive = Boolean(
                target && (
                    target.closest('[data-mini-interactive]') ||
                    target.closest('button') ||
                    target.closest('[role="button"]')
                )
            );
            if (isInteractive) {
                void window.electron?.setMiniLyricBarMouseIgnore?.(false);
                setIsHovered(true);
            } else if (isClickThrough) {
                void window.electron?.setMiniLyricBarMouseIgnore?.(true);
                setIsHovered(false);
            }
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        return () => window.removeEventListener('mousemove', handleWindowMouseMove);
    }, [isClickThrough]);

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
                // Gently relax adaptive playback rate back to 1.0
                const currentRate = playbackRateRef.current;
                playbackRateRef.current += (1.0 - currentRate) * 0.02;

                const duration = currentSnapshot?.duration || Number.POSITIVE_INFINITY;
                // Strict monotonic advancement: dt * rate > 0 always!
                currentTimeRef.current = Math.min(duration, currentTimeRef.current + dt * playbackRateRef.current);
                clockSyncStateRef.current.currentTime = currentTimeRef.current;
            }

            const time = currentTimeRef.current;

            // Drive the Framer Motion MotionValue — this single .set() call
            // propagates to ALL useTransform subscribers in MiniWordSweep,
            // MiniDelimiterToken, and MiniSingleLineSweep components.
            // They update DOM styles directly, bypassing React VDOM entirely.
            lyricTime.set(time);

            updateDisplay(time);
            updateScroll(time);

            frameId = requestAnimationFrame(tick);
        };

        frameId = requestAnimationFrame(tick);
        return () => {
            if (frameId !== null) cancelAnimationFrame(frameId);
        };
    }, [lyricTime, updateDisplay, updateScroll]);

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
                className={`relative w-full h-full flex items-center px-3 py-1.5 rounded-2xl ${
                    isClickThrough
                        ? 'bg-black/40 backdrop-blur-md border border-white/10 shadow-lg'
                        : isHovered
                            ? 'bg-neutral-900/95 backdrop-blur-2xl border border-white/20 shadow-2xl ring-1 ring-white/10'
                            : 'bg-neutral-900/80 backdrop-blur-xl border border-white/15 shadow-xl'
                }`}
                style={{
                    WebkitAppRegion: isClickThrough ? 'no-drag' : 'drag',
                    cursor: isClickThrough ? 'default' : 'move',
                } as React.CSSProperties}
            >
                {/* Left: Dynamic responsive Album cover that grows with window height */}
                <div
                    className="flex-shrink-0 flex items-center justify-center h-full aspect-square max-h-[84px] min-h-[36px] min-w-[36px] rounded-xl overflow-hidden bg-white/10 border border-white/10 shadow-md mr-2.5 select-none"
                    style={{ WebkitAppRegion: isClickThrough ? 'no-drag' : 'drag' } as React.CSSProperties}
                >
                    {snapshot?.coverUrl ? (
                        <img
                            src={snapshot.coverUrl}
                            alt=""
                            className="w-full h-full object-cover select-none pointer-events-none rounded-xl"
                            draggable={false}
                        />
                    ) : (
                        <Music className="w-1/2 h-1/2 text-white/60 animate-pulse" />
                    )}
                </div>

                {/* Left: Integrated Controls toolbar directly in the main bar */}
                <div
                    data-mini-interactive="true"
                    className="flex-shrink-0 flex items-center space-x-0.5 mr-3 select-none"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    {!isClickThrough ? (
                        <>
                            {/* Previous track */}
                            <button
                                type="button"
                                data-mini-interactive="true"
                                onClick={() => handleCommand({ type: 'previous' })}
                                title={t('ui.previousTrack')}
                                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 active:scale-95 transition-colors cursor-pointer"
                            >
                                <SkipBack size={15} />
                            </button>

                            {/* Play / Pause */}
                            <button
                                type="button"
                                data-mini-interactive="true"
                                onClick={() => handleCommand({ type: 'play-pause' })}
                                title={isPlaying ? t('ui.pause') : t('ui.play')}
                                className="p-1.5 rounded-lg text-white bg-white/20 hover:bg-white/30 active:scale-95 transition-colors shadow-sm cursor-pointer"
                            >
                                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                            </button>

                            {/* Next track */}
                            <button
                                type="button"
                                data-mini-interactive="true"
                                onClick={() => handleCommand({ type: 'next' })}
                                title={t('ui.nextTrack')}
                                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 active:scale-95 transition-colors cursor-pointer"
                            >
                                <SkipForward size={15} />
                            </button>

                            {/* Lock Click-Through Toggle */}
                            <button
                                type="button"
                                data-mini-interactive="true"
                                onClick={() => handleToggleClickThrough(true)}
                                title={t('ui.miniLyricBarLock')}
                                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 active:scale-95 transition-colors cursor-pointer"
                            >
                                <Unlock size={15} />
                            </button>

                            {/* Close window */}
                            <button
                                type="button"
                                data-mini-interactive="true"
                                onClick={handleClose}
                                title={t('ui.close')}
                                className="p-1.5 rounded-lg text-white/70 hover:text-red-400 hover:bg-red-500/20 active:scale-95 transition-colors cursor-pointer"
                            >
                                <X size={15} />
                            </button>
                        </>
                    ) : (
                        /* Locked mode: ALWAYS VISIBLE interactive unlock icon with amber accent */
                        <button
                            type="button"
                            data-mini-interactive="true"
                            onClick={() => handleToggleClickThrough(false)}
                            title={t('ui.miniLyricBarUnlock', 'Nhấp để mở khóa / di chuyển thanh lời')}
                            aria-label={t('ui.miniLyricBarUnlock', 'Nhấp để mở khóa / di chuyển thanh lời')}
                            className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/25 border border-amber-400/40 shadow-sm transition-colors active:scale-95 cursor-pointer"
                        >
                            <Lock size={15} />
                        </button>
                    )}
                </div>

                {/* Center & Right: Synced Lyrics display (occupies remaining width cleanly) */}
                <div
                    className="flex-1 min-w-0 flex flex-col justify-center overflow-hidden pr-2"
                    style={{ WebkitAppRegion: isClickThrough ? 'no-drag' : 'drag' } as React.CSSProperties}
                >
                    {currentLine ? (
                        <div className="flex flex-col justify-center">
                            {/* Primary lyric line with two-layer GPU text clipping and focal-point autoscroll */}
                            <div
                                ref={scrollContainerRef}
                                className="text-sm sm:text-base md:text-lg font-bold tracking-wide overflow-x-hidden whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] leading-tight select-none"
                            >
                                {displayTokens.length > 0 ? (
                                    displayTokens.map((token, idx) => {
                                        if (token.timed && token.startTime !== null && token.endTime !== null) {
                                            return (
                                                <MiniWordSweep
                                                    key={token.key}
                                                    text={token.text}
                                                    startTime={token.startTime}
                                                    endTime={token.endTime}
                                                    lyricTime={lyricTime}
                                                    nodeRef={el => { wordWrapperNodesRef.current[idx] = el; }}
                                                />
                                            );
                                        }

                                        // Delimiter token: find preceding timed word's endTime
                                        let precedingEndTime: number | null = null;
                                        for (let j = idx - 1; j >= 0; j--) {
                                            const prev = displayTokens[j];
                                            if (prev.timed && prev.endTime !== null) {
                                                precedingEndTime = prev.endTime;
                                                break;
                                            }
                                        }

                                        return (
                                            <MiniDelimiterToken
                                                key={token.key}
                                                text={token.text}
                                                precedingEndTime={precedingEndTime}
                                                lyricTime={lyricTime}
                                                nodeRef={el => { wordWrapperNodesRef.current[idx] = el; }}
                                            />
                                        );
                                    })
                                ) : (
                                    <MiniSingleLineSweep
                                        text={currentLine.fullText}
                                        startTime={currentLine.startTime}
                                        endTime={currentLine.endTime}
                                        lyricTime={lyricTime}
                                    />
                                )}
                            </div>

                            {/* Secondary translation or romanization subtitle */}
                            {secondaryText && (
                                <div className="text-[11px] sm:text-xs text-white/70 font-medium truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] mt-0.5 select-none">
                                    {secondaryText}
                                </div>
                            )}
                        </div>
                    ) : snapshot?.hasTrack ? (
                        <div className="flex flex-col justify-center">
                            <span className="text-sm sm:text-base font-semibold text-white/90 truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                                {snapshot.title || t('ui.waitingForMusic')}
                            </span>
                            <span className="text-[11px] sm:text-xs text-white/50 truncate">
                                {snapshot.artist || 'Folia Major'}
                            </span>
                        </div>
                    ) : (
                        <div className="text-xs sm:text-sm text-white/50 font-medium tracking-wide truncate">
                            {t('ui.noTrack', 'Folia Major')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
