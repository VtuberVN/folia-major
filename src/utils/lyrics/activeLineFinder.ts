import type { LyricData } from '../../types';
import { findLatestActiveLineIndex } from '../appPlaybackHelpers';

// src/utils/lyrics/activeLineFinder.ts
// Prepared once per immutable lyric-line array; arbitrary seeks need no cursor state.
export function createActiveLineFinder(lines: LyricData['lines'] | undefined): (time: number) => number {
    if (!lines?.length) return () => -1;
    // Binary search requires finite, nondecreasing starts. Malformed or unsorted imports
    // retain the existing reverse scan, including its original comparison semantics.
    for (let index = 0; index < lines.length; index += 1) {
        const start = lines[index]?.startTime;
        if (!Number.isFinite(start) || (index > 0 && start < lines[index - 1].startTime)) {
            return time => findLatestActiveLineIndex(lines, time);
        }
    }
    return time => {
        let lower = 0;
        let upper = lines.length;
        while (lower < upper) {
            const middle = lower + Math.floor((upper - lower) / 2);
            if (lines[middle].startTime <= time) lower = middle + 1;
            else upper = middle;
        }
        // A later line can finish before an earlier overlapping line; do not assume
        // end times are ordered. Equal starts retain the highest active array index.
        for (let index = lower - 1; index >= 0; index -= 1) {
            const line = lines[index];
            if (time <= (line.renderHints?.renderEndTime ?? line.endTime)) return index;
        }
        return -1;
    };
}
