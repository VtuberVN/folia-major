// test/unit/lyrics/lyricEditorModel.test.ts
import { describe, it, expect } from 'vitest';
import {
    rawLrcToEditableLines,
    editableLinesToLrc,
    shiftLineTime,
    shiftAllLinesTime,
    insertLineAfter,
    deleteLine,
    updateLineText,
    splitLineAt,
    mergeLineWithNext,
} from '../../../src/utils/lyrics/lyricEditorModel';

describe('lyricEditorModel', () => {
    const sampleLrc = `[ti:Test Title]
[ar:Test Artist]
[00:10.50]Hello world
[00:15.00]Second line here
[00:22.30]Third line ending`;

    it('parses raw LRC into editable lines and ignores metadata headers', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        expect(lines).toHaveLength(3);
        expect(lines[0].text).toBe('Hello world');
        expect(lines[0].startTime).toBe(10.5);
        expect(lines[1].text).toBe('Second line here');
        expect(lines[1].startTime).toBe(15.0);
        expect(lines[2].text).toBe('Third line ending');
        expect(lines[2].startTime).toBe(22.3);
    });

    it('serializes editable lines back to valid LRC format', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        const lrc = editableLinesToLrc(lines, { title: 'Custom Song', artist: 'Custom Artist' });
        expect(lrc).toContain('[ti:Custom Song]');
        expect(lrc).toContain('[ar:Custom Artist]');
        expect(lrc).toContain('[00:10.50]Hello world');
        expect(lrc).toContain('[00:15.00]Second line here');
    });

    it('shifts individual line time with shiftLineTime', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        const shifted = shiftLineTime(lines, lines[0].id, 0.5);
        expect(shifted[0].startTime).toBe(11.0);
        expect(shifted[1].startTime).toBe(15.0);
    });

    it('does not allow start time below zero', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        const shifted = shiftLineTime(lines, lines[0].id, -20.0);
        expect(shifted[0].startTime).toBe(0);
    });

    it('shifts all lines fromIndex onwards', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        const shifted = shiftAllLinesTime(lines, 1, 2.0);
        expect(shifted[0].startTime).toBe(10.5);
        expect(shifted[1].startTime).toBe(17.0);
        expect(shifted[2].startTime).toBe(24.3);
    });

    it('inserts a new line between existing lines', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        const withInserted = insertLineAfter(lines, 0);
        expect(withInserted).toHaveLength(4);
        expect(withInserted[1].startTime).toBe(12.75); // Midpoint of 10.5 and 15.0
        expect(withInserted[1].text).toBe('');
    });

    it('deletes a line by id', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        const remaining = deleteLine(lines, lines[1].id);
        expect(remaining).toHaveLength(2);
        expect(remaining[0].text).toBe('Hello world');
        expect(remaining[1].text).toBe('Third line ending');
    });

    it('updates text of a line', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        const updated = updateLineText(lines, lines[0].id, 'Hello brand new world');
        expect(updated[0].text).toBe('Hello brand new world');
    });

    it('splits a line at character position', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        const split = splitLineAt(lines, lines[0].id, 5);
        expect(split).toHaveLength(4);
        expect(split[0].text).toBe('Hello');
        expect(split[1].text).toBe('world');
    });

    it('merges a line with the next line', () => {
        const lines = rawLrcToEditableLines(sampleLrc);
        const merged = mergeLineWithNext(lines, lines[0].id);
        expect(merged).toHaveLength(2);
        expect(merged[0].text).toBe('Hello world Second line here');
        expect(merged[1].text).toBe('Third line ending');
    });
});
