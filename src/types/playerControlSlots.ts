// src/types/playerControlSlots.ts
// Cross-layer contract for the two customizable slots on the right side of the progress bar capsule.
// Contains IDs, defaults, and validation: the store requires them for persistence without importing icon modules.
// Icon and handler resolution live in src/components/floating-player/playerControlSlotActions.ts.

export type PlayerControlSlotActionId =
    | 'loop'
    | 'prev'
    | 'next'
    | 'shuffle'
    | 'like'
    | 'lyrics-timeline'
    | 'lyrics-list'
    | 'volume'
    | 'queue'
    | 'song-wall'
    | 'sleep-timer';

export const PLAYER_CONTROL_SLOT_ACTION_IDS: readonly PlayerControlSlotActionId[] = [
    'loop',
    'prev',
    'next',
    'shuffle',
    'like',
    'lyrics-timeline',
    'lyrics-list',
    'volume',
    'queue',
    'song-wall',
    'sleep-timer',
];

/** Default: loop mode + lyrics timeline. */
export const DEFAULT_PLAYER_CONTROL_SLOT_PRIMARY: PlayerControlSlotActionId = 'loop';
export const DEFAULT_PLAYER_CONTROL_SLOT_SECONDARY: PlayerControlSlotActionId = 'lyrics-timeline';

export const isPlayerControlSlotActionId = (value: unknown): value is PlayerControlSlotActionId => (
    typeof value === 'string' && (PLAYER_CONTROL_SLOT_ACTION_IDS as readonly string[]).includes(value)
);
