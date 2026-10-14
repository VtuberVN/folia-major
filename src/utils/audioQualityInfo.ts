import type { AudioQualityInfo } from '../types/audioQuality';

// src/utils/audioQualityInfo.ts
// Accepts measured metadata only; never derives bitrate from a quality preference.
export function normalizeAudioQualityInfo(value: AudioQualityInfo | null | undefined): AudioQualityInfo | undefined {
    if (!value) return undefined;
    const result: AudioQualityInfo = {};
    for (const key of ['bitrate', 'sampleRate', 'bitDepth'] as const) {
        const number = Number(value[key]);
        if (Number.isFinite(number) && number > 0) result[key] = number;
    }
    if (typeof value.codec === 'string' && value.codec.trim()) result.codec = value.codec.trim().slice(0, 40);
    if (typeof value.label === 'string' && value.label.trim()) result.label = value.label.trim().slice(0, 40);
    if (value.unlocked) result.unlocked = true;
    if (!Object.keys(result).length) return undefined;
    if (value.provenance === 'source' || value.provenance === 'stream') result.provenance = value.provenance;
    return result;
}

export function simplifyAudioCodec(codec?: string): string {
    if (!codec) return '';
    const lower = codec.toLowerCase();
    if (lower.includes('aac') || lower.includes('mp4a')) return 'AAC';
    if (lower.includes('mp3') || lower.includes('layer 3') || lower.includes('mpeg 1 layer')) return 'MP3';
    if (lower.includes('flac')) return 'FLAC';
    if (lower.includes('alac')) return 'ALAC';
    if (lower.includes('opus')) return 'Opus';
    if (lower.includes('vorbis')) return 'Vorbis';
    return codec.toUpperCase();
}

export function formatAudioQualityInfo(value: AudioQualityInfo | undefined, language = 'en'): string {
    const info = normalizeAudioQualityInfo(value);
    if (!info) return '';
    const number = new Intl.NumberFormat(language === 'in' ? 'id' : language, { useGrouping: false, maximumFractionDigits: 1 });
    const formatted = [
        info.bitrate ? `${number.format(Math.round(info.bitrate / 1000))} kbps` : '',
        simplifyAudioCodec(info.codec),
        info.sampleRate ? `${number.format(info.sampleRate / 1000)} kHz` : '',
        info.bitDepth ? `${info.bitDepth}-bit` : '',
    ].filter(Boolean).join(' · ');
    if (info.label) {
        return formatted ? `${info.label} · ${formatted}` : info.label;
    }
    return formatted;
}
