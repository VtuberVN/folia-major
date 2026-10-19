import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
    formatTimestamp,
    serializeStandardLrc,
    serializeEnhancedLrc,
    alignLyricsTextToWords,
    estimateSyllableWeight,
    detectVocalActivitySegments,
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

    describe('estimateSyllableWeight', () => {
        it('correctly weights numbers by individual digits as spoken syllables', () => {
            expect(estimateSyllableWeight('1234234')).toBe(7);
            expect(estimateSyllableWeight('123')).toBe(3);
            expect(estimateSyllableWeight('99%')).toBe(2);
        });

        it('weights Vietnamese monosyllables as 1', () => {
            expect(estimateSyllableWeight('Anh')).toBe(1);
            expect(estimateSyllableWeight('nói')).toBe(1);
            expect(estimateSyllableWeight('người')).toBe(1);
            expect(estimateSyllableWeight('thương')).toBe(1);
            expect(estimateSyllableWeight('yêu')).toBe(1);
        });

        it('weights English polysyllables by vowel clusters', () => {
            expect(estimateSyllableWeight('hello')).toBe(2);
            expect(estimateSyllableWeight('forever')).toBe(3);
        });
    });

    describe('detectVocalActivitySegments', () => {
        it('accurately identifies vocal intro silence, singing segments, and interludes from PCM', () => {
            const sampleRate = 44100;
            const totalDurationSec = 30; // 30 seconds
            const totalSamples = sampleRate * totalDurationSec;
            const left = new Float32Array(totalSamples);
            const right = new Float32Array(totalSamples);

            // Intro: 0s - 10s silence (left/right = 0)
            // Singing segment 1: 10s - 18s (sine wave amplitude 0.4)
            const seg1Start = 10 * sampleRate;
            const seg1End = 18 * sampleRate;
            for (let i = seg1Start; i < seg1End; i++) {
                const s = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.4;
                left[i] = s;
                right[i] = s;
            }

            // Interlude: 18s - 22s silence
            // Singing segment 2: 22s - 28s (sine wave amplitude 0.4)
            const seg2Start = 22 * sampleRate;
            const seg2End = 28 * sampleRate;
            for (let i = seg2Start; i < seg2End; i++) {
                const s = Math.sin((2 * Math.PI * 520 * i) / sampleRate) * 0.4;
                left[i] = s;
                right[i] = s;
            }

            const vad = detectVocalActivitySegments(left, right, sampleRate);
            expect(vad.segments.length).toBe(2);
            // Intro is properly detected: first onset must be around 10.0s, not 0s or 4s!
            expect(vad.firstVocalOnset).toBeGreaterThanOrEqual(9.8);
            expect(vad.firstVocalOnset).toBeLessThanOrEqual(10.2);
            // Total vocal duration ~ 14 seconds (8s + 6s)
            expect(vad.totalVocalDuration).toBeGreaterThanOrEqual(13.0);
            expect(vad.totalVocalDuration).toBeLessThanOrEqual(15.0);
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

        it('anchors plain text to real vocal segments skipping the intro', () => {
            const rawLyrics = '1234234 Anh nói anh hết yêu em rồi\nĐường em đi em cứ đi';
            const mockVocalActivity = {
                firstVocalOnset: 15.0,
                lastVocalOffset: 45.0,
                totalVocalDuration: 20.0,
                segments: [
                    { start: 15.0, end: 25.0, duration: 10.0, meanEnergy: 0.2 },
                    { start: 35.0, end: 45.0, duration: 10.0, meanEnergy: 0.2 },
                ],
            };

            const lines = alignLyricsTextToWords(rawLyrics, null, mockVocalActivity);
            expect(lines.length).toBe(2);

            // Line 1 MUST start at or after the intro (>= 15.0s), never at 0s or 4s!
            expect(lines[0].startTime).toBeGreaterThanOrEqual(15.0);

            const firstLineWords = lines[0].words;
            expect(firstLineWords[0].text).toBe('1234234');
            // 1234234 has weight 7 out of 14, spanning ~50% of the first segment (~5s)
            const numberDur = firstLineWords[0].endTime - firstLineWords[0].startTime;
            expect(numberDur).toBeGreaterThanOrEqual(4.0);

            // Word "Anh" starts only after 1234234 finishes, perfectly in sync with the singer
            expect(firstLineWords[1].startTime).toBeGreaterThanOrEqual(19.0);

            // Line 2 jumps over the 10-second interlude (25s - 35s) and starts at Segment 2 (>= 35.0s)!
            expect(lines[1].startTime).toBeGreaterThanOrEqual(35.0);
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
