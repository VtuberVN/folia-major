// src/types/aiKaraoke.ts
// Data structures and model definitions for Music Source Separation (MSS) and
// Karaoke Lyric Generation (ASR & Forced Alignment).

export type MssModelId =
    | 'uvr_mdxnet_kara_2' // 66.8 MB - Best for karaoke: isolates vocals but keeps backing vocals in instrumental
    | 'kim_vocal_2'        // 66.8 MB - Best for ASR: ultra clean lead vocal isolation
    | 'htdemucs_mnn'       // 80-160 MB - Built-in MNN/WebGPU: separates drums, bass, other, vocals
    | 'bs_roformer';       // 639 MB - Studio-grade RoFormer: SDR 12.97 dB, pristine vocal separation

export type AsrModelId =
    | 'whisper_turbo'      // ~800 MB int8 - Fastest Whisper (809M params, 4 decoder layers), 2-4s/song
    | 'whisper_small'      // ~460 MB int8 - Lightweight for low-spec machines without dedicated GPU
    | 'forced_alignment';  // ~1.2 GB (MMS_FA / stable-ts) - Aligns existing lyrics text with sub-50ms accuracy

export interface AiModelInfo {
    id: MssModelId | AsrModelId;
    name: string;
    category: 'mss' | 'asr';
    fileName: string;
    fileSizeMb: number;
    recommendedVram: string;
    typicalSpeed: string;
    description: string;
    descriptionVi: string;
    downloadUrl: string;
    isDownloaded: boolean;
    downloadProgress?: number; // 0-100
    downloadDetails?: {
        receivedBytes: number;
        totalBytes: number;
        speedBytesPerSec?: number;
    };
}

export type KaraokeAlignmentMode =
    | 'auto_transcribe' // Pure ASR: Whisper listens and transcribes words + timestamps
    | 'align_existing'; // Forced Alignment: Aligns existing lyrics text to separated vocal audio

export type KaraokeDevicePreference = 'gpu' | 'cpu'; // WebGPU vs C++ MNN AVX2 CPU

export interface WordTiming {
    text: string;
    startTime: number; // in seconds
    endTime: number;   // in seconds
}

export interface LyricLineTiming {
    startTime: number;
    endTime: number;
    text: string;
    words: WordTiming[];
}

export interface KaraokeGenerationResult {
    songId: string;
    songTitle: string;
    artist: string;
    vocalsPath?: string;
    instrumentalPath?: string;
    lrcText: string;
    enhancedLrcText: string;
    lines: LyricLineTiming[];
    duration: number;
    mssModelUsed: MssModelId;
    asrModelUsed: AsrModelId;
    alignmentMode: KaraokeAlignmentMode;
    generatedAt: number;
    canceled?: boolean;
}

export type KaraokeJobStage =
    | 'idle'
    | 'checking_models'
    | 'downloading_model'
    | 'separating_audio'
    | 'transcribing_lyrics'
    | 'aligning_words'
    | 'formatting_lrc'
    | 'completed'
    | 'error';

export interface KaraokeJobProgress {
    jobId?: string;
    stage: KaraokeJobStage;
    progress: number; // 0-100
    message: string;
    detail?: string;
    elapsedSeconds: number;
}

export interface KaraokeOutputSummary {
    songId: string;
    songTitle: string;
    artist: string;
    duration: number;
    mssModelUsed: MssModelId;
    asrModelUsed: AsrModelId;
    alignmentMode: KaraokeAlignmentMode;
    deviceUsed?: KaraokeDevicePreference;
    generatedAt: number;
    vocalsPath: string;
    instrumentalPath: string;
    lrcPath: string;
    enhancedLrcPath: string;
    hasVocals: boolean;
    hasInstrumental: boolean;
    hasLrc: boolean;
    totalSizeBytes: number;
}
