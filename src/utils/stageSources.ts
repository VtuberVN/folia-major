import type { StageSource } from '../types';

// src/utils/stageSources.ts

export type ExternalStageSource = Extract<StageSource, 'now-playing' | 'spotify' | 'spotify-local'>;
export type SpotifyStageSource = Extract<StageSource, 'spotify' | 'spotify-local'>;

export const isExternalStageSource = (
    source: StageSource | null | undefined,
): source is ExternalStageSource => (
    source === 'now-playing' || source === 'spotify' || source === 'spotify-local'
);

export const isSpotifyStageSource = (
    source: StageSource | null | undefined,
): source is SpotifyStageSource => source === 'spotify' || source === 'spotify-local';
