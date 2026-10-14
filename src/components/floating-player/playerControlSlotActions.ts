import { AlignLeft, ChartBar, Heart, ListMusic, PanelsTopLeft, Repeat, Repeat1, RepeatOff, Shuffle, SkipBack, SkipForward, Timer, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PlayerControlSlotActionId } from '../../types/playerControlSlots';
import { noteLoopButtonPress } from '../../services/ponder/loopShuffleHint';

// src/components/floating-player/playerControlSlotActions.ts
// Actions list for the two customizable slots on the right side of the player capsule.

export type { PlayerControlSlotActionId };

/** All inputs required to render a slot. */
export type PlayerControlSlotContext = {
    loopMode: 'off' | 'all' | 'one';
    onToggleLoop: () => void;
    onPrev: () => void;
    onNext: () => void;
    canPrev: boolean;
    canNext: boolean;
    onShuffle: () => void;
    canShuffle: boolean;
    onLike: () => void;
    isLiked: boolean;
    likeDisabled: boolean;
    onToggleTimeline: () => void;
    onToggleLyricsList?: () => void;
    isLyricsListOpen?: boolean;
    hasLyrics: boolean;
    invokeCommandById: (commandId: string) => void;
    canInvokeCommandById: (commandId: string) => boolean;
};

/** Render output for a single slot. */
export type ResolvedPlayerControlSlot = {
    icon: LucideIcon;
    filled: boolean;
    active: boolean;
    disabled: boolean;
    onActivate: () => void;
    labelKey: string;
};

/** Static display options for settings dropdown. */
export const PLAYER_CONTROL_SLOT_OPTIONS: readonly { id: PlayerControlSlotActionId; icon: LucideIcon; labelKey: string; }[] = [
    { id: 'loop', icon: Repeat, labelKey: 'options.playerControlSlotAction_loop' },
    { id: 'prev', icon: SkipBack, labelKey: 'options.playerControlSlotAction_prev' },
    { id: 'next', icon: SkipForward, labelKey: 'options.playerControlSlotAction_next' },
    { id: 'shuffle', icon: Shuffle, labelKey: 'options.playerControlSlotAction_shuffle' },
    { id: 'like', icon: Heart, labelKey: 'options.playerControlSlotAction_like' },
    { id: 'lyrics-list', icon: AlignLeft, labelKey: 'options.playerControlSlotAction_lyricsList' },
    { id: 'lyrics-timeline', icon: ChartBar, labelKey: 'options.playerControlSlotAction_lyricsTimeline' },
    { id: 'volume', icon: Volume2, labelKey: 'options.playerControlSlotAction_volume' },
    { id: 'queue', icon: ListMusic, labelKey: 'options.playerControlSlotAction_queue' },
    { id: 'song-wall', icon: PanelsTopLeft, labelKey: 'options.playerControlSlotAction_songWall' },
    { id: 'sleep-timer', icon: Timer, labelKey: 'options.playerControlSlotAction_sleepTimer' },
];

/** The loop button icon reflects current mode (the only tri-state icon). */
const resolveLoopIcon = (loopMode: PlayerControlSlotContext['loopMode']): LucideIcon => {
    if (loopMode === 'off') return RepeatOff;
    if (loopMode === 'one') return Repeat1;
    return Repeat;
};

/** Tooltip label key reflecting the active loop mode. */
const resolveLoopLabelKey = (loopMode: PlayerControlSlotContext['loopMode']): string => {
    if (loopMode === 'off') return 'player.loopOff';
    if (loopMode === 'one') return 'player.loopOne';
    return 'player.loopAll';
};

/** Resolves a slot ID and current playback context into a renderable button description. */
export const resolvePlayerControlSlot = (
    id: PlayerControlSlotActionId,
    context: PlayerControlSlotContext,
): ResolvedPlayerControlSlot => {
    switch (id) {
        case 'loop':
            return {
                icon: resolveLoopIcon(context.loopMode),
                filled: false,
                active: context.loopMode !== 'off',
                disabled: false,
                onActivate: () => {
                    // Toggling loop raises a mode toast; note button press after toggle
                    context.onToggleLoop();
                    noteLoopButtonPress();
                },
                labelKey: resolveLoopLabelKey(context.loopMode),
            };
        case 'prev':
            return {
                icon: SkipBack,
                filled: false,
                active: false,
                disabled: !context.canPrev,
                onActivate: context.onPrev,
                labelKey: 'options.playerControlSlotAction_prev',
            };
        case 'next':
            return {
                icon: SkipForward,
                filled: false,
                active: false,
                disabled: !context.canNext,
                onActivate: context.onNext,
                labelKey: 'options.playerControlSlotAction_next',
            };
        case 'shuffle':
            return {
                icon: Shuffle,
                filled: false,
                active: false,
                disabled: !context.canShuffle,
                onActivate: context.onShuffle,
                labelKey: 'options.playerControlSlotAction_shuffle',
            };
        case 'like':
            return {
                icon: Heart,
                filled: context.isLiked,
                active: context.isLiked,
                disabled: context.likeDisabled,
                onActivate: context.onLike,
                labelKey: 'options.playerControlSlotAction_like',
            };
        case 'volume':
            return {
                icon: Volume2,
                filled: false,
                active: false,
                disabled: !context.canInvokeCommandById('playback-volume'),
                onActivate: () => context.invokeCommandById('playback-volume'),
                labelKey: 'options.playerControlSlotAction_volume',
            };
        case 'queue':
            return {
                icon: ListMusic,
                filled: false,
                active: false,
                disabled: !context.canInvokeCommandById('queue'),
                onActivate: () => context.invokeCommandById('queue'),
                labelKey: 'options.playerControlSlotAction_queue',
            };
        case 'song-wall':
            return {
                icon: PanelsTopLeft,
                filled: false,
                active: false,
                // The command hides itself on the wall, so the slot greys out there instead of
                // offering a trip to the surface the user is already looking at.
                disabled: !context.canInvokeCommandById('navigate-lattice'),
                onActivate: () => context.invokeCommandById('navigate-lattice'),
                labelKey: 'options.playerControlSlotAction_songWall',
            };
        case 'sleep-timer':
            return {
                icon: Timer,
                filled: false,
                active: false,
                disabled: !context.canInvokeCommandById('sleep-timer'),
                onActivate: () => context.invokeCommandById('sleep-timer'),
                labelKey: 'options.playerControlSlotAction_sleepTimer',
            };
        case 'lyrics-list':
            return {
                icon: AlignLeft,
                filled: false,
                active: Boolean(context.isLyricsListOpen),
                disabled: !context.hasLyrics,
                onActivate: () => context.onToggleLyricsList?.(),
                labelKey: 'options.playerControlSlotAction_lyricsList',
            };
        case 'lyrics-timeline':
        default:
            return {
                icon: ChartBar,
                filled: false,
                active: false,
                disabled: !context.hasLyrics,
                onActivate: context.onToggleTimeline,
                labelKey: 'options.playerControlSlotAction_lyricsTimeline',
            };
    }
};
