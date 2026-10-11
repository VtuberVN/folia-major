import { describe, expect, it } from 'vitest';
import type { Line } from '../../../src/types';
import { findLatestActiveLineIndex } from '../../../src/utils/appPlaybackHelpers';
import { createActiveLineFinder } from '../../../src/utils/lyrics/activeLineFinder';

// test/unit/lyrics/activeLineFinder.test.ts
// Compare prepared lookup with the existing playback contract across arbitrary seeks.
const line = (startTime: number, endTime: number, renderEndTime?: number): Line => ({
    words: [], fullText: 'fixture', startTime, endTime,
    ...(renderEndTime === undefined ? {} : { renderHints: {
        rawDuration: endTime - startTime, timingClass: 'normal', renderEndTime,
        lineTransitionMode: 'normal', wordRevealMode: 'normal',
    } }),
});

function checkSeeks(lines: Line[], times: number[]) {
    const find = createActiveLineFinder(lines);
    for (const time of times) expect(find(time), 'time=' + time).toBe(findLatestActiveLineIndex(lines, time));
}

describe('prepared active lyric line lookup', () => {
    it('preserves overlap, gaps, inclusive boundaries, render end overrides and equal starts', () => {
        const lines = [line(0, 10), line(2, 3), line(2, 4, 5), line(12, 14, 13), line(12, 12)];
        checkSeeks(lines, [-1, 0, 2, 3, 4, 5, 5.001, 10, 10.001, 12, 12.001, 13, 13.001, 14, 100, 2, 0]);
        const find = createActiveLineFinder(lines);
        expect(find(2)).toBe(2);
        expect(find(5.001)).toBe(0);
        expect(find(12)).toBe(4);
        expect(find(12.001)).toBe(3);
        expect(find(13.001)).toBe(-1);
    });

    it('preserves original scanning semantics for unsorted or nonfinite imports', () => {
        checkSeeks([line(10, 12), line(0, 11), line(8, 9)], [-1, 0, 8, 9, 10, 11, 12, 20]);
        checkSeeks([line(NaN, 8), line(5, 6), line(Infinity, Infinity)], [NaN, -Infinity, 0, 6, 7, Infinity]);
        checkSeeks([line(0, NaN), line(3, 4, NaN)], [NaN, 0, 3, 4, Infinity]);
    });

    it('handles empty and replacement arrays without a shared stale cache', () => {
        expect(createActiveLineFinder(undefined)(0)).toBe(-1);
        expect(createActiveLineFinder([])(0)).toBe(-1);
        const original = [line(0, 1)];
        const originalFinder = createActiveLineFinder(original);
        const replacementFinder = createActiveLineFinder([line(5, 6)]);
        expect(originalFinder(0.5)).toBe(0);
        expect(replacementFinder(0.5)).toBe(-1);
        expect(replacementFinder(5.5)).toBe(0);
    });

    it('matches the original scan for deterministic random overlaps, gaps and backward seeks', () => {
        let seed = 0x71af36;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
        for (let run = 0; run < 120; run += 1) {
            let start = -3;
            const lines = Array.from({ length: 60 }, () => {
                start += random() < 0.25 ? 0 : Math.floor(random() * 5);
                const end = start + Math.floor(random() * 25) - 2;
                return line(start, end, random() < 0.5 ? start + Math.floor(random() * 30) : undefined);
            });
            const times = lines.flatMap(entry => [entry.startTime, entry.endTime, entry.startTime - 0.001]);
            times.push(...Array.from({ length: 60 }, () => random() * (start + 40) - 10));
            // Alternate late/early seeks to ensure no cursor-dependent timing changes.
            times.sort((a, b) => a - b);
            const seeks: number[] = [];
            while (times.length) { seeks.push(times.pop()!); if (times.length) seeks.push(times.shift()!); }
            checkSeeks(lines, seeks);
            checkSeeks([...lines].reverse(), seeks);
        }
    });
});
