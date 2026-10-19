import { describe, expect, it, beforeEach } from 'vitest';
import { useDownloadStore, setDownloadsVisible, type DownloadItem } from '@/stores/useDownloadStore';

describe('useDownloadStore', () => {
    beforeEach(() => {
        useDownloadStore.setState({ items: [], visible: false });
    });

    it('initializes with empty items and hidden window', () => {
        const state = useDownloadStore.getState();
        expect(state.items).toEqual([]);
        expect(state.visible).toBe(false);
    });

    it('upserts new download items and updates existing items', () => {
        const item1: DownloadItem = {
            id: 'dl-1',
            songId: 'song-101',
            name: 'Song One',
            status: 'queued',
            received: 0,
            total: 1000,
        };

        useDownloadStore.getState().upsertItems([item1]);
        expect(useDownloadStore.getState().items).toHaveLength(1);
        expect(useDownloadStore.getState().items[0].name).toBe('Song One');

        // Upsert with updated status
        useDownloadStore.getState().upsertItems([{
            ...item1,
            status: 'downloading',
            received: 500,
        }]);

        const updated = useDownloadStore.getState().items;
        expect(updated).toHaveLength(1);
        expect(updated[0].status).toBe('downloading');
        expect(updated[0].received).toBe(500);
    });

    it('patches an existing item correctly', () => {
        useDownloadStore.getState().upsertItems([
            { id: 'dl-1', songId: 's1', name: 'Song 1', status: 'queued', received: 0, total: 100 },
        ]);

        useDownloadStore.getState().patchItem('dl-1', { received: 80, status: 'downloading' });
        const item = useDownloadStore.getState().items[0];
        expect(item.received).toBe(80);
        expect(item.status).toBe('downloading');
    });

    it('removes item by id', () => {
        useDownloadStore.getState().upsertItems([
            { id: 'dl-1', songId: 's1', name: 'Song 1', status: 'queued', received: 0, total: 100 },
            { id: 'dl-2', songId: 's2', name: 'Song 2', status: 'queued', received: 0, total: 100 },
        ]);

        useDownloadStore.getState().removeItem('dl-1');
        expect(useDownloadStore.getState().items).toHaveLength(1);
        expect(useDownloadStore.getState().items[0].id).toBe('dl-2');
    });

    it('clears only finished/errored/canceled items, preserving in-flight or queued items', () => {
        useDownloadStore.getState().upsertItems([
            { id: 'dl-1', songId: 's1', name: 'Song 1', status: 'done', received: 100, total: 100 },
            { id: 'dl-2', songId: 's2', name: 'Song 2', status: 'downloading', received: 50, total: 100 },
            { id: 'dl-3', songId: 's3', name: 'Song 3', status: 'queued', received: 0, total: 100 },
            { id: 'dl-4', songId: 's4', name: 'Song 4', status: 'paused', received: 20, total: 100 },
            { id: 'dl-5', songId: 's5', name: 'Song 5', status: 'error', received: 0, total: 100 },
            { id: 'dl-6', songId: 's6', name: 'Song 6', status: 'canceled', received: 0, total: 100 },
        ]);

        useDownloadStore.getState().clearFinished();
        const remaining = useDownloadStore.getState().items;
        expect(remaining.map((item) => item.id)).toEqual(['dl-2', 'dl-3', 'dl-4']);
    });

    it('toggles visibility via setDownloadsVisible', () => {
        expect(useDownloadStore.getState().visible).toBe(false);
        setDownloadsVisible(true);
        expect(useDownloadStore.getState().visible).toBe(true);
        setDownloadsVisible(false);
        expect(useDownloadStore.getState().visible).toBe(false);
    });
});
