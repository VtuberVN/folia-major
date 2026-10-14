import { describe, expect, it, vi } from 'vitest';
import type { LyricData } from '@/types';
import { findLatestActiveLineIndex } from '@/utils/appPlaybackHelpers';

// test/unit/lyrics/quickLyricsListDrawer.test.ts
// Unit tests for quick lyrics list logic, active line calculation, and time formatting.

const mockLyrics: LyricData = {
    lines: [
        {
            startTime: 0,
            endTime: 5.2,
            fullText: 'First line of the song',
            translation: 'First line translated',
            words: [],
        },
        {
            startTime: 5.2,
            endTime: 10.8,
            fullText: 'Second line with high energy',
            translation: 'Second line translated',
            words: [],
        },
        {
            startTime: 10.8,
            endTime: 16.5,
            fullText: 'Third line reaching chorus',
            words: [],
        },
    ],
};

describe('QuickLyricsListDrawer helpers', () => {
    it('correctly tracks active line based on playback time', () => {
        expect(findLatestActiveLineIndex(mockLyrics.lines, 0)).toBe(0);
        expect(findLatestActiveLineIndex(mockLyrics.lines, 3.5)).toBe(0);
        expect(findLatestActiveLineIndex(mockLyrics.lines, 5.2)).toBe(1);
        expect(findLatestActiveLineIndex(mockLyrics.lines, 8.0)).toBe(1);
        expect(findLatestActiveLineIndex(mockLyrics.lines, 12.0)).toBe(2);
        expect(findLatestActiveLineIndex(mockLyrics.lines, 16.0)).toBe(2);
        // After line 3 ends (16.5s), no active line returns -1
        expect(findLatestActiveLineIndex(mockLyrics.lines, 20.0)).toBe(-1);
    });

    it('returns -1 for timestamps before the first line', () => {
        const delayedLyrics: LyricData = {
            lines: [
                { startTime: 10.0, endTime: 15.0, fullText: 'Intro finishes at 10s', words: [] },
            ],
        };
        expect(findLatestActiveLineIndex(delayedLyrics.lines, 2.0)).toBe(-1);
    });

    it('formats timestamps into mm:ss tabular format', () => {
        const formatTime = (seconds: number) => {
            if (isNaN(seconds) || seconds < 0) return '00:00';
            const total = Math.floor(seconds);
            const m = Math.floor(total / 60);
            const s = total % 60;
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

        expect(formatTime(0)).toBe('00:00');
        expect(formatTime(5.2)).toBe('00:05');
        expect(formatTime(65.8)).toBe('01:05');
        expect(formatTime(215)).toBe('03:35');
        expect(formatTime(-1)).toBe('00:00');
    });

    it('handles seek callback invocation on line click', () => {
        const onSeek = vi.fn();
        const handleLineClick = (startTime: number) => {
            onSeek(startTime);
        };

        handleLineClick(mockLyrics.lines[1].startTime);
        expect(onSeek).toHaveBeenCalledWith(5.2);

        handleLineClick(mockLyrics.lines[2].startTime);
        expect(onSeek).toHaveBeenCalledWith(10.8);
    });
});
