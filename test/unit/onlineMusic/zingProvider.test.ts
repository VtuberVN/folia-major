// test/unit/onlineMusic/zingProvider.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { zingProvider } from '@/services/onlineMusic/zingProvider';
import { getOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import * as zingApi from '@/services/onlineMusic/zingApi';

describe('zingProvider', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('is registered in providerRegistry', () => {
        const provider = getOnlineMusicProvider('zing');
        expect(provider).toBeDefined();
        expect(provider?.id).toBe('zing');
        expect(provider?.displayName).toBe('Zing MP3');
    });

    it('has required capabilities enabled', () => {
        expect(zingProvider.capabilities.playback).toBe(true);
        expect(zingProvider.capabilities.search).toBe(true);
        expect(zingProvider.capabilities.lyrics).toBe(true);
    });

    it('gets audio source successfully for non-VIP songs', async () => {
        vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValue({
            url: 'https://cdn.zingmp3.vn/mock-audio.mp3',
            quality: 'standard',
        });

        const song = {
            id: 'ZW78DIEO',
            name: 'Lạc Trôi',
            artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
            album: { id: 1, name: 'Lạc Trôi' },
            durationMs: 233000,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZW78DIEO' },
        };

        const result = await zingProvider.playback?.getAudioSource(song, 'standard');
        expect(result).toBeDefined();
        expect(result?.url).toBe('https://cdn.zingmp3.vn/mock-audio.mp3');
        expect(result?.quality).toBe('standard');
    });

    it('throws vip-only error when song is VIP only', async () => {
        vi.spyOn(zingApi, 'getZingAudioSource').mockResolvedValue({
            url: '',
            quality: 'standard',
            isVipOnly: true,
        });

        const song = {
            id: 'ZZAF09FD',
            name: 'VIP Song',
            artists: [{ id: 1, name: 'VIP Artist' }],
            album: { id: 1, name: 'VIP Album' },
            durationMs: 200000,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZZAF09FD' },
        };

        await expect(zingProvider.playback?.getAudioSource(song, 'standard')).rejects.toThrow(
            /VIP Zing MP3/
        );
    });

    it('fetches lyrics via zingApi', async () => {
        const mockLyricData: any = {
            lines: [{ startTime: 1000, endTime: 3000, words: [], fullText: 'Người theo hương hoa mây mù giăng lối' }],
            format: 'lrc' as const,
        };
        vi.spyOn(zingApi, 'getZingLyric').mockResolvedValue(mockLyricData);

        const song = {
            id: 'ZW78DIEO',
            name: 'Lạc Trôi',
            artists: [{ id: 1, name: 'Sơn Tùng M-TP' }],
            album: { id: 1, name: 'Lạc Trôi' },
            durationMs: 233000,
            sourceRef: { kind: 'online' as const, providerId: 'zing', mediaId: 'ZW78DIEO' },
        };

        const lyrics = await zingProvider.lyrics?.getLyrics(song);
        expect(lyrics?.lyrics).toEqual(mockLyricData);
    });

    it('manages cookie in auth correctly and defaults to non-VIP', async () => {
        expect(await zingProvider.auth?.getLoginStatus()).toBeNull();

        zingApi.setStoredZingCookie('zpsid=test12345');
        const status = await zingProvider.auth?.getLoginStatus();
        expect(status?.nickname).toBe('Tài khoản Zing MP3');
        expect(status?.vipType).toBe(0);

        // When verified VIP profile is stored
        zingApi.setStoredZingProfile({
            id: '12345',
            nickname: 'Nguyễn Văn A',
            vipType: 1,
        });
        const vipStatus = await zingProvider.auth?.getLoginStatus();
        expect(vipStatus?.nickname).toBe('Nguyễn Văn A');
        expect(vipStatus?.vipType).toBe(1);

        await zingProvider.auth?.logout();
        expect(await zingProvider.auth?.getLoginStatus()).toBeNull();
    });
});
