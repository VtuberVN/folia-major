// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    fetchAiModels,
    downloadAiModel,
    deleteAiModel,
    startKaraokeJob,
    cancelCurrentKaraokeJob,
    exportKaraokeLrcFile,
} from '@/services/aiKaraokeService';
import { useAiKaraokeStore } from '@/stores/useAiKaraokeStore';
import type { SongResult } from '@/types';

describe('aiKaraokeService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        useAiKaraokeStore.setState({
            activeJobId: null,
            models: [],
        });
    });

    it('fetches AI models and populates the store', async () => {
        const mockModels = [
            {
                id: 'uvr_mdxnet_kara_2',
                name: 'UVR-MDX-Net',
                category: 'mss' as const,
                fileName: 'UVR_MDXNET_KARA_2.onnx',
                fileSizeMb: 66.8,
                recommendedVram: '2GB',
                typicalSpeed: '8s',
                description: 'test',
                descriptionVi: 'test',
                downloadUrl: 'url',
                isDownloaded: true,
            },
        ];

        window.electron = {
            ...window.electron,
            // @ts-expect-error test mock
            aiKaraoke: {
                getModels: vi.fn().mockResolvedValue(mockModels),
            },
        };

        const res = await fetchAiModels();
        expect(res).toEqual(mockModels);
        expect(useAiKaraokeStore.getState().models).toEqual(mockModels);
    });

    it('downloads model and updates progress', async () => {
        const downloadModelMock = vi.fn().mockResolvedValue({ success: true, localPath: '/path' });
        const getModelsMock = vi.fn().mockResolvedValue([]);

        window.electron = {
            ...window.electron,
            // @ts-expect-error test mock
            aiKaraoke: {
                downloadModel: downloadModelMock,
                getModels: getModelsMock,
            },
        };

        const success = await downloadAiModel('uvr_mdxnet_kara_2');
        expect(success).toBe(true);
        expect(downloadModelMock).toHaveBeenCalledWith('uvr_mdxnet_kara_2');
    });

    it('deletes model via bridge', async () => {
        const deleteModelMock = vi.fn().mockResolvedValue({ removed: true });
        window.electron = {
            ...window.electron,
            // @ts-expect-error test mock
            aiKaraoke: {
                deleteModel: deleteModelMock,
                getModels: vi.fn().mockResolvedValue([]),
            },
        };

        const deleted = await deleteAiModel('kim_vocal_2');
        expect(deleted).toBe(true);
        expect(deleteModelMock).toHaveBeenCalledWith('kim_vocal_2');
    });

    it('starts karaoke job and sets result in store', async () => {
        const mockResult = {
            songId: 'song-1',
            songTitle: 'Test Song',
            artist: 'Test Artist',
            lrcText: '[00:01.00]Hello',
            enhancedLrcText: '[00:01.00]<00:01.00>Hello <00:02.00>',
            lines: [],
            duration: 180,
            mssModelUsed: 'uvr_mdxnet_kara_2' as const,
            asrModelUsed: 'whisper_turbo' as const,
            alignmentMode: 'align_existing' as const,
            generatedAt: 123456789,
        };

        const startJobMock = vi.fn().mockResolvedValue(mockResult);

        window.electron = {
            ...window.electron,
            // @ts-expect-error test mock
            aiKaraoke: {
                startJob: startJobMock,
            },
        };

        const song: SongResult = {
            id: 'song-1',
            name: 'Test Song',
            artists: [{ id: 0, name: 'Test Artist' }],
            album: { id: 0, name: 'Test Album' },
            durationMs: 180000,
        };

        const result = await startKaraokeJob({ song });
        expect(result).toEqual(mockResult);
        expect(useAiKaraokeStore.getState().lastResult).toEqual(mockResult);
    });

    it('cancels active karaoke job', async () => {
        const cancelJobMock = vi.fn().mockResolvedValue({ canceled: true });
        window.electron = {
            ...window.electron,
            // @ts-expect-error test mock
            aiKaraoke: {
                cancelJob: cancelJobMock,
            },
        };

        useAiKaraokeStore.getState().setActiveJobId('job-123');
        const canceled = await cancelCurrentKaraokeJob();
        expect(canceled).toBe(true);
        expect(cancelJobMock).toHaveBeenCalledWith('job-123');
        expect(useAiKaraokeStore.getState().activeJobId).toBeNull();
    });

    it('exports karaoke lrc file', async () => {
        const exportLrcMock = vi.fn().mockResolvedValue({ ok: true, filePath: 'c:/lyrics.lrc' });
        window.electron = {
            ...window.electron,
            // @ts-expect-error test mock
            aiKaraoke: {
                exportLrcFile: exportLrcMock,
            },
        };

        const ok = await exportKaraokeLrcFile('[00:00.00]Hello', 'test.lrc');
        expect(ok).toBe(true);
        expect(exportLrcMock).toHaveBeenCalledWith({
            content: '[00:00.00]Hello',
            defaultFileName: 'test.lrc',
        });
    });
});
