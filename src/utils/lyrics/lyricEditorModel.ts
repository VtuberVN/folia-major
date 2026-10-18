// src/utils/lyrics/lyricEditorModel.ts
// Data structures and manipulation algorithms for the Visual LRC Studio.

import { formatLrcTimestamp } from './lrcSerializer';

export interface EditableLyricLine {
    id: string;
    startTime: number; // In seconds (e.g. 15.42)
    endTime?: number;
    text: string;
    translation?: string;
}

export interface LyricMetadata {
    title?: string;
    artist?: string;
    album?: string;
    by?: string;
}

const GLOBAL_LRC_TIME_REGEX = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{2,3}))?\](.*)$/;

/**
 * Parses raw LRC string into editable lines with unique IDs.
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

            // Strip any enhanced word tags (<mm:ss.xx>) from text for editing
            const cleanText = match[4].replace(/<\d{1,3}:\d{2}(?:[.:]\d{2,3})?>/g, '').trim();

            parsed.push({
                id: `line-${Date.now()}-${counter++}-${Math.random().toString(36).slice(2, 6)}`,
                startTime: Math.round(startTime * 100) / 100,
                text: cleanText,
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
 * Serializes editable lines back into a standard LRC string.
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
        body.push(`${timeTag}${line.text}`);
        if (line.translation && line.translation.trim()) {
            body.push(`${timeTag}${line.translation.trim()}`);
        }
    }

    return [...headers, ...body].join('\n');
};

/**
 * Shifts the start time of a specific line by deltaSeconds (can be negative or positive).
 */
export const shiftLineTime = (
    lines: EditableLyricLine[],
    lineId: string,
    deltaSeconds: number,
): EditableLyricLine[] => {
    return lines.map((line) => {
        if (line.id !== lineId) return line;
        const nextTime = Math.max(0, Math.round((line.startTime + deltaSeconds) * 100) / 100);
        return { ...line, startTime: nextTime };
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
        return { ...line, startTime: nextTime };
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
    return lines.map((l) => (l.id === lineId ? { ...l, text } : l));
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
