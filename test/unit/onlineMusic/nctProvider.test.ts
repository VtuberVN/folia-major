import { afterEach, describe, expect, it, vi } from 'vitest';
import { nctProvider, getNctSongAudioSource } from '@/services/onlineMusic/nctProvider';

describe('nctProvider', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('has expected capabilities and provider properties', () => {
        expect(nctProvider.id).toBe('nct');
        expect(nctProvider.displayName).toBe('NhacCuaTui');
        expect(nctProvider.capabilities.playback).toBe(true);
        expect(nctProvider.capabilities.search).toBe(true);
        expect(nctProvider.capabilities.lyrics).toBe(true);
    });

    it('normalizes raw song items correctly', () => {
        const normalized = nctProvider.normalizeSong({
            id: 'kM9SkAzMbTKV',
            name: 'Lạc Trôi',
            artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
            durationMs: 233000,
        });

        expect(normalized.id).toBe('kM9SkAzMbTKV');
        expect(normalized.name).toBe('Lạc Trôi');
        expect(normalized.artists[0].name).toBe('Sơn Tùng M-TP');
        expect(normalized.sourceRef).toEqual({
            kind: 'online',
            providerId: 'nct',
            mediaId: 'kM9SkAzMbTKV',
        });
    });

    it('retrieves audio source using cached providerData streamUrl if available', async () => {
        const song: any = {
            id: 'kM9SkAzMbTKV',
            name: 'Lạc Trôi',
            sourceRef: {
                kind: 'online',
                providerId: 'nct',
                mediaId: 'kM9SkAzMbTKV',
                providerData: {
                    streamUrl: 'https://stream.nct.vn/test.mp3',
                },
            },
        };

        const audio = await nctProvider.playback?.getAudioSource(song, 'high');
        expect(audio?.url).toBe('https://stream.nct.vn/test.mp3');
        expect(audio?.quality).toBe('high');
    });

    it('fetches audio source from API when providerData is absent', async () => {
        const mockDetail = {
            code: 0,
            data: {
                key: 'kM9SkAzMbTKV',
                name: 'Lạc Trôi',
                streamURL: [
                    { stream: 'https://stream.nct.vn/audio_128.mp3', type: '128' },
                ],
            },
        };

        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockDetail)));
        vi.stubGlobal('fetch', fetchMock);

        const song: any = {
            id: 'kM9SkAzMbTKV',
            name: 'Lạc Trôi',
            sourceRef: {
                kind: 'online',
                providerId: 'nct',
                mediaId: 'kM9SkAzMbTKV',
            },
        };

        const audio = await nctProvider.playback?.getAudioSource(song, 'high');
        expect(audio?.url).toBe('https://stream.nct.vn/audio_128.mp3');
    });
});
