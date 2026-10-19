// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { useAiKaraokeStore, openAiKaraokeModal } from '@/stores/useAiKaraokeStore';
import type { SongResult } from '@/types';
import type { AiModelInfo } from '@/types/aiKaraoke';

describe('useAiKaraokeStore', () => {
    beforeEach(() => {
        useAiKaraokeStore.setState({
            isOpen: false,
            activeSong: null,
            models: [],
            selectedMssModel: 'uvr_mdxnet_kara_2',
            selectedAsrModel: 'whisper_turbo',
            alignmentMode: 'align_existing',
            rawLyricsText: '',
            jobStage: 'idle',
            jobProgress: 0,
            jobMessage: '',
            jobDetail: '',
            elapsedSeconds: 0,
            activeJobId: null,
            lastResult: null,
        });
    });

    it('initializes with default closed state and default models', () => {
        const state = useAiKaraokeStore.getState();
        expect(state.isOpen).toBe(false);
        expect(state.selectedMssModel).toBe('uvr_mdxnet_kara_2');
        expect(state.selectedAsrModel).toBe('whisper_turbo');
        expect(state.alignmentMode).toBe('align_existing');
    });

    it('opens modal with given song and initial lyrics', () => {
        const song: SongResult = {
            id: 'song-test-1',
            name: 'Song Test 1',
            artists: [{ id: 0, name: 'Artist Test' }],
            album: { id: 0, name: 'Album Test' },
            durationMs: 210000,
        };

        openAiKaraokeModal(song, 'Day la loi bai hat');

        const state = useAiKaraokeStore.getState();
        expect(state.isOpen).toBe(true);
        expect(state.activeSong?.name).toBe('Song Test 1');
        expect(state.rawLyricsText).toBe('Day la loi bai hat');
        expect(state.jobStage).toBe('idle');
    });

    it('updates selected models and modes', () => {
        const store = useAiKaraokeStore.getState();
        store.setMssModel('bs_roformer');
        store.setAsrModel('whisper_small');
        store.setAlignmentMode('auto_transcribe');

        const updated = useAiKaraokeStore.getState();
        expect(updated.selectedMssModel).toBe('bs_roformer');
        expect(updated.selectedAsrModel).toBe('whisper_small');
        expect(updated.alignmentMode).toBe('auto_transcribe');
    });

    it('updates model download progress and marks as downloaded at 100%', () => {
        const sampleModels: AiModelInfo[] = [
            {
                id: 'uvr_mdxnet_kara_2',
                name: 'UVR-MDX-Net',
                category: 'mss',
                fileName: 'UVR_MDXNET_KARA_2.onnx',
                fileSizeMb: 66.8,
                recommendedVram: '2GB',
                typicalSpeed: '8s',
                description: 'test',
                descriptionVi: 'test',
                downloadUrl: 'https://example.com/model.onnx',
                isDownloaded: false,
            },
        ];

        useAiKaraokeStore.getState().setModels(sampleModels);
        useAiKaraokeStore.getState().updateModelDownload('uvr_mdxnet_kara_2', 50);

        let model = useAiKaraokeStore.getState().models[0];
        expect(model.downloadProgress).toBe(50);
        expect(model.isDownloaded).toBe(false);

        useAiKaraokeStore.getState().updateModelDownload('uvr_mdxnet_kara_2', 100);
        model = useAiKaraokeStore.getState().models[0];
        expect(model.downloadProgress).toBe(100);
        expect(model.isDownloaded).toBe(true);
    });

    it('tracks job progress and elapsed time', () => {
        useAiKaraokeStore.getState().updateProgress({
            stage: 'separating_audio',
            progress: 45,
            message: 'Đang tách beat và vocal',
            detail: 'MDX-Net inference',
            elapsedSeconds: 5,
        });

        const state = useAiKaraokeStore.getState();
        expect(state.jobStage).toBe('separating_audio');
        expect(state.jobProgress).toBe(45);
        expect(state.jobMessage).toBe('Đang tách beat và vocal');
        expect(state.elapsedSeconds).toBe(5);
    });

    it('handles devicePreference switching', () => {
        const store = useAiKaraokeStore.getState();
        expect(store.devicePreference).toBe('gpu');

        store.setDevicePreference('cpu');
        expect(useAiKaraokeStore.getState().devicePreference).toBe('cpu');

        store.setDevicePreference('gpu');
        expect(useAiKaraokeStore.getState().devicePreference).toBe('gpu');
    });

    it('supports 3 tabs: process, running, and library', () => {
        const store = useAiKaraokeStore.getState();
        expect(store.activeTab).toBe('process');

        store.setActiveTab('running');
        expect(useAiKaraokeStore.getState().activeTab).toBe('running');

        store.setActiveTab('library');
        expect(useAiKaraokeStore.getState().activeTab).toBe('library');

        store.setActiveTab('process');
        expect(useAiKaraokeStore.getState().activeTab).toBe('process');
    });

    it('automatically defaults to running tab and preserves job state if job is currently active when opening modal', () => {
        // Simulate a running job
        useAiKaraokeStore.setState({
            jobStage: 'separating_audio',
            jobProgress: 52,
            jobMessage: 'Đang tách tần số âm thanh...',
            elapsedSeconds: 24,
        });

        // Re-open modal
        openAiKaraokeModal(null);

        const state = useAiKaraokeStore.getState();
        expect(state.isOpen).toBe(true);
        expect(state.activeTab).toBe('running');
        expect(state.jobStage).toBe('separating_audio');
        expect(state.jobProgress).toBe(52);
        expect(state.jobMessage).toBe('Đang tách tần số âm thanh...');
        expect(state.elapsedSeconds).toBe(24);
    });
});

