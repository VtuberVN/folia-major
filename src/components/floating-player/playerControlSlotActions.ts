import { AlignLeft, ChartBar, Crosshair, Heart, ListMusic, PanelsTopLeft, Repeat, Shuffle, SkipBack, SkipForward, Timer, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PlayerControlSlotActionId } from '../../types/playerControlSlots';
import { noteLoopButtonPress } from '../../services/ponder/loopShuffleHint';
import { loopModeIcon, loopModeLabelName } from '../shared/loopModeDisplay';

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
    { id: 'locate', icon: Crosshair, labelKey: 'options.playerControlSlotAction_locate' },
];

/**
 * 把一个槽位 id 和当前播放上下文解析成可直接渲染的按钮描述。
 * 打开界面的四个动作统一转成 openCommandById，复用命令面板已经做好的 surface。
 */
export const resolvePlayerControlSlot = (
    id: PlayerControlSlotActionId,
    context: PlayerControlSlotContext,
): ResolvedPlayerControlSlot => {
    switch (id) {
        case 'loop':
            return {
                // 循环按钮的图标和提示文本反映当前模式，是这批动作里唯一的三态图标。
                icon: loopModeIcon(context.loopMode),
                filled: false,
                active: context.loopMode !== 'off',
                disabled: false,
                onActivate: () => {
                    // Toggling loop raises a mode toast; note button press after toggle
                    context.onToggleLoop();
                    noteLoopButtonPress();
                },
                labelKey: `player.${loopModeLabelName(context.loopMode)}`,
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
        case 'locate':
            return {
                icon: Crosshair,
                filled: false,
                active: false,
                disabled: !context.canInvokeCommandById('locate-playing-song'),
                onActivate: () => context.invokeCommandById('locate-playing-song'),
                labelKey: 'options.playerControlSlotAction_locate',
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
