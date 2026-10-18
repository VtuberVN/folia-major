// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { useLrcEditorStore, openVisualLrcEditor } from '@/stores/useLrcEditorStore';
import type { SongResult } from '@/types';

describe('useLrcEditorStore', () => {
    beforeEach(() => {
        useLrcEditorStore.setState({
            isOpen: false,
            song: null,
            lines: [],
            activeLineIndex: 0,
            isTapSyncActive: false,
            viewMode: 'table',
            metadata: {},
            history: { past: [], future: [] },
        });
    });

    it('initializes with closed state', () => {
        const state = useLrcEditorStore.getState();
        expect(state.isOpen).toBe(false);
        expect(state.lines).toEqual([]);
    });

    it('opens editor and parses raw LRC into lines', () => {
        const song: SongResult = {
            id: 'song-1',
            name: 'Sample Song',
            artists: [{ id: 1, name: 'Sample Artist' }],
            album: { id: 1, name: 'Sample Album' },
            durationMs: 200000,
        };
        const rawLrc = `[00:10.00]Line one\n[00:20.00]Line two`;

        openVisualLrcEditor(song, rawLrc);

        const state = useLrcEditorStore.getState();
        expect(state.isOpen).toBe(true);
        expect(state.song?.name).toBe('Sample Song');
        expect(state.lines).toHaveLength(2);
        expect(state.lines[0].text).toBe('Line one');
        expect(state.lines[0].startTime).toBe(10);
        expect(state.lines[1].text).toBe('Line two');
        expect(state.lines[1].startTime).toBe(20);
    });

    it('stamps current time and advances to next line in tap-to-sync', () => {
        const rawLrc = `[00:00.00]First\n[00:00.00]Second`;
        openVisualLrcEditor(null, rawLrc);

        const store = useLrcEditorStore.getState();
        store.stampCurrentLineTime(14.85);

        const afterFirst = useLrcEditorStore.getState();
        expect(afterFirst.lines[0].startTime).toBe(14.85);
        expect(afterFirst.activeLineIndex).toBe(1);

        store.stampCurrentLineTime(22.3);
        const afterSecond = useLrcEditorStore.getState();
        expect(afterSecond.lines[1].startTime).toBe(22.3);
        expect(afterSecond.activeLineIndex).toBe(1); // last line
    });

    it('supports undo and redo', () => {
        const rawLrc = `[00:05.00]Original`;
        openVisualLrcEditor(null, rawLrc);

        const store = useLrcEditorStore.getState();
        store.setLines([{ id: '1', startTime: 10, text: 'Modified' }], true);

        expect(useLrcEditorStore.getState().lines[0].text).toBe('Modified');

        store.undo();
        expect(useLrcEditorStore.getState().lines[0].text).toBe('Original');

        store.redo();
        expect(useLrcEditorStore.getState().lines[0].text).toBe('Modified');
    });
});
