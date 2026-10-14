import { describe, expect, it } from 'vitest';
import { findLatestActiveLineIndex } from '../../../src/utils/appPlaybackHelpers';
import { buildMonetDisplayTokens } from '../../../src/components/visualizer/monet/monetLyricsModel';
import type { LyricData } from '../../../src/types';

// test/unit/lyrics/miniLyricBar.test.ts
// Unit tests for Desktop Mini Lyric Bar logic

describe('Desktop Mini Lyric Bar', () => {
    const sampleLyrics: LyricData = {
        lines: [
            {
                startTime: 10,
                endTime: 15,
                fullText: 'Hello world from Folia',
                translation: 'Xin chao the gioi tu Folia',
                words: [
                    { text: 'Hello ', startTime: 10, endTime: 11.5 },
                    { text: 'world ', startTime: 11.5, endTime: 13 },
                    { text: 'from ', startTime: 13, endTime: 14 },
                    { text: 'Folia', startTime: 14, endTime: 15 },
                ],
            },
            {
                startTime: 16,
                endTime: 20,
                fullText: 'Singing in the rain',
                romanization: 'Hát dưới mưa',
                words: [],
            },
        ],
    };

    it('identifies the active line by current playback timestamp', () => {
        // Before first line
        expect(findLatestActiveLineIndex(sampleLyrics.lines, 5)).toBe(-1);

        // During first line
        expect(findLatestActiveLineIndex(sampleLyrics.lines, 12)).toBe(0);

        // Gap between lines
        expect(findLatestActiveLineIndex(sampleLyrics.lines, 15.5)).toBe(-1);

        // During second line
        expect(findLatestActiveLineIndex(sampleLyrics.lines, 18)).toBe(1);
    });

    it('handles secondary lyrics (translation or romanization)', () => {
        const line1 = sampleLyrics.lines[0];
        const line2 = sampleLyrics.lines[1];

        const secondary1 = line1.translation || line1.romanization || null;
        expect(secondary1).toBe('Xin chao the gioi tu Folia');

        const secondary2 = line2.translation || line2.romanization || null;
        expect(secondary2).toBe('Hát dưới mưa');
    });

    it('calculates word-level progress accurately', () => {
        const word = sampleLyrics.lines[0].words![0]; // 10 -> 11.5
        const clamp = (v: number) => Math.max(0, Math.min(100, v));

        // Before word
        const progBefore = clamp(((9 - word.startTime) / (word.endTime - word.startTime)) * 100);
        expect(progBefore).toBe(0);

        // Halfway through word
        const progMid = clamp(((10.75 - word.startTime) / (word.endTime - word.startTime)) * 100);
        expect(progMid).toBe(50);

        // Past word
        const progAfter = clamp(((12 - word.startTime) / (word.endTime - word.startTime)) * 100);
        expect(progAfter).toBe(100);
    });

    it('detects miniLyric search parameter surface correctly', () => {
        const paramsWithMiniLyric = new URLSearchParams('?miniLyric=1');
        const isMiniLyric = paramsWithMiniLyric.get('miniLyric') === '1';
        expect(isMiniLyric).toBe(true);

        const paramsNormal = new URLSearchParams('');
        expect(paramsNormal.get('miniLyric') === '1').toBe(false);
    });

    it('determines when words need typography spacing between spans', () => {
        const words = [
            { text: 'Vì', startTime: 1, endTime: 2 },
            { text: 'em', startTime: 2, endTime: 3 },
            { text: 'đã', startTime: 3, endTime: 4 },
        ];
        const fullText = 'Vì em đã';
        const shouldAddMargin = (wIdx: number) => {
            const isLast = wIdx === words.length - 1;
            const hasExplicitSpace = words[wIdx].text.endsWith(' ') || Boolean(words[wIdx + 1]?.text.startsWith(' '));
            const isCjk = /^[\u4e00-\u9fa5\u3040-\u30ff]/.test(words[wIdx].text);
            const fullTextHasSpaces = fullText.includes(' ');
            return !isLast && !hasExplicitSpace && (fullTextHasSpaces || !isCjk);
        };
        expect(shouldAddMargin(0)).toBe(true);
        expect(shouldAddMargin(1)).toBe(true);
        expect(shouldAddMargin(2)).toBe(false);
    });

    it('preserves spaces and delimiters between timed words using buildMonetDisplayTokens', () => {
        // Vietnamese lyric with word-by-word timestamps
        const lineVi = {
            startTime: 1,
            endTime: 5,
            fullText: 'Nay anh đòi quay lại',
            words: [
                { text: 'Nay', startTime: 1, endTime: 1.5 },
                { text: 'anh', startTime: 1.6, endTime: 2.2 },
                { text: 'đòi', startTime: 2.3, endTime: 3.0 },
                { text: 'quay', startTime: 3.1, endTime: 3.8 },
                { text: 'lại', startTime: 3.9, endTime: 4.8 },
            ],
        };

        const tokensVi = buildMonetDisplayTokens(lineVi);
        // Concatenating tokens reproduces fullText with real spaces exactly
        expect(tokensVi.map(t => t.text).join('')).toBe('Nay anh đòi quay lại');
        // Contains static space tokens
        const spaceTokens = tokensVi.filter(t => !t.timed);
        expect(spaceTokens.length).toBe(4);
        expect(spaceTokens.every(t => t.text === ' ')).toBe(true);

        // CJK lyric without spaces
        const lineZh = {
            startTime: 1,
            endTime: 5,
            fullText: '我们曾经相爱',
            words: [
                { text: '我们', startTime: 1, endTime: 2 },
                { text: '曾经', startTime: 2, endTime: 3.5 },
                { text: '相爱', startTime: 3.5, endTime: 5 },
            ],
        };
        const tokensZh = buildMonetDisplayTokens(lineZh);
        expect(tokensZh.map(t => t.text).join('')).toBe('我们曾经相爱');
        expect(tokensZh.filter(t => !t.timed).length).toBe(0);
    });

    it('determines control mode: only lock icon when locked, full toolbar when unlocked', () => {
        const resolveVisibleControls = (isClickThrough: boolean, isHovered: boolean) => {
            if (isClickThrough) {
                // When locked, only lock icon is shown on hover, no playback action buttons
                return {
                    showActionToolbar: false,
                    showLockOnly: isHovered,
                };
            }
            // When unlocked, full action toolbar is shown on hover
            return {
                showActionToolbar: isHovered,
                showLockOnly: false,
            };
        };

        // When locked and hovered: only lock icon is visible, action buttons are hidden
        expect(resolveVisibleControls(true, true)).toEqual({
            showActionToolbar: false,
            showLockOnly: true,
        });

        // When locked and not hovered: nothing visible (clean lyrics display)
        expect(resolveVisibleControls(true, false)).toEqual({
            showActionToolbar: false,
            showLockOnly: false,
        });

        // When unlocked and hovered: full toolbar visible
        expect(resolveVisibleControls(false, true)).toEqual({
            showActionToolbar: true,
            showLockOnly: false,
        });

        // When unlocked and not hovered: toolbar hidden
        expect(resolveVisibleControls(false, false)).toEqual({
            showActionToolbar: false,
            showLockOnly: false,
        });
    });
});

