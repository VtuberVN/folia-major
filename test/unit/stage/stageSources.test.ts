import { describe, expect, it } from 'vitest';
import type { StageSource } from '@/types';
import { isExternalStageSource, isSpotifyStageSource } from '@/utils/stageSources';

// test/unit/stage/stageSources.test.ts
// Locks the source families that drive external playback and Spotify lyric matching.

describe('Stage source classification', () => {
    const cases: Array<{
        source: StageSource | null | undefined;
        external: boolean;
        spotify: boolean;
    }> = [
        { source: 'stage-api', external: false, spotify: false },
        { source: 'playercap', external: false, spotify: false },
        { source: 'now-playing', external: true, spotify: false },
        { source: 'spotify', external: true, spotify: true },
        { source: 'spotify-local', external: true, spotify: true },
        { source: null, external: false, spotify: false },
        { source: undefined, external: false, spotify: false },
    ];

    it.each(cases)('classifies $source', ({ source, external, spotify }) => {
        expect(isExternalStageSource(source)).toBe(external);
        expect(isSpotifyStageSource(source)).toBe(spotify);
    });
});
