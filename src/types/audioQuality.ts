// src/types/audioQuality.ts
// Technical properties of the selected audio file or stream, in SI units.
export interface AudioQualityInfo {
    provenance?: 'source' | 'stream';
    bitrate?: number; // bits per second, not kilobits per second
    sampleRate?: number; // Hz
    bitDepth?: number;
    codec?: string;
    label?: string;
    unlocked?: boolean;
}
