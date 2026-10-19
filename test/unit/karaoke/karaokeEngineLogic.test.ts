import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
    formatTimestamp,
    serializeStandardLrc,
    serializeEnhancedLrc,
    alignLyricsTextToWords,
} = require('../../../electron/aiKaraoke/karaokeEngine.cjs');

describe('karaokeEngineLogic', () => {
    describe('formatTimestamp', () => {
        it('formats zero and negative numbers safely', () => {
            expect(formatTimestamp(0)).toBe('00:00.00');
            expect(formatTimestamp(-1)).toBe('00:00.00');
        });

        it('formats standard minutes and seconds with centiseconds', () => {
            expect(formatTimestamp(65.45)).toBe('01:05.45');
            expect(formatTimestamp(12.3)).toBe('00:12.30');
            expect(formatTimestamp(185.05)).toBe('03:05.05');
        });
    });

    describe('serializeStandardLrc & serializeEnhancedLrc', () => {
        const mockLines = [
            {
                startTime: 10.5,
                endTime: 14.0,
                text: 'Anh yêu em',
                words: [
                    { text: 'Anh', startTime: 10.5, endTime: 11.2 },
                    { text: 'yêu', startTime: 11.2, endTime: 12.0 },
                    { text: 'em', startTime: 12.0, endTime: 13.5 },
                ],
            },
        ];

        it('serializes standard LRC format', () => {
            const lrc = serializeStandardLrc(mockLines, { title: 'Bai Hat', artist: 'Ca Si' });
            expect(lrc).toContain('[ti:Bai Hat]');
            expect(lrc).toContain('[ar:Ca Si]');
            expect(lrc).toContain('[00:10.50]Anh yêu em');
        });

        it('serializes enhanced word-level LRC format', () => {
            const lrc = serializeEnhancedLrc(mockLines, { title: 'Bai Hat' });
            expect(lrc).toContain('[ti:Bai Hat]');
            expect(lrc).toContain('[00:10.50]<00:10.50>Anh <00:11.20>yêu <00:12.00>em <00:13.50>');
        });
    });

    describe('alignLyricsTextToWords & number syllable weighting', () => {
        it('correctly allocates time to multi-digit numbers without rushing subsequent words', () => {
            const rawLyrics = '[00:00.00]1234234 anh hết yêu em rồi';
            const detectedWords = [
                { text: '1234234', startTime: 0.0, endTime: 3.5 },
                { text: 'anh', startTime: 3.5, endTime: 4.0 },
                { text: 'hết', startTime: 4.0, endTime: 4.5 },
                { text: 'yêu', startTime: 4.5, endTime: 5.0 },
                { text: 'em', startTime: 5.0, endTime: 5.5 },
                { text: 'rồi', startTime: 5.5, endTime: 6.0 },
            ];

            const lines = alignLyricsTextToWords(rawLyrics, detectedWords);
            expect(lines.length).toBe(1);

            const words = lines[0].words;
            expect(words.length).toBe(6);

            const numberToken = words[0];
            expect(numberToken.text).toBe('1234234');

            const nextToken = words[1];
            expect(nextToken.text).toBe('anh');

            // The number token 1234234 (7 digits) should span roughly half of the 6-second line,
            // never finishing in 0.5s or rushing ahead
            const numberDuration = numberToken.endTime - numberToken.startTime;
            expect(numberDuration).toBeGreaterThanOrEqual(2.5);
            expect(nextToken.startTime).toBeGreaterThanOrEqual(2.5);
        });

        it('preserves existing line timestamps [mm:ss.xx]', () => {
            const rawLyrics = '[01:15.50]Dòng thứ nhất\n[01:20.00]Dòng thứ hai';
            const detectedWords = [
                { text: 'Dòng', startTime: 75.5, endTime: 76.0 },
                { text: 'thứ', startTime: 76.0, endTime: 76.5 },
                { text: 'nhất', startTime: 76.5, endTime: 77.0 },
                { text: 'Dòng', startTime: 80.0, endTime: 80.5 },
                { text: 'thứ', startTime: 80.5, endTime: 81.0 },
                { text: 'hai', startTime: 81.0, endTime: 81.5 },
            ];

            const lines = alignLyricsTextToWords(rawLyrics, detectedWords);
            expect(lines.length).toBe(2);
            expect(lines[0].startTime).toBeCloseTo(75.5, 1);
            expect(lines[1].startTime).toBeCloseTo(80.0, 1);
        });
    });
});
