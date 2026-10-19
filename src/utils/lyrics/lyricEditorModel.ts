// src/utils/lyrics/lyricEditorModel.ts
// Data structures and manipulation algorithms for the Visual LRC Studio.

import { formatLrcTimestamp } from './lrcSerializer';

export interface EditableLyricWord {
    text: string;
    startTime: number; // in seconds
    endTime?: number;
}

export interface EditableLyricLine {
    id: string;
    startTime: number; // In seconds (e.g. 15.42)
    endTime?: number;
    text: string;
    translation?: string;
    words?: EditableLyricWord[];
}

export interface LyricMetadata {
    title?: string;
    artist?: string;
    album?: string;
    by?: string;
}

const GLOBAL_LRC_TIME_REGEX = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?\](.*)$/;

/**
 * Parses raw LRC string into editable lines with unique IDs, preserving word-level timings if present.
 */
export const rawLrcToEditableLines = (rawLrc: string): EditableLyricLine[] => {
    if (!rawLrc || !rawLrc.trim()) return [];

    const rawLines = rawLrc.split(/\r?\n/);
    const parsed: EditableLyricLine[] = [];
    let counter = 0;

    for (const rawLine of rawLines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;

        // Skip metadata tags like [ti:], [ar:], etc.
        if (/^\[(ti|ar|al|by|offset|length):/i.test(trimmed)) {
            continue;
        }

        const match = trimmed.match(GLOBAL_LRC_TIME_REGEX);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const fraction = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0;
            const startTime = minutes * 60 + seconds + fraction;

            const content = match[4].trim();
            const wordRegex = /<(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?>([^<]*)/g;
            const words: EditableLyricWord[] = [];
            let wordMatch;
            let lastEnd: number | undefined;

            while ((wordMatch = wordRegex.exec(content)) !== null) {
                const wMin = parseInt(wordMatch[1], 10);
                const wSec = parseInt(wordMatch[2], 10);
                const wFrac = wordMatch[3] ? parseInt(wordMatch[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0;
                const wTime = Math.round((wMin * 60 + wSec + wFrac) * 100) / 100;
                const wText = wordMatch[4].trim();
                if (wText) {
                    words.push({
                        text: wText,
                        startTime: wTime,
                    });
                } else {
                    lastEnd = wTime;
                }
            }

            for (let i = 0; i < words.length - 1; i++) {
                words[i].endTime = words[i + 1].startTime;
            }
            if (words.length > 0 && lastEnd !== undefined) {
                words[words.length - 1].endTime = lastEnd;
            }

            // Clean plain text without <...> tags
            const cleanText = content.replace(/<\d{1,3}:\d{2}(?:[.:]\d{2,3})?>/g, '').trim();

            parsed.push({
                id: `line-${Date.now()}-${counter++}-${Math.random().toString(36).slice(2, 6)}`,
                startTime: Math.round(startTime * 100) / 100,
                endTime: lastEnd,
                text: cleanText,
                words: words.length > 0 ? words : undefined,
            });
        } else if (parsed.length > 0 && !trimmed.startsWith('[')) {
            // Might be a translation or continuation line
            const last = parsed[parsed.length - 1];
            if (!last.translation) {
                last.translation = trimmed;
            } else {
                last.translation += ` ${trimmed}`;
            }
        }
    }

    return parsed.sort((a, b) => a.startTime - b.startTime);
};

/**
 * Serializes editable lines back into an LRC string.
 * Preserves Enhanced LRC word-level timestamps when available.
 */
export const editableLinesToLrc = (
    lines: EditableLyricLine[],
    metadata?: LyricMetadata,
): string => {
    const headers: string[] = [];
    if (metadata?.title) headers.push(`[ti:${metadata.title}]`);
    if (metadata?.artist) headers.push(`[ar:${metadata.artist}]`);
    if (metadata?.album) headers.push(`[al:${metadata.album}]`);
    if (metadata?.by) headers.push(`[by:${metadata.by}]`);

    const sorted = [...lines].sort((a, b) => a.startTime - b.startTime);
    const body: string[] = [];

    for (const line of sorted) {
        const timeTag = `[${formatLrcTimestamp(line.startTime)}]`;
        if (line.words && line.words.length > 0) {
            const wordParts = line.words.map((w) => `<${formatLrcTimestamp(w.startTime)}>${w.text}`);
            const lastWord = line.words[line.words.length - 1];
            const endTag = `<${formatLrcTimestamp(lastWord.endTime || (line.endTime || lastWord.startTime + 0.4))}>`;
            body.push(`${timeTag}${wordParts.join(' ')} ${endTag}`.trim());
        } else {
            body.push(`${timeTag}${line.text}`);
        }
        if (line.translation && line.translation.trim()) {
            body.push(`${timeTag}${line.translation.trim()}`);
        }
    }

    return [...headers, ...body].join('\n');
};

/**
 * Shifts the start time of a specific line by deltaSeconds (can be negative or positive),
 * and shifts word-level timestamps accordingly.
 */
export const shiftLineTime = (
    lines: EditableLyricLine[],
    lineId: string,
    deltaSeconds: number,
): EditableLyricLine[] => {
    return lines.map((line) => {
        if (line.id !== lineId) return line;
        const nextTime = Math.max(0, Math.round((line.startTime + deltaSeconds) * 100) / 100);
        const words = line.words?.map((w) => ({
            ...w,
            startTime: Math.max(0, Math.round((w.startTime + deltaSeconds) * 100) / 100),
            endTime: w.endTime !== undefined ? Math.max(0, Math.round((w.endTime + deltaSeconds) * 100) / 100) : undefined,
        }));
        return {
            ...line,
            startTime: nextTime,
            endTime: line.endTime !== undefined ? Math.max(0, Math.round((line.endTime + deltaSeconds) * 100) / 100) : undefined,
            words,
        };
    });
};

/**
 * Shifts all lines from fromIndex onwards by deltaSeconds.
 */
export const shiftAllLinesTime = (
    lines: EditableLyricLine[],
    fromIndex: number,
    deltaSeconds: number,
): EditableLyricLine[] => {
    return lines.map((line, idx) => {
        if (idx < fromIndex) return line;
        const nextTime = Math.max(0, Math.round((line.startTime + deltaSeconds) * 100) / 100);
        const words = line.words?.map((w) => ({
            ...w,
            startTime: Math.max(0, Math.round((w.startTime + deltaSeconds) * 100) / 100),
            endTime: w.endTime !== undefined ? Math.max(0, Math.round((w.endTime + deltaSeconds) * 100) / 100) : undefined,
        }));
        return {
            ...line,
            startTime: nextTime,
            endTime: line.endTime !== undefined ? Math.max(0, Math.round((line.endTime + deltaSeconds) * 100) / 100) : undefined,
            words,
        };
    });
};

/**
 * Inserts a new blank line immediately following afterIndex.
 */
export const insertLineAfter = (
    lines: EditableLyricLine[],
    afterIndex: number,
): EditableLyricLine[] => {
    const prev = lines[afterIndex];
    const next = lines[afterIndex + 1];

    let newStartTime = prev ? prev.startTime + 2.0 : 0;
    if (prev && next) {
        newStartTime = Math.round(((prev.startTime + next.startTime) / 2) * 100) / 100;
    }

    const newLine: EditableLyricLine = {
        id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        startTime: newStartTime,
        text: '',
    };

    const copy = [...lines];
    copy.splice(afterIndex + 1, 0, newLine);
    return copy;
};

/**
 * Deletes a line by its ID.
 */
export const deleteLine = (
    lines: EditableLyricLine[],
    lineId: string,
): EditableLyricLine[] => {
    return lines.filter((l) => l.id !== lineId);
};

/**
 * Updates text of a line.
 */
export const updateLineText = (
    lines: EditableLyricLine[],
    lineId: string,
    text: string,
): EditableLyricLine[] => {
    return lines.map((l) => {
        if (l.id !== lineId) return l;
        if (!l.words || l.words.length === 0) {
            return { ...l, text };
        }
        const tokens = text.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) {
            return { ...l, text, words: undefined };
        }
        if (tokens.length === l.words.length) {
            const updatedWords = l.words.map((w, i) => ({ ...w, text: tokens[i] }));
            return { ...l, text, words: updatedWords };
        }
        const totalDuration = (l.endTime && l.endTime > l.startTime)
            ? (l.endTime - l.startTime)
            : Math.max(1.0, (l.words[l.words.length - 1].endTime || (l.words[l.words.length - 1].startTime + 0.4)) - l.startTime);
        const step = totalDuration / tokens.length;
        const updatedWords = tokens.map((token, i) => ({
            text: token,
            startTime: Math.round((l.startTime + i * step) * 100) / 100,
            endTime: Math.round((l.startTime + (i + 1) * step) * 100) / 100,
        }));
        return { ...l, text, words: updatedWords };
    });
};

/**
 * Updates translation text of a line.
 */
export const updateLineTranslation = (
    lines: EditableLyricLine[],
    lineId: string,
    translation: string,
): EditableLyricLine[] => {
    return lines.map((l) => (l.id === lineId ? { ...l, translation } : l));
};

/**
 * Splits a line into two lines at a character index.
 */
export const splitLineAt = (
    lines: EditableLyricLine[],
    lineId: string,
    charIndex: number,
): EditableLyricLine[] => {
    const targetIdx = lines.findIndex((l) => l.id === lineId);
    if (targetIdx === -1) return lines;

    const target = lines[targetIdx];
    const firstPart = target.text.slice(0, charIndex).trim();
    const secondPart = target.text.slice(charIndex).trim();

    const nextLineTime = target.startTime + 1.5;
    const secondLine: EditableLyricLine = {
        id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        startTime: nextLineTime,
        text: secondPart,
    };

    const updatedTarget: EditableLyricLine = {
        ...target,
        text: firstPart,
    };

    const copy = [...lines];
    copy.splice(targetIdx, 1, updatedTarget, secondLine);
    return copy;
};

/**
 * Merges a line with the following line.
 */
export const mergeLineWithNext = (
    lines: EditableLyricLine[],
    lineId: string,
): EditableLyricLine[] => {
    const targetIdx = lines.findIndex((l) => l.id === lineId);
    if (targetIdx === -1 || targetIdx >= lines.length - 1) return lines;

    const current = lines[targetIdx];
    const next = lines[targetIdx + 1];

    const mergedLine: EditableLyricLine = {
        ...current,
        text: `${current.text} ${next.text}`.trim(),
        translation: [current.translation, next.translation].filter(Boolean).join(' ') || undefined,
    };

    const copy = [...lines];
    copy.splice(targetIdx, 2, mergedLine);
    return copy;
};
