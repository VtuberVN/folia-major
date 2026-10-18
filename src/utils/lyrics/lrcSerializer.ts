// src/utils/lyrics/lrcSerializer.ts
// Serializer and formatter for Standard LRC and Enhanced (word-by-word) LRC.
// Integrates with Folia-major's parseLRC and parseEnhancedLRC parsers.

import type { LyricLineTiming, WordTiming } from '../../types/aiKaraoke';

/**
 * Formats seconds into LRC timestamp format: `mm:ss.xx`
 * Example: 75.456 -> "01:15.45"
 */
export const formatLrcTimestamp = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '00:00.00';
    }

    const totalCentiseconds = Math.round(Math.max(0, seconds) * 100);
    const minutes = Math.floor(totalCentiseconds / 6000);
    const secs = Math.floor((totalCentiseconds % 6000) / 100);
    const centis = totalCentiseconds % 100;

    const pad = (num: number, digits: number = 2): string => String(num).padStart(digits, '0');
    return `${pad(minutes)}:${pad(secs)}.${pad(centis)}`;
};

export interface LrcMetadataOptions {
    title?: string;
    artist?: string;
    album?: string;
    creator?: string;
}

/**
 * Serializes lines into Standard LRC format:
 * [ti:Title]
 * [ar:Artist]
 * [00:12.30]Line one text
 * [00:15.80]Line two text
 */
export const serializeStandardLrc = (
    lines: LyricLineTiming[],
    metadata?: LrcMetadataOptions,
): string => {
    const header: string[] = [];
    if (metadata?.title) header.push(`[ti:${metadata.title}]`);
    if (metadata?.artist) header.push(`[ar:${metadata.artist}]`);
    if (metadata?.album) header.push(`[al:${metadata.album}]`);
    if (metadata?.creator) header.push(`[by:${metadata.creator}]`);

    const sortedLines = [...lines].sort((a, b) => a.startTime - b.startTime);
    const body = sortedLines.map((line) => {
        const timeTag = `[${formatLrcTimestamp(line.startTime)}]`;
        return `${timeTag}${line.text.trim()}`;
    });

    return [...header, ...body].join('\n');
};

/**
 * Serializes lines with word-level timings into Enhanced LRC format:
 * [00:12.30]<00:12.30>Hello <00:13.10>world <00:14.00>
 * The final closing tag `<mm:ss.xx>` marks the end time of the last word,
 * which Folia's `parseEnhancedLRC` parses into precise word start/end bounds.
 */
export const serializeEnhancedLrc = (
    lines: LyricLineTiming[],
    metadata?: LrcMetadataOptions,
): string => {
    const header: string[] = [];
    if (metadata?.title) header.push(`[ti:${metadata.title}]`);
    if (metadata?.artist) header.push(`[ar:${metadata.artist}]`);
    if (metadata?.album) header.push(`[al:${metadata.album}]`);
    if (metadata?.creator) header.push(`[by:${metadata.creator}]`);

    const sortedLines = [...lines].sort((a, b) => a.startTime - b.startTime);
    const body = sortedLines.map((line) => {
        const lineTimeTag = `[${formatLrcTimestamp(line.startTime)}]`;

        if (!line.words || line.words.length === 0) {
            return `${lineTimeTag}${line.text.trim()}`;
        }

        const sortedWords = [...line.words].sort((a, b) => a.startTime - b.startTime);
        const wordParts = sortedWords.map((w) => `<${formatLrcTimestamp(w.startTime)}>${w.text}`);
        const lastWord = sortedWords[sortedWords.length - 1];
        const endTag = `<${formatLrcTimestamp(lastWord.endTime || line.endTime)}>`;

        return `${lineTimeTag}${wordParts.join(' ')} ${endTag}`.trim();
    });

    return [...header, ...body].join('\n');
};

export interface GroupWordsOptions {
    maxWordsPerLine?: number;
    maxGapSeconds?: number;
    maxLineDurationSeconds?: number;
}

/**
 * Groups a sequence of word-level timestamps (e.g. from Whisper or ASR engine)
 * into musically natural lyric lines based on silence gaps and punctuation.
 */
export const groupWordsIntoLines = (
    words: WordTiming[],
    options: GroupWordsOptions = {},
): LyricLineTiming[] => {
    if (!words || words.length === 0) return [];

    const maxWords = options.maxWordsPerLine ?? 8;
    const maxGap = options.maxGapSeconds ?? 1.2;
    const maxLineDuration = options.maxLineDurationSeconds ?? 6.0;

    const lines: LyricLineTiming[] = [];
    let currentWords: WordTiming[] = [];

    const flushCurrentLine = () => {
        if (currentWords.length === 0) return;
        const lineStart = currentWords[0].startTime;
        const lineEnd = currentWords[currentWords.length - 1].endTime;
        const text = currentWords.map((w) => w.text.trim()).join(' ');

        lines.push({
            startTime: lineStart,
            endTime: Math.max(lineEnd, lineStart + 0.1),
            text,
            words: currentWords.map((w) => ({
                text: w.text.trim(),
                startTime: w.startTime,
                endTime: Math.max(w.endTime, w.startTime + 0.05),
            })),
        });
        currentWords = [];
    };

    for (let i = 0; i < words.length; i += 1) {
        const currentWord = words[i];
        if (!currentWord.text.trim()) continue;

        if (currentWords.length > 0) {
            const prevWord = currentWords[currentWords.length - 1];
            const gap = currentWord.startTime - prevWord.endTime;
            const currentDuration = currentWord.endTime - currentWords[0].startTime;

            const isSentenceEnd = /[.!?,\u3002\uFF0C\uFF01\uFF1F]$/.test(prevWord.text.trim());
            const hasPause = gap >= maxGap;
            const isTooLong = currentWords.length >= maxWords || currentDuration >= maxLineDuration;

            if (isSentenceEnd || hasPause || isTooLong) {
                flushCurrentLine();
            }
        }

        currentWords.push(currentWord);
    }

    flushCurrentLine();
    return lines;
};

/**
 * Normalizes text for alignment matching (removes punctuation, lowercases).
 */
const normalizeToken = (token: string): string =>
    token
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'–—…]/g, '')
        .trim();

/**
 * When raw lyric text is available (e.g. lyrics from Zing/NCT/genius or user text),
 * this aligns the existing human text with the AI-detected word timings.
 * Falls back gracefully to uniform distribution if timing count mismatches.
 */
export const alignLyricsTextToWords = (
    rawLyrics: string,
    detectedWords: WordTiming[],
): LyricLineTiming[] => {
    const rawLines = rawLyrics
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('[ti:') && !l.startsWith('[ar:') && !l.startsWith('[al:'));

    if (rawLines.length === 0) {
        return groupWordsIntoLines(detectedWords);
    }

    if (detectedWords.length === 0) {
        // Return dummy spaced lines if no words detected
        return rawLines.map((text, idx) => ({
            startTime: idx * 4,
            endTime: (idx + 1) * 4,
            text,
            words: [],
        }));
    }

    // Extract all tokens from raw lines
    const lineTokens: Array<{ lineIndex: number; tokens: string[] }> = rawLines.map((line, lineIndex) => ({
        lineIndex,
        tokens: line.split(/\s+/).filter(Boolean),
    }));

    const totalRawTokens = lineTokens.reduce((sum, item) => sum + item.tokens.length, 0);

    // If word count is reasonably proportional, map words to lines
    let wordCursor = 0;
    const result: LyricLineTiming[] = [];

    for (const item of lineTokens) {
        const lineTokenCount = item.tokens.length;
        if (lineTokenCount === 0) continue;

        // Calculate how many detected words correspond to this line
        const ratio = lineTokenCount / totalRawTokens;
        const targetWordCount = Math.max(1, Math.round(ratio * detectedWords.length));
        const wordsForThisLine = detectedWords.slice(wordCursor, wordCursor + targetWordCount);
        wordCursor += wordsForThisLine.length;

        if (wordsForThisLine.length === 0) {
            const fallbackStart = result.length > 0 ? result[result.length - 1].endTime : 0;
            result.push({
                startTime: fallbackStart,
                endTime: fallbackStart + 3,
                text: rawLines[item.lineIndex],
                words: [],
            });
            continue;
        }

        const lineStart = wordsForThisLine[0].startTime;
        const lineEnd = wordsForThisLine[wordsForThisLine.length - 1].endTime;

        // Spread the raw tokens across the line's time span
        const lineWords: WordTiming[] = [];
        const tokenDuration = (lineEnd - lineStart) / item.tokens.length;

        for (let tIdx = 0; tIdx < item.tokens.length; tIdx += 1) {
            const tokenText = item.tokens[tIdx];
            // If we have a matching detected word, use its exact timestamp; otherwise interpolate
            const detectedMatch = wordsForThisLine[tIdx];
            const start = detectedMatch ? detectedMatch.startTime : lineStart + tIdx * tokenDuration;
            const end = detectedMatch ? detectedMatch.endTime : start + tokenDuration;

            lineWords.push({
                text: tokenText,
                startTime: start,
                endTime: Math.max(end, start + 0.05),
            });
        }

        result.push({
            startTime: lineStart,
            endTime: Math.max(lineEnd, lineStart + 0.1),
            text: rawLines[item.lineIndex],
            words: lineWords,
        });
    }

    return result;
};
