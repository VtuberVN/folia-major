import { DEFAULT_TIDE_BACKGROUND_TUNING, type TideBackgroundTuning, type TideColorMode } from '../../../../types';
import { defineBackgroundTuning, type StoredTuningFields } from '../../tuningDefinition';

// src/components/visualizer/backgrounds/tide/tuning.ts
// The tide background's tuning: its defaults, the settings store fields it lives in, where it is
// stored and how a stored value and a change are read.

declare module '../definition' {
    interface VisualizerBackgroundConfig {
        tide?: BackgroundTuningSlot<TideBackgroundTuning>;
    }
    interface VisualizerBackgroundActions {
        tide?: BackgroundTuningActionSlot<TideBackgroundTuning>;
    }
}

declare module '../../tuningDefinition' {
    interface VisualizerTuningSettings extends StoredTuningFields<'tideBackgroundTuning', 'handleSetTideBackgroundTuning', 'handleResetTideBackgroundTuning', TideBackgroundTuning> {}
}

export const resolveTideColorMode = (value: TideColorMode | undefined | unknown): TideColorMode => (
    value === 'custom' ? 'custom' : DEFAULT_TIDE_BACKGROUND_TUNING.colorMode
);

export const clampTideNumber = (value: unknown, fallback: number, min: number, max: number) => (
    Math.min(max, Math.max(min, typeof value === 'number' && Number.isFinite(value) ? value : fallback))
);

const normalizeHexColor = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
};

export const resolveStoredTideBackgroundTuning = (
    parsed: Partial<TideBackgroundTuning>,
): TideBackgroundTuning => ({
    intensity: clampTideNumber(parsed.intensity, DEFAULT_TIDE_BACKGROUND_TUNING.intensity, 0, 3),
    flow: clampTideNumber(parsed.flow, DEFAULT_TIDE_BACKGROUND_TUNING.flow, 0, 2),
    dissipation: clampTideNumber(parsed.dissipation, DEFAULT_TIDE_BACKGROUND_TUNING.dissipation, 0, 1),
    spread: clampTideNumber(parsed.spread, DEFAULT_TIDE_BACKGROUND_TUNING.spread, 0.2, 3),
    followLyrics: typeof parsed.followLyrics === 'boolean' ? parsed.followLyrics : DEFAULT_TIDE_BACKGROUND_TUNING.followLyrics,
    sampleSeconds: clampTideNumber(parsed.sampleSeconds, DEFAULT_TIDE_BACKGROUND_TUNING.sampleSeconds, 0.06, 0.6),
    maxAnchors: Math.round(clampTideNumber(parsed.maxAnchors, DEFAULT_TIDE_BACKGROUND_TUNING.maxAnchors, 1, 6)),
    smoothing: clampTideNumber(parsed.smoothing, DEFAULT_TIDE_BACKGROUND_TUNING.smoothing, 0, 0.92),
    cameraFollow: typeof parsed.cameraFollow === 'boolean' ? parsed.cameraFollow : DEFAULT_TIDE_BACKGROUND_TUNING.cameraFollow,
    cameraStrength: clampTideNumber(parsed.cameraStrength, DEFAULT_TIDE_BACKGROUND_TUNING.cameraStrength, 0, 1),
    soundReactive: clampTideNumber(parsed.soundReactive, DEFAULT_TIDE_BACKGROUND_TUNING.soundReactive, 0, 2),
    lyricLift: clampTideNumber(parsed.lyricLift, DEFAULT_TIDE_BACKGROUND_TUNING.lyricLift, 0, 2),
    waveScale: clampTideNumber(parsed.waveScale, DEFAULT_TIDE_BACKGROUND_TUNING.waveScale, 0.4, 2.5),
    waveSpeed: clampTideNumber(parsed.waveSpeed, DEFAULT_TIDE_BACKGROUND_TUNING.waveSpeed, 0, 2.5),
    chop: clampTideNumber(parsed.chop, DEFAULT_TIDE_BACKGROUND_TUNING.chop, 0, 1.5),
    glintStrength: clampTideNumber(parsed.glintStrength, DEFAULT_TIDE_BACKGROUND_TUNING.glintStrength, 0, 2.5),
    fog: clampTideNumber(parsed.fog, DEFAULT_TIDE_BACKGROUND_TUNING.fog, 0, 1),
    perspective: clampTideNumber(parsed.perspective, DEFAULT_TIDE_BACKGROUND_TUNING.perspective, 0, 1),
    colorMode: resolveTideColorMode(parsed.colorMode),
    waterColor: normalizeHexColor(parsed.waterColor, DEFAULT_TIDE_BACKGROUND_TUNING.waterColor),
    glintColor: normalizeHexColor(parsed.glintColor, DEFAULT_TIDE_BACKGROUND_TUNING.glintColor),
    backgroundColor: normalizeHexColor(parsed.backgroundColor, DEFAULT_TIDE_BACKGROUND_TUNING.backgroundColor),
});

export default defineBackgroundTuning<TideBackgroundTuning>({
    mode: 'tide',
    defaults: DEFAULT_TIDE_BACKGROUND_TUNING,
    settingsKey: 'tideBackgroundTuning',
    settingsSetterKey: 'handleSetTideBackgroundTuning',
    settingsResetterKey: 'handleResetTideBackgroundTuning',
    storage: {
        key: 'tide_background_tuning',
        read: resolveStoredTideBackgroundTuning,
        merge: (held, patch) => resolveStoredTideBackgroundTuning({ ...held, ...patch }),
    },
});
