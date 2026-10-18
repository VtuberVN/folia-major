import { describe, expect, it } from 'vitest';
import {
    formatLrcTimestamp,
    serializeStandardLrc,
    serializeEnhancedLrc,
    groupWordsIntoLines,
    alignLyricsTextToWords,
} from '@/utils/lyrics/lrcSerializer';
import { parseLRC, parseEnhancedLRC } from '@/utils/lyrics/parserCore';
import type { LyricLineTiming, WordTiming } from '@/types/aiKaraoke';

describe('lrcSerializer', () => {
    describe('formatLrcTimestamp', () => {
        it('formats 0 seconds properly', () => {
            expect(formatLrcTimestamp(0)).toBe('00:00.00');
        });

        it('formats sub-minute times with fractional centiseconds', () => {
            expect(formatLrcTimestamp(15.456)).toBe('00:15.46');
            expect(formatLrcTimestamp(9.05)).toBe('00:09.05');
        });

        it('formats minutes and seconds accurately', () => {
            expect(formatLrcTimestamp(75.5)).toBe('01:15.50');
            expect(formatLrcTimestamp(215.82)).toBe('03:35.82');
        });

        it('handles negative or invalid numbers safely', () => {
            expect(formatLrcTimestamp(-10)).toBe('00:00.00');
            expect(formatLrcTimestamp(NaN)).toBe('00:00.00');
            expect(formatLrcTimestamp(Infinity)).toBe('00:00.00');
        });
    });

    describe('serializeStandardLrc & parseLRC round-trip', () => {
        it('serializes lines with metadata and parses back correctly', () => {
            const lines: LyricLineTiming[] = [
                { startTime: 12.5, endTime: 15.0, text: 'Hello beautiful world', words: [] },
                { startTime: 16.2, endTime: 20.0, text: 'Folia AI Karaoke', words: [] },
            ];

            const lrcText = serializeStandardLrc(lines, {
                title: 'Test Song',
                artist: 'Test Artist',
            });

            expect(lrcText).toContain('[ti:Test Song]');
            expect(lrcText).toContain('[ar:Test Artist]');
            expect(lrcText).toContain('[00:12.50]Hello beautiful world');
            expect(lrcText).toContain('[00:16.20]Folia AI Karaoke');

            const parsed = parseLRC(lrcText, '', { includeInterludes: false });
            expect(parsed.lines.length).toBe(2);
            expect(parsed.lines[0].fullText).toBe('Hello beautiful world');
            expect(parsed.lines[0].startTime).toBeCloseTo(12.5, 1);
            expect(parsed.lines[1].fullText).toBe('Folia AI Karaoke');
            expect(parsed.lines[1].startTime).toBeCloseTo(16.2, 1);
        });
    });

    describe('serializeEnhancedLrc & parseEnhancedLRC round-trip', () => {
        it('serializes word-level karaoke timing and parses back with words intact', () => {
            const lines: LyricLineTiming[] = [
                {
                    startTime: 5.0,
                    endTime: 8.5,
                    text: 'Em ơi có biết',
                    words: [
                        { text: 'Em', startTime: 5.0, endTime: 5.8 },
                        { text: 'ơi', startTime: 5.9, endTime: 6.5 },
                        { text: 'có', startTime: 6.6, endTime: 7.2 },
                        { text: 'biết', startTime: 7.3, endTime: 8.5 },
                    ],
                },
            ];

            const enhancedText = serializeEnhancedLrc(lines, {
                title: 'Bai Ca Hy Vong',
                artist: 'Ca Si',
            });

            expect(enhancedText).toContain('[00:05.00]<00:05.00>Em <00:05.90>ơi <00:06.60>có <00:07.30>biết <00:08.50>');

            const parsed = parseEnhancedLRC(enhancedText, '', { includeInterludes: false });
            expect(parsed.isWordByWord).toBe(true);
            expect(parsed.lines.length).toBe(1);
            expect(parsed.lines[0].words.length).toBeGreaterThanOrEqual(4);
            expect(parsed.lines[0].words[0].text.trim()).toBe('Em');
            expect(parsed.lines[0].words[0].startTime).toBeCloseTo(5.0, 1);
        });
    });

    describe('groupWordsIntoLines', () => {
        it('groups words based on silence pauses and sentence endings', () => {
            const words: WordTiming[] = [
                { text: 'Hello', startTime: 1.0, endTime: 1.5 },
                { text: 'there,', startTime: 1.6, endTime: 2.0 },
                // gap of 2 seconds -> should split line
                { text: 'General', startTime: 4.0, endTime: 4.5 },
                { text: 'Kenobi.', startTime: 4.6, endTime: 5.2 },
            ];

            const lines = groupWordsIntoLines(words, { maxGapSeconds: 1.0 });
            expect(lines.length).toBe(2);
            expect(lines[0].text).toBe('Hello there,');
            expect(lines[0].startTime).toBe(1.0);
            expect(lines[0].endTime).toBe(2.0);

            expect(lines[1].text).toBe('General Kenobi.');
            expect(lines[1].startTime).toBe(4.0);
            expect(lines[1].endTime).toBe(5.2);
        });
    });

    describe('alignLyricsTextToWords', () => {
        it('aligns raw lyrics lines to detected word timings', () => {
            const rawLyrics = 'Dong song xanh\nNuoc chay em dem';
            const detectedWords: WordTiming[] = [
                { text: 'dong', startTime: 2.0, endTime: 2.5 },
                { text: 'song', startTime: 2.6, endTime: 3.1 },
                { text: 'xanh', startTime: 3.2, endTime: 4.0 },
                { text: 'nuoc', startTime: 5.0, endTime: 5.6 },
                { text: 'chay', startTime: 5.7, endTime: 6.2 },
                { text: 'em', startTime: 6.3, endTime: 6.8 },
                { text: 'dem', startTime: 6.9, endTime: 7.5 },
            ];

            const lines = alignLyricsTextToWords(rawLyrics, detectedWords);
            expect(lines.length).toBe(2);
            expect(lines[0].text).toBe('Dong song xanh');
            expect(lines[0].words.length).toBe(3);
            expect(lines[0].startTime).toBe(2.0);
            expect(lines[0].endTime).toBe(4.0);

            expect(lines[1].text).toBe('Nuoc chay em dem');
            expect(lines[1].words.length).toBe(4);
            expect(lines[1].startTime).toBe(5.0);
            expect(lines[1].endTime).toBe(7.5);
        });
    });
});
