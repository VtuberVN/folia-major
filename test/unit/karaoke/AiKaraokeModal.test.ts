// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, beforeEach, afterEach, beforeAll } from 'vitest';
import { AiKaraokeModal } from '@/components/karaoke/AiKaraokeModal';
import { useAiKaraokeStore } from '@/stores/useAiKaraokeStore';

let root: Root | null = null;
let host: HTMLElement | null = null;

const render = async (element: React.ReactElement) => {
    if (!root) {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    }
    await act(async () => {
        root!.render(element);
    });
};

beforeAll(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollTo = () => {};
});

afterEach(() => {
    if (root && host) {
        act(() => {
            root!.unmount();
        });
        host.remove();
        root = null;
        host = null;
    }
});

describe('AiKaraokeModal', () => {
    beforeEach(() => {
        useAiKaraokeStore.setState({
            isOpen: true,
            activeTab: 'process',
            activeSong: {
                id: 'song-test-1',
                name: 'Jack - NGƯỜI DƯNG',
                artists: [{ id: 1, name: 'Jack' }],
                album: { id: 1, name: 'Album' },
                durationMs: 200000,
            },
            models: [],
            outputs: [],
            jobStage: 'idle',
            jobProgress: 0,
            jobMessage: '',
            jobDetail: '',
            elapsedSeconds: 0,
            activeJobId: null,
            lastResult: null,
        });
    });

    it('renders modal with 3 tabs and new title "Tách lời và nhạc & Tạo Lyric"', async () => {
        await render(React.createElement(AiKaraokeModal));

        const bodyText = document.body.textContent || '';
        expect(bodyText).toContain('Tách lời và nhạc & Tạo Lyric');
        expect(bodyText).toContain('Tách lời & nhạc');
        expect(bodyText).toContain('Tiến trình đang xử lý');
        expect(bodyText).toContain('Thư viện bài đã tách');
    });

    it('shows progress percentage badge in "Tiến trình đang xử lý" tab when job is running', async () => {
        useAiKaraokeStore.setState({
            jobStage: 'separating_audio',
            jobProgress: 42,
            jobMessage: 'Đang tách tần số âm thanh...',
            elapsedSeconds: 15,
        });

        await render(React.createElement(AiKaraokeModal));

        const bodyText = document.body.textContent || '';
        expect(bodyText).toContain('42%');
    });

    it('displays active running progress card when on "running" tab', async () => {
        useAiKaraokeStore.setState({
            activeTab: 'running',
            jobStage: 'separating_audio',
            jobProgress: 75,
            jobMessage: 'Đang ghi file beat và vocal...',
            jobDetail: 'PCM 44.1kHz',
            elapsedSeconds: 30,
        });

        await render(React.createElement(AiKaraokeModal));

        const bodyText = document.body.textContent || '';
        expect(bodyText).toContain('Đang ghi file beat và vocal...');
        expect(bodyText).toContain('75% (30s)');
        expect(bodyText).toContain('Hủy tiến trình');
    });
});
