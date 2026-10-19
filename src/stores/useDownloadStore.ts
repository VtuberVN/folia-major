// src/stores/useDownloadStore.ts
// Tracks user-initiated song downloads (playlist -> files on disk) so the floating progress window
// and any other surface can render them without knowing about the download pipeline.

import { create } from 'zustand';
import type { SongResult } from '../types';
import type { AudioQualityPreference } from '../types/onlineMusic';

export type DownloadStatus = 'queued' | 'resolving' | 'downloading' | 'paused' | 'done' | 'error' | 'canceled';

export interface DownloadItem {
    id: string;
    songId: string;
    /** Display name, initially the song title, then the resolved file name. */
    name: string;
    status: DownloadStatus;
    received: number;
    total: number;
    error?: string;
    path?: string;
    /** Resolved target file name (kept so a paused transfer's ".part" can be resumed/discarded). */
    fileName?: string;
    /** Kept so a queued item can be resumed (and re-resolved) after a restart. */
    song?: SongResult;
    quality?: AudioQualityPreference;
}

type DownloadState = {
    items: DownloadItem[];
    /** Whether the floating progress window is shown. */
    visible: boolean;
    upsertItems: (items: DownloadItem[]) => void;
    patchItem: (id: string, patch: Partial<DownloadItem>) => void;
    removeItem: (id: string) => void;
    clearFinished: () => void;
    setVisible: (visible: boolean) => void;
};

export const useDownloadStore = create<DownloadState>((set) => ({
    items: [],
    visible: false,
    upsertItems: (incoming) => set((state) => {
        const map = new Map(state.items.map((item) => [item.id, item]));
        for (const item of incoming) {
            map.set(item.id, { ...map.get(item.id), ...item });
        }
        return { items: Array.from(map.values()) };
    }),
    patchItem: (id, patch) => set((state) => ({
        items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
    removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
    clearFinished: () => set((state) => ({
        items: state.items.filter((item) => (
            item.status === 'queued'
            || item.status === 'resolving'
            || item.status === 'downloading'
            || item.status === 'paused'
        )),
    })),
    setVisible: (visible) => set({ visible }),
}));

export const setDownloadsVisible = (visible: boolean) =>
    useDownloadStore.getState().setVisible(visible);
