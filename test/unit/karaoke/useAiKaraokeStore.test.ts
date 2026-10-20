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

    it('plays output stem, loads its lyrics, and sets playerState to PLAYING', async () => {
        const { usePlaybackStore } = await import('@/stores/usePlaybackStore');
        const { PlayerState } = await import('@/types');

        // Mock window.electron.aiKaraoke
        (window as any).electron = {
            aiKaraoke: {
                getStemAudio: async () => new Uint8Array([1, 2, 3]).buffer,
                getCachedResult: async () => ({
                    lrcText: '[00:01.00]Line 1\n[00:05.00]Line 2',
                    enhancedLrcText: '[00:01.00]<00:01.00>Line <00:01.50>1\n[00:05.00]<00:05.00>Line <00:05.50>2',
                }),
            },
        };

        // Mock URL.createObjectURL
        window.URL.createObjectURL = () => 'blob:mock-audio-url';

        const sampleOutput = {
            songId: 'sample-song-id',
            songTitle: 'Bai Hat Mau',
            artist: 'Ca Si Mau',
            duration: 120,
            mssModelUsed: 'htdemucs_mnn' as const,
            asrModelUsed: 'whisper_turbo' as const,
            alignmentMode: 'align_existing' as const,
            generatedAt: Date.now(),
            vocalsPath: 'C:\\karaoke\\sample-song-id\\vocals.wav',
            instrumentalPath: 'C:\\karaoke\\sample-song-id\\instrumental.wav',
            lrcPath: 'C:\\karaoke\\sample-song-id\\sample-song-id.lrc',
            enhancedLrcPath: 'C:\\karaoke\\sample-song-id\\sample-song-id.karaoke.lrc',
            hasVocals: true,
            hasInstrumental: true,
            hasLrc: true,
            totalSizeBytes: 1000,
        };

        const success = await useAiKaraokeStore.getState().playOutputStem(sampleOutput, 'beat');
        expect(success).toBe(true);

        const playbackState = usePlaybackStore.getState();
        expect(playbackState.currentSong?.id).toBe('karaoke-sample-song-id-beat');
        expect(playbackState.currentSong?.name).toBe('Bai Hat Mau [Beat]');
        expect((playbackState.currentSong as any)?.filePath).toBe('C:\\karaoke\\sample-song-id\\instrumental.wav');
        expect(playbackState.playerState).toBe(PlayerState.PLAYING);
        expect(playbackState.currentSong?.onlineLyricsState?.lyricsSource).toBe('imported');
        expect(playbackState.lyrics?.lines.length).toBeGreaterThan(0);
        expect(playbackState.lyrics?.isWordByWord).toBe(true);

        // Test toggle pause on same stem
        await useAiKaraokeStore.getState().playOutputStem(sampleOutput, 'beat');
        expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PAUSED);

        // Test toggle resume on same stem
        await useAiKaraokeStore.getState().playOutputStem(sampleOutput, 'beat');
        expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PLAYING);
    });

    it('applies lyrics to currently playing song when target matches', async () => {
        const { usePlaybackStore } = await import('@/stores/usePlaybackStore');
        const song: SongResult = {
            id: 'playing-song-1',
            name: 'Ca Khuc Dang Phat',
            artists: [{ id: 1, name: 'Ca Si A' }],
            album: { id: 1, name: 'Album A' },
            durationMs: 180000,
        };
        usePlaybackStore.getState().setCurrentSong(song);

        const sampleResult = {
            jobId: 'job-1',
            songId: 'playing-song-1',
            songTitle: 'Ca Khuc Dang Phat',
            artist: 'Ca Si A',
            enhancedLrcText: '[00:01.00]<00:01.00>Xin <00:01.50>chao',
            lrcText: '[00:01.00]Xin chao',
            enhancedLrcPath: 'test.karaoke.lrc',
            lrcPath: 'test.lrc',
            duration: 180,
            hasVocals: false,
            hasInstrumental: false,
            lines: [],
            asrModelUsed: 'whisper_turbo' as const,
            alignmentMode: 'align_existing' as const,
            generatedAt: Date.now(),
        };

        const success = await useAiKaraokeStore.getState().applyLyricsToCurrentSong(sampleResult, song);
        expect(success).toBe(true);

        const state = usePlaybackStore.getState();
        expect(state.lyrics?.lines.length).toBeGreaterThan(0);
        expect(state.lyrics?.isWordByWord).toBe(true);
    });

    it('does not overwrite current playing song lyrics when target song is different', async () => {
        const { usePlaybackStore } = await import('@/stores/usePlaybackStore');
        const playingSong: SongResult = {
            id: 'playing-song-2',
            name: 'Song Is Playing',
            artists: [{ id: 2, name: 'Ca Si B' }],
            album: { id: 2, name: 'Album B' },
            durationMs: 200000,
        };
        usePlaybackStore.getState().setCurrentSong(playingSong);
        usePlaybackStore.getState().setLyricsState(null);

        const targetSong: SongResult = {
            id: 'target-song-different',
            name: 'Different Song In Library',
            artists: [{ id: 3, name: 'Ca Si C' }],
            album: { id: 3, name: 'Album C' },
            durationMs: 150000,
        };

        const sampleResult = {
            jobId: 'job-2',
            songId: 'target-song-different',
            songTitle: 'Different Song In Library',
            artist: 'Ca Si C',
            enhancedLrcText: '[00:02.00]<00:02.00>Loi <00:02.50>bai <00:03.00>khac',
            lrcText: '[00:02.00]Loi bai khac',
            enhancedLrcPath: 'test2.karaoke.lrc',
            lrcPath: 'test2.lrc',
            duration: 150,
            hasVocals: false,
            hasInstrumental: false,
            lines: [],
            asrModelUsed: 'whisper_turbo' as const,
            alignmentMode: 'align_existing' as const,
            generatedAt: Date.now(),
        };

        const success = await useAiKaraokeStore.getState().applyLyricsToCurrentSong(sampleResult, targetSong);
        expect(success).toBe(true);

        // The active playing song's lyrics should NOT have been overwritten
        expect(usePlaybackStore.getState().lyrics).toBeNull();
    });
});

