// src/stores/useLrcEditorStore.ts
// Store for Visual LRC Studio, managing lines, history stack (undo/redo), and tap-to-sync state.

import { create } from 'zustand';
import type { SongResult } from '../types';
import {
    type EditableLyricLine,
    type LyricMetadata,
    rawLrcToEditableLines,
    editableLinesToLrc,
} from '../utils/lyrics/lyricEditorModel';

const MAX_HISTORY_STEPS = 30;

interface LrcEditorState {
    isOpen: boolean;
    song: SongResult | null;
    lines: EditableLyricLine[];
    activeLineIndex: number;
    isTapSyncActive: boolean;
    viewMode: 'table' | 'raw';
    metadata: LyricMetadata;
    history: {
        past: EditableLyricLine[][];
        future: EditableLyricLine[][];
    };

    openEditor: (song?: SongResult | null, initialLrc?: string) => void;
    closeEditor: () => void;
    setViewMode: (mode: 'table' | 'raw') => void;
    setLines: (lines: EditableLyricLine[], pushHistory?: boolean) => void;
    setActiveLineIndex: (index: number) => void;
    setIsTapSyncActive: (active: boolean) => void;
    undo: () => void;
    redo: () => void;
    stampCurrentLineTime: (currentTimeSeconds: number) => void;
    getSerializedLrc: () => string;
}

export const useLrcEditorStore = create<LrcEditorState>((set, get) => ({
    isOpen: false,
    song: null,
    lines: [],
    activeLineIndex: 0,
    isTapSyncActive: false,
    viewMode: 'table',
    metadata: {},
    history: {
        past: [],
        future: [],
    },

    openEditor: (song = null, initialLrc = '') => {
        const parsedLines = rawLrcToEditableLines(initialLrc || '');
        const artist = song?.artists?.map((a) => a.name).join(', ') || (song as any)?.artist || '';
        const title = song?.name || (song as any)?.title || '';

        set({
            isOpen: true,
            song,
            lines: parsedLines,
            activeLineIndex: 0,
            isTapSyncActive: false,
            viewMode: 'table',
            metadata: { title, artist },
            history: { past: [], future: [] },
        });
    },

    closeEditor: () => set({ isOpen: false, isTapSyncActive: false }),

    setViewMode: (viewMode) => set({ viewMode }),

    setLines: (nextLines, pushHistory = true) => {
        const { lines, history } = get();
        if (pushHistory) {
            const nextPast = [...history.past, lines].slice(-MAX_HISTORY_STEPS);
            set({
                lines: nextLines,
                history: { past: nextPast, future: [] },
            });
        } else {
            set({ lines: nextLines });
        }
    },

    setActiveLineIndex: (activeLineIndex) => set({ activeLineIndex }),

    setIsTapSyncActive: (isTapSyncActive) => set({ isTapSyncActive }),

    undo: () => {
        const { lines, history } = get();
        if (history.past.length === 0) return;

        const previous = history.past[history.past.length - 1];
        const nextPast = history.past.slice(0, -1);
        const nextFuture = [lines, ...history.future].slice(0, MAX_HISTORY_STEPS);

        set({
            lines: previous,
            history: { past: nextPast, future: nextFuture },
        });
    },

    redo: () => {
        const { lines, history } = get();
        if (history.future.length === 0) return;

        const next = history.future[0];
        const nextFuture = history.future.slice(1);
        const nextPast = [...history.past, lines].slice(-MAX_HISTORY_STEPS);

        set({
            lines: next,
            history: { past: nextPast, future: nextFuture },
        });
    },

    stampCurrentLineTime: (currentTimeSeconds) => {
        const { lines, activeLineIndex, setLines } = get();
        if (activeLineIndex < 0 || activeLineIndex >= lines.length) return;

        const roundedTime = Math.max(0, Math.round(currentTimeSeconds * 100) / 100);
        const updated = lines.map((l, i) => (i === activeLineIndex ? { ...l, startTime: roundedTime } : l));

        setLines(updated, true);

        // Advance to next line if available
        if (activeLineIndex < lines.length - 1) {
            set({ activeLineIndex: activeLineIndex + 1 });
        }
    },

    getSerializedLrc: () => {
        const { lines, metadata } = get();
        return editableLinesToLrc(lines, metadata);
    },
}));

export const openVisualLrcEditor = (song?: SongResult | null, initialLrc?: string) => {
    useLrcEditorStore.getState().openEditor(song, initialLrc);
};
