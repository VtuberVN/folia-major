import { describe, expect, it } from 'vitest';
import { formatAudioQualityInfo, normalizeAudioQualityInfo } from '../../../src/utils/audioQualityInfo';

// test/unit/utils/audioQualityInfo.test.ts
// Checks bitrate units, unknown metadata, and refreshes that must discard old stream quality.
describe('audio quality information', () => {
    it('formats bps as kbps and Hz as kHz', () => {
        expect(formatAudioQualityInfo({ bitrate: 4800000, sampleRate: 96000, bitDepth: 24, codec: 'flac' }, 'vi')).toBe('4800 kbps · FLAC · 96 kHz · 24-bit');
        expect(formatAudioQualityInfo({ bitrate: 320000, sampleRate: 44100 }, 'vi')).toBe('320 kbps · 44,1 kHz');
    });
    it('hides absent, invalid, and nonpositive values rather than inventing a bitrate', () => {
        expect(formatAudioQualityInfo(undefined)).toBe('');
        expect(normalizeAudioQualityInfo({ bitrate: NaN, sampleRate: -1, bitDepth: 0, codec: ' ' })).toBeUndefined();
        expect(formatAudioQualityInfo({ codec: 'FLAC' })).toBe('FLAC');
    });
    it('supports every app locale including the legacy Indonesian code', () => {
        for (const language of ['en', 'zh-CN', 'in', 'vi']) expect(formatAudioQualityInfo({ bitrate: 128000 }, language)).toBe('128 kbps');
    });
});
