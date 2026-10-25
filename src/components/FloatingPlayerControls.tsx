import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Pause } from 'lucide-react';
import { MotionValue } from 'framer-motion';
import ProgressBar from './ProgressBar';
import { PlayerState, LyricData, Theme } from '../types';
import LyricsTimelineModal from './modal/LyricsTimelineModal';
import QuickLyricsListDrawer from './floating-player/QuickLyricsListDrawer';
import TrackTitleNavigator from './floating-player/TrackTitleNavigator';
import PlayerControlSlotButton from './floating-player/PlayerControlSlotButton';
import PlayerBottomBarPositioner from './floating-player/PlayerBottomBarPositioner';
import AudioQualityBadge from './floating-player/AudioQualityBadge';
import type { AudioQualityInfo } from '../types/audioQuality';
import { usePlayerBottomBarBottomPx } from '../hooks/usePlayerBottomBarBottomPx';
import { playerBottomBarLiveOffset } from '../stores/motionSignals';
import { usePlayerBottomBarLayoutStore } from '../stores/usePlayerBottomBarLayoutStore';
import { usePlayerChromeSettingsStore } from '../stores/usePlayerChromeSettingsStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, clampPlayerBottomBarOffset, resolvePlayerBottomBarMaxOffset } from '../utils/playerBottomBarLayout';
import type { PlayerControlSlotActionId, PlayerControlSlotContext } from './floating-player/playerControlSlotActions';
import { useGlass } from '../mods/useGlass';
import SignalPath from './audio/SignalPath';
import { usePlayerOverlayObstacle } from '../hooks/usePlayerOverlayLayout';
import { resolveLyricSeekMediaTime } from '../utils/lyrics/lyricSeekTime';

export interface TrackNavigation {
    /** Stable identity for the current track to detect genuine song changes */
    currentTrackKey: string;
    onPrev: () => void;
    onNext: () => void;
    canPrev: boolean;
    canNext: boolean;
    prevTitle: string | null;
    nextTitle: string | null;
    prevLabel: string;
    nextLabel: string;
}

const CONTROL_LAYOUT_SPRING = {
    type: 'spring' as const,
    stiffness: 280,
    damping: 24,
};

const HOVER_EXPAND_DELAY_MS = 20;
const HOVER_COLLAPSE_DELAY_MS = 100;
const HOVER_HITBOX_BOTTOM_BUFFER_PX = 32;
/*
 * Mods can widen the capsule via the public variable --folium-player-bar-extra.
 * The outer max-width adds the extra; the collapsed capsule width is scaled accordingly.
 */
const COLLAPSED_WIDTH_CLASS = 'w-[min(100%,calc(80%_+_var(--folium-player-bar-extra,0px)_*_0.2))] md:w-[min(100%,calc(60%_+_var(--folium-player-bar-extra,0px)_*_0.4))]';

/**
 * Context provided by App for custom slots. Internal capsule capabilities
 * like loop mode and timeline modal are fulfilled internally.
 */
export type SlotContextFromApp = Omit<
    PlayerControlSlotContext,
    'loopMode' | 'onToggleLoop' | 'onToggleTimeline' | 'hasLyrics' | 'canPrev' | 'canNext' | 'onPrev' | 'onNext'
>;

interface FloatingPlayerControlsProps {
    currentSong: { name: string; audioQualityInfo?: AudioQualityInfo; } | null;
    playerState: PlayerState;
    currentTime: MotionValue<number>;
    lyricCurrentTime?: MotionValue<number>;
    duration: number;
    loopMode: 'off' | 'all' | 'one';
    currentView: 'home' | 'player' | 'lattice';
    audioSrc: string | null;
    canTogglePlay?: boolean;
    lyrics: LyricData | null;
    onSeek: (time: number) => void;
    onTogglePlay: () => void;
    onToggleLoop: () => void;
    onNavigateToPlayer: () => void;
    onFocusLatticeCurrentSong?: () => void;
    noTrackText?: string;
    primaryColor?: string;
    secondaryColor?: string;
    theme?: Theme;
    isDaylight: boolean;
    isHidden?: boolean;
    hideControlBar?: boolean;
    controlsDisabled?: boolean;
    trackNavigation?: TrackNavigation | null;
    /** Slot action IDs for the two custom slots on the right. */
    slotPrimary: PlayerControlSlotActionId;
    slotSecondary: PlayerControlSlotActionId;
    /** Shared playback context for slots, augmented internally with capsule actions. */
    slotContext: SlotContextFromApp;
    /** Commit positioning offset; persisted by App to settings. */
    onCommitBottomBarOffset: (offsetPx: number) => void;
}


const FloatingPlayerControls: React.FC<FloatingPlayerControlsProps> = ({
    currentSong,
    playerState,
    currentTime,
    lyricCurrentTime,
    duration,
    loopMode,
    currentView,
    audioSrc,
    canTogglePlay = false,
    lyrics,
    onSeek,
    onTogglePlay,
    onToggleLoop,
    onNavigateToPlayer,
    onFocusLatticeCurrentSong,
    noTrackText = 'No Track',
    primaryColor = 'var(--text-primary)',
    secondaryColor = 'var(--text-secondary)',
    theme,
    isDaylight,
    isHidden = false,
    hideControlBar = false,
    controlsDisabled = false,
    trackNavigation = null,
    slotPrimary,
    slotSecondary,
    slotContext,
    onCommitBottomBarOffset,
}) => {
    useGlass();
    const { t } = useTranslation();
    const { ref: layoutRef, invalidate: invalidateLayout } = usePlayerOverlayObstacle('player-controls', 'playback', !isHidden);
    // const isDaylight = theme?.name === 'Daylight Default'; // Deprecated, passed as prop
    const glassBgExpanded = isDaylight ? 'bg-white/60 border border-white/20 shadow-xl' : 'bg-black/40 border border-white/5';
    const glassBgCollapsed = isDaylight ? 'bg-white/40 border border-white/20 shadow-lg hover:bg-white/50' : 'bg-black/20 border border-white/5 hover:bg-black/30';
    const trackColor = isDaylight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)';

    const [isHovered, setIsHovered] = useState(false);
    const [isTimelineOpen, setIsTimelineOpen] = useState(false);
    const [isLyricsListOpen, setIsLyricsListOpen] = useState(false);
    const expandTimeoutRef = useRef<number | null>(null);
    const collapseTimeoutRef = useRef<number | null>(null);

    const showAudioSignalPath = useAudioSettingsStore(state => state.showAudioSignalPath);
    const [isSignalPathOpen, setIsSignalPathOpen] = useState(false);
    const signalPathOpenRef = useRef(false);
    const handleSignalPathOpen = useCallback((open: boolean) => {
        signalPathOpenRef.current = open;
        setIsSignalPathOpen(open);
        if (open) {
            if (expandTimeoutRef.current !== null) window.clearTimeout(expandTimeoutRef.current);
            if (collapseTimeoutRef.current !== null) window.clearTimeout(collapseTimeoutRef.current);
            expandTimeoutRef.current = collapseTimeoutRef.current = null;
        }
    }, []);

    const bottomBarBottomPx = usePlayerBottomBarBottomPx();
    const isPositioning = usePlayerBottomBarLayoutStore(state => state.isPositioning);
    const commitPositioning = usePlayerBottomBarLayoutStore(state => state.commitPositioning);
    const cancelPositioning = usePlayerBottomBarLayoutStore(state => state.cancelPositioning);
    // Drag starting point: pointer Y and initial offset on pointer down, used to calculate relative movement.
    const dragOriginRef = useRef<{ pointerY: number; offset: number; } | null>(null);
    const [maxOffsetPx, setMaxOffsetPx] = useState(() => (
        typeof window === 'undefined'
            ? PLAYER_BOTTOM_BAR_BASE_OFFSET_PX
            : resolvePlayerBottomBarMaxOffset(window.innerHeight)
    ));

    const canAutoExpand = canTogglePlay && duration > 0;
    // Positioning mode forces expansion: user needs to preview the final expanded capsule rather than a slim bar.
    const showExpanded = isPositioning || isHovered || (canAutoExpand && playerState !== PlayerState.PLAYING && currentView !== 'home');

    // The upper bound depends on viewport height; adjust when the window shrinks to avoid clipping.
    useEffect(() => {
        if (!isPositioning) {
            return;
        }

        const syncMax = () => setMaxOffsetPx(resolvePlayerBottomBarMaxOffset(window.innerHeight));
        syncMax();
        window.addEventListener('resize', syncMax);
        return () => window.removeEventListener('resize', syncMax);
    }, [isPositioning]);

    const handlePositionDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!isPositioning) {
            return;
        }
        dragOriginRef.current = { pointerY: e.clientY, offset: playerBottomBarLiveOffset.get() };
        e.currentTarget.setPointerCapture(e.pointerId);
    }, [isPositioning]);

    const handlePositionDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const origin = dragOriginRef.current;
        if (!origin) {
            return;
        }
        // Write to MotionValue directly without triggering React re-renders on high-frequency pointer moves.
        // Moving pointer upward decreases clientY, increasing the offset: origin.pointerY - e.clientY.
        playerBottomBarLiveOffset.set(clampPlayerBottomBarOffset(
            origin.offset + (origin.pointerY - e.clientY),
            window.innerHeight,
        ));
    }, []);

    const handlePositionDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragOriginRef.current) {
            return;
        }
        dragOriginRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    }, []);

    // Positioning mode only applies to the control bar on the player view.
    // Leaving the player view or hiding the bar clears the positioning state.
    useEffect(() => {
        if (isPositioning && (currentView !== 'player' || hideControlBar)) {
            cancelPositioning();
        }
    }, [cancelPositioning, currentView, hideControlBar, isPositioning]);

    // Unmount fallback: clearing current song unmounts the bar, so clean up positioning state via getState.
    const isPositioningRef = useRef(isPositioning);
    isPositioningRef.current = isPositioning;
    useEffect(() => () => {
        if (isPositioningRef.current) {
            usePlayerBottomBarLayoutStore.getState().cancelPositioning();
        }
    }, []);

    const handleCommitPositioning = useCallback(() => {
        onCommitBottomBarOffset(commitPositioning());
    }, [commitPositioning, onCommitBottomBarOffset]);

    // Esc cancels positioning, Enter confirms. A keyboard exit is required for accessibility.
    useEffect(() => {
        if (!isPositioning) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                cancelPositioning();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                handleCommitPositioning();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [cancelPositioning, handleCommitPositioning, isPositioning]);

    // Hitbox buffer converges as the bar is lifted from the bottom edge to avoid dead zones.
    // Uses saved setting instead of live dragging MotionValue to prevent re-renders on layout calculation.
    const savedBottomBarOffset = usePlayerChromeSettingsStore(state => state.playerBottomBarOffset);
    const hoverHitboxBufferPx = Math.max(
        0,
        Math.round(HOVER_HITBOX_BOTTOM_BUFFER_PX - (savedBottomBarOffset - PLAYER_BOTTOM_BAR_BASE_OFFSET_PX)),
    );

    // Slot context: combines caller props with capsule loop mode, lyrics actions, and navigation.
    const resolvedSlotContext = useMemo<PlayerControlSlotContext>(() => ({
        ...slotContext,
        loopMode,
        onToggleLoop,
        onToggleTimeline: () => setIsTimelineOpen(true),
        onToggleLyricsList: () => setIsLyricsListOpen(prev => !prev),
        isLyricsListOpen,
        hasLyrics: !!lyrics,
        canPrev: !!trackNavigation?.canPrev,
        canNext: !!trackNavigation?.canNext,
        onPrev: trackNavigation?.onPrev ?? (() => { }),
        onNext: trackNavigation?.onNext ?? (() => { }),
    }), [isLyricsListOpen, lyrics, loopMode, onToggleLoop, slotContext, trackNavigation]);

    useEffect(() => {
        return () => {
            if (expandTimeoutRef.current !== null) {
                window.clearTimeout(expandTimeoutRef.current);
            }
            if (collapseTimeoutRef.current !== null) {
                window.clearTimeout(collapseTimeoutRef.current);
            }
        };
    }, []);

    const handleMouseEnter = () => {
        if (collapseTimeoutRef.current !== null) {
            window.clearTimeout(collapseTimeoutRef.current);
            collapseTimeoutRef.current = null;
        }

        if (isHovered || signalPathOpenRef.current) {
            return;
        }

        if (expandTimeoutRef.current !== null) {
            return;
        }

        expandTimeoutRef.current = window.setTimeout(() => {
            setIsHovered(true);
            expandTimeoutRef.current = null;
        }, HOVER_EXPAND_DELAY_MS);
    };

    const handleMouseLeave = () => {
        if (expandTimeoutRef.current !== null) {
            window.clearTimeout(expandTimeoutRef.current);
            expandTimeoutRef.current = null;
        }

        if (signalPathOpenRef.current || !isHovered || collapseTimeoutRef.current !== null) {
            return;
        }

        collapseTimeoutRef.current = window.setTimeout(() => {
            setIsHovered(false);
            collapseTimeoutRef.current = null;
        }, HOVER_COLLAPSE_DELAY_MS);
    };

    const handleClick = () => {
        if (isPositioning) {
            return;
        }
        if (currentView !== 'lattice') {
            onNavigateToPlayer();
        } else {
            onFocusLatticeCurrentSong?.();
        }
    };

    if (hideControlBar) {
        return null;
    }

    return (
        <>
            {/*
                Positioning layer and animation layer must remain separated.
                Tailwind `-translate-x-1/2` handles horizontal centering, while framer-motion handles y/scale.
                Bottom uses shared MotionValue (default 32px), which doesn't disrupt centering.
            */}
            <motion.div
                className={`absolute left-1/2 -translate-x-1/2 z-60 w-full flex justify-center pointer-events-none
                    ${currentView === 'home'
                        ? 'max-w-[calc(100vw-120px)] md:max-w-[min(calc(32rem_+_var(--folium-player-bar-extra,0px)),calc(100vw-120px))]'
                        : 'max-w-[min(calc(32rem_+_var(--folium-player-bar-extra,0px)),100vw)] px-4'}`}
                style={{ bottom: bottomBarBottomPx }}
                onUpdate={invalidateLayout}
            >
            <motion.div
                className="w-full flex justify-center transition-all duration-300 pointer-events-none"
                onUpdate={invalidateLayout}
                initial={false}
                animate={{
                    opacity: isHidden ? 0 : 1,
                    y: isHidden ? 24 : 0,
                    scale: isHidden ? 0.97 : 1,
                }}
                transition={{ duration: 0.26, ease: 'easeOut' }}
                style={{ pointerEvents: isHidden ? 'none' : 'auto' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="pointer-events-auto w-full flex justify-center relative"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    style={{
                        // Downward hitbox buffer only applies when capsule touches bottom edge.
                        paddingBottom: `${hoverHitboxBufferPx}px`,
                        marginBottom: `${-hoverHitboxBufferPx}px`,
                    }}
                >
                    {showAudioSignalPath && !isHidden && !isPositioning && (
                        <SignalPath
                            anchored
                            hideTrigger
                            open={isSignalPathOpen}
                            onClose={() => setIsSignalPathOpen(false)}
                            onOpenChange={handleSignalPathOpen}
                            audioQualityInfo={currentSong?.audioQualityInfo}
                            playerState={playerState}
                        />
                    )}
                    <motion.div
                        data-glass
                        ref={layoutRef}
                        onUpdate={invalidateLayout}
                        onLayoutAnimationComplete={invalidateLayout}
                        layout
                        transition={{ layout: CONTROL_LAYOUT_SPRING }}
                        onClick={handleClick}
                        // Use native pointer events instead of framer-motion drag to avoid duplicated offset.
                        data-ponder="player-bar"
                        onPointerDown={handlePositionDragStart}
                        onPointerMove={handlePositionDragMove}
                        onPointerUp={handlePositionDragEnd}
                        onPointerCancel={handlePositionDragEnd}
                        style={{ touchAction: isPositioning ? 'none' : undefined }}
                        className={`backdrop-blur-xl shadow-2xl overflow-hidden rounded-full relative transition-colors duration-300
                            ${isPositioning ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                            ${showExpanded ? `p-3 ${glassBgExpanded} w-full` : `px-4 py-2 ${glassBgCollapsed} ${COLLAPSED_WIDTH_CLASS}`}`}
                    >
                        <motion.div
                            layout
                            transition={{ layout: CONTROL_LAYOUT_SPRING }}
                            // Disable control clicks when dragging in positioning mode.
                            className={`w-full ${isPositioning ? 'pointer-events-none select-none' : ''}`}
                        >
                            {showExpanded ? (
                                <ExpandedView
                                    currentSong={audioSrc?.startsWith('folia-transcode:') && currentSong ? { ...currentSong, audioQualityInfo: undefined } : currentSong}
                                    playerState={playerState}
                                    currentTime={currentTime}
                                    lyricCurrentTime={lyricCurrentTime}
                                    duration={duration}
                                    canTogglePlay={canTogglePlay}
                                    onSeek={onSeek}
                                    onTogglePlay={onTogglePlay}
                                    noTrackText={noTrackText}
                                    primaryColor={primaryColor}
                                    secondaryColor={secondaryColor}
                                    trackColor={trackColor}
                                    isDaylight={isDaylight}
                                    controlsDisabled={controlsDisabled || isPositioning}
                                    trackNavigation={trackNavigation}
                                    slotPrimary={slotPrimary}
                                    slotSecondary={slotSecondary}
                                    slotContext={resolvedSlotContext}
                                    showAudioSignalPath={showAudioSignalPath}
                                    onOpenSignalPath={() => setIsSignalPathOpen(open => !open)}
                                />
                            ) : (
                                <CollapsedView
                                    audioQualityInfo={audioSrc?.startsWith('folia-transcode:') ? undefined : currentSong?.audioQualityInfo}
                                    currentTime={currentTime}
                                    duration={duration}
                                    onSeek={onSeek}
                                    primaryColor={primaryColor}
                                    secondaryColor={secondaryColor}
                                    trackColor={trackColor}
                                    controlsDisabled={controlsDisabled}
                                    showAudioSignalPath={showAudioSignalPath}
                                    onOpenSignalPath={() => setIsSignalPathOpen(open => !open)}
                                />
                            )}
                        </motion.div>
                    </motion.div>
                </div>
            </motion.div>
            </motion.div>

            <AnimatePresence>
                {isPositioning && (
                    <PlayerBottomBarPositioner
                        maxOffsetPx={maxOffsetPx}
                        accentColor={primaryColor}
                        isDaylight={isDaylight}
                        onReset={() => playerBottomBarLiveOffset.set(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX)}
                        onCommit={handleCommitPositioning}
                        onCancel={cancelPositioning}
                    />
                )}
            </AnimatePresence>

            <LyricsTimelineModal
                isOpen={isTimelineOpen}
                onClose={() => setIsTimelineOpen(false)}
                lyrics={lyrics}
                duration={duration}
                currentTime={lyricCurrentTime ?? currentTime}
                onSeek={(time) => {
                    const target = resolveLyricSeekMediaTime(time, {
                        mediaTimeSec: currentTime.get(),
                        lyricTimeSec: lyricCurrentTime?.get() ?? currentTime.get(),
                        durationSec: duration,
                    });
                    if (target !== null) onSeek(target);
                }}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                accentColor="var(--text-accent)"
                theme={theme}
                isDaylight={isDaylight}
                disabled={controlsDisabled}
            />

            <QuickLyricsListDrawer
                isOpen={isLyricsListOpen}
                onClose={() => setIsLyricsListOpen(false)}
                lyrics={lyrics}
                currentTime={lyricCurrentTime ?? currentTime}
                onSeek={(time) => {
                    const offset = currentTime.get() - (lyricCurrentTime?.get() ?? currentTime.get());
                    onSeek(Math.max(0, time + offset));
                }}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                theme={theme}
                isDaylight={isDaylight}
            />
        </>
    );
};

// Expanded view component
interface ExpandedViewProps {
    currentSong: { name: string; audioQualityInfo?: AudioQualityInfo; } | null;
    playerState: PlayerState;
    currentTime: MotionValue<number>;
    lyricCurrentTime?: MotionValue<number>;
    duration: number;
    canTogglePlay: boolean;
    onSeek: (time: number) => void;
    onTogglePlay: () => void;
    noTrackText: string;
    primaryColor: string;
    secondaryColor: string;
    trackColor?: string;
    isDaylight?: boolean;
    controlsDisabled?: boolean;
    trackNavigation?: TrackNavigation | null;
    slotPrimary: PlayerControlSlotActionId;
    slotSecondary: PlayerControlSlotActionId;
    slotContext: PlayerControlSlotContext;
    showAudioSignalPath?: boolean;
    onOpenSignalPath?: () => void;
}

const ExpandedView: React.FC<ExpandedViewProps> = ({
    currentSong,
    playerState,
    currentTime,
    lyricCurrentTime,
    duration,
    canTogglePlay,
    onSeek,
    onTogglePlay,
    noTrackText,
    primaryColor,
    secondaryColor,
    trackColor,
    isDaylight,
    controlsDisabled = false,
    trackNavigation = null,
    slotPrimary,
    slotSecondary,
    slotContext,
    showAudioSignalPath,
    onOpenSignalPath,
}) => {
    return (
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-x-2.5 sm:gap-x-3 gap-y-2 sm:grid-cols-[76px_minmax(0,1fr)_76px]">
            {/* Desktop Layout - responsive grid positions apply from the sm breakpoint */}
            {/* Mobile Layout - base grid positions apply below the sm breakpoint */}
            {/* Row 1: Centered Title */}
            <div className="col-span-3 row-start-1 min-w-0 px-2 sm:col-start-2 sm:col-span-1">
                {trackNavigation ? (
                    <TrackTitleNavigator
                        title={currentSong?.name || noTrackText}
                        trackKey={trackNavigation.currentTrackKey}
                        prevTitle={trackNavigation.prevTitle}
                        nextTitle={trackNavigation.nextTitle}
                        canPrev={trackNavigation.canPrev}
                        canNext={trackNavigation.canNext}
                        onPrev={trackNavigation.onPrev}
                        onNext={trackNavigation.onNext}
                        prevLabel={trackNavigation.prevLabel}
                        nextLabel={trackNavigation.nextLabel}
                        color={primaryColor}
                        isDaylight={isDaylight}
                        disabled={controlsDisabled}
                    />
                ) : (
                    <div className="truncate text-center text-sm font-bold select-none" style={{ color: primaryColor }}>
                        {currentSong?.name || noTrackText}
                    </div>
                )}
                <AudioQualityBadge
                    info={currentSong?.audioQualityInfo}
                    showSignalPathAction={showAudioSignalPath}
                    onOpenSignalPath={onOpenSignalPath}
                />
            </div>

            {/* Play Button */}
            <div className="col-start-2 row-start-2 flex items-center justify-center sm:col-start-1 sm:row-start-1 sm:row-span-2 sm:justify-center">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onTogglePlay();
                    }}
                    disabled={!canTogglePlay || controlsDisabled}
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-none bg-(--text-primary) text-black shadow-lg transition-transform ${controlsDisabled ? 'cursor-not-allowed opacity-45' : 'hover:scale-105'}`}
                    style={{ backgroundColor: primaryColor, color: 'var(--bg-color)' }}
                >
                    {playerState === PlayerState.PLAYING ? (
                        <Pause size={20} fill="currentColor" />
                    ) : (
                        <Play size={20} fill="currentColor" className="ml-1" />
                    )}
                </button>
            </div>

            {/* Two customizable slots. Defaults to loop mode + lyrics timeline, consistent with original behavior. */}
            <div
                data-ponder-slots
                className="contents sm:col-start-3 sm:row-start-1 sm:row-span-2 sm:flex sm:items-center sm:justify-center sm:gap-1"
            >
                <PlayerControlSlotButton
                    actionId={slotPrimary}
                    context={slotContext}
                    primaryColor={primaryColor}
                    isDaylight={isDaylight}
                    controlsDisabled={controlsDisabled}
                    className="col-start-1 row-start-2 justify-self-end sm:justify-self-auto"
                />

                <PlayerControlSlotButton
                    actionId={slotSecondary}
                    context={slotContext}
                    primaryColor={primaryColor}
                    isDaylight={isDaylight}
                    controlsDisabled={controlsDisabled}
                    className="col-start-3 row-start-2 justify-self-start sm:justify-self-auto"
                />
            </div>

            {/* Row 2: Current Time, Progress Bar, Duration */}
            <div className="col-span-3 row-start-3 w-full px-1 sm:col-start-2 sm:col-span-1 sm:row-start-2 flex items-center justify-center">
                <ProgressBar
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={onSeek}
                    primaryColor={primaryColor}
                    secondaryColor={secondaryColor}
                    trackColor={trackColor}
                    disabled={controlsDisabled}
                />
            </div>
        </div>
    );
};

// Collapsed view component
interface CollapsedViewProps {
    audioQualityInfo?: AudioQualityInfo;
    currentTime: MotionValue<number>;
    duration: number;
    onSeek: (time: number) => void;
    primaryColor: string;
    secondaryColor: string;
    trackColor?: string;
    controlsDisabled?: boolean;
    showAudioSignalPath?: boolean;
    onOpenSignalPath?: () => void;
}

const CollapsedView: React.FC<CollapsedViewProps> = ({
    audioQualityInfo,
    currentTime,
    duration,
    onSeek,
    primaryColor,
    secondaryColor,
    trackColor,
    controlsDisabled = false,
    showAudioSignalPath,
    onOpenSignalPath,
}) => {
    return (
        <div className="flex flex-col w-full justify-center px-4">
            <div className="flex items-center w-full h-8">
            <ProgressBar
                currentTime={currentTime}
                duration={duration}
                onSeek={onSeek}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                trackColor={trackColor}
                disabled={controlsDisabled}
                collapsed
            />
            </div>
            <AudioQualityBadge
                info={audioQualityInfo}
                showSignalPathAction={showAudioSignalPath}
                onOpenSignalPath={onOpenSignalPath}
            />
        </div>
    );
};

export default FloatingPlayerControls;
