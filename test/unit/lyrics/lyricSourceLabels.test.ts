import { describe, expect, it } from 'vitest';
import { getSongNativeLyricProviderSource } from '@/utils/lyrics/lyricSourceLabels';

// test/unit/lyrics/lyricSourceLabels.test.ts

describe('getSongNativeLyricProviderSource', () => {
    it('uses the online playback provider as the native lyric source', () => {
        expect(getSongNativeLyricProviderSource({
            sourceRef: { kind: 'online', providerId: 'kugou', mediaId: 'HASH' },
        })).toBe('kugou');
        expect(getSongNativeLyricProviderSource({
            sourceRef: { kind: 'online', providerId: 'netease', mediaId: '1' },
        })).toBe('netease');
        expect(getSongNativeLyricProviderSource({
            sourceRef: { kind: 'online', providerId: 'zing', mediaId: 'ZZZBIW69' },
        })).toBe('zing');
        expect(getSongNativeLyricProviderSource({
            sourceRef: { kind: 'online', providerId: 'nct', mediaId: 'FacSqbcPGZAl' },
        })).toBe('nct');
    });

    it('does not invent a lyric source for unrelated playback providers', () => {
        expect(getSongNativeLyricProviderSource({
            sourceRef: { kind: 'online', providerId: 'future-provider', mediaId: '1' },
        })).toBeUndefined();
    });
});
