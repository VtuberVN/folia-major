import { DEFAULT_SORA_BACKGROUND_TUNING, type SoraBackgroundTuning } from '../../../../types';
import { defineBackgroundTuning, type StoredTuningFields } from '../../tuningDefinition';

// src/components/visualizer/backgrounds/sora/tuning.ts
// The sora background's tuning: its defaults, the settings store fields it lives in, where it is
// stored and how a stored value and a change are read.

declare module '../definition' {
    interface VisualizerBackgroundConfig {
        sora?: BackgroundTuningSlot<SoraBackgroundTuning>;
    }
    interface VisualizerBackgroundActions {
        sora?: BackgroundTuningActionSlot<SoraBackgroundTuning>;
    }
}

declare module '../../tuningDefinition' {
    interface VisualizerTuningSettings extends StoredTuningFields<'soraBackgroundTuning', 'handleSetSoraBackgroundTuning', 'handleResetSoraBackgroundTuning', SoraBackgroundTuning> {}
}

export const resolveStoredSoraBackgroundTuning = (
    parsed: Partial<SoraBackgroundTuning>,
): SoraBackgroundTuning => {
    const clampNum = (val: unknown, fallback: number, min: number, max: number): number => {
        if (typeof val !== 'number' || isNaN(val)) return fallback;
        return Math.max(min, Math.min(max, val));
    };

    return {
        blank: typeof parsed.blank === 'boolean' ? parsed.blank : DEFAULT_SORA_BACKGROUND_TUNING.blank,
        camYaw: clampNum(parsed.camYaw, DEFAULT_SORA_BACKGROUND_TUNING.camYaw, -180, 180),
        camPitch: clampNum(parsed.camPitch, DEFAULT_SORA_BACKGROUND_TUNING.camPitch, -90, 90),
        camRoll: clampNum(parsed.camRoll, DEFAULT_SORA_BACKGROUND_TUNING.camRoll, -180, 180),
        autoCinematicCam: typeof parsed.autoCinematicCam === 'boolean' ? parsed.autoCinematicCam : DEFAULT_SORA_BACKGROUND_TUNING.autoCinematicCam,
        starShape: parsed.starShape === 'cross' || parsed.starShape === 'diamond' || parsed.starShape === 'point' || parsed.starShape === 'soft'
            ? parsed.starShape : DEFAULT_SORA_BACKGROUND_TUNING.starShape,
        starPalette: parsed.starPalette === 'neon' || parsed.starPalette === 'diamond' || parsed.starPalette === 'real'
            ? parsed.starPalette : DEFAULT_SORA_BACKGROUND_TUNING.starPalette,
        starCount: clampNum(parsed.starCount, DEFAULT_SORA_BACKGROUND_TUNING.starCount, 100, 3000),
        starScale: clampNum(parsed.starScale, DEFAULT_SORA_BACKGROUND_TUNING.starScale, 0.2, 3.0),
        depthSpread: clampNum(parsed.depthSpread, DEFAULT_SORA_BACKGROUND_TUNING.depthSpread, 0.2, 3.0),
        twinkle: clampNum(parsed.twinkle, DEFAULT_SORA_BACKGROUND_TUNING.twinkle, 0, 2.0),
        starDriftAngle: clampNum(parsed.starDriftAngle, DEFAULT_SORA_BACKGROUND_TUNING.starDriftAngle, 0, 360),
        starDriftSpeed: clampNum(parsed.starDriftSpeed, DEFAULT_SORA_BACKGROUND_TUNING.starDriftSpeed, 0, 5),
        showGalaxy: typeof parsed.showGalaxy === 'boolean' ? parsed.showGalaxy : DEFAULT_SORA_BACKGROUND_TUNING.showGalaxy,
        galaxyShape: parsed.galaxyShape === 'spiral4' || parsed.galaxyShape === 'ring' || parsed.galaxyShape === 'cloud' || parsed.galaxyShape === 'spiral2'
            ? parsed.galaxyShape : DEFAULT_SORA_BACKGROUND_TUNING.galaxyShape,
        galaxyRadius: clampNum(parsed.galaxyRadius, DEFAULT_SORA_BACKGROUND_TUNING.galaxyRadius, 30, 300),
        galaxyTwist: clampNum(parsed.galaxyTwist, DEFAULT_SORA_BACKGROUND_TUNING.galaxyTwist, 0.2, 3.0),
        galaxyArmWidth: clampNum(parsed.galaxyArmWidth, DEFAULT_SORA_BACKGROUND_TUNING.galaxyArmWidth, 0.2, 2.5),
        galaxyThickness: clampNum(parsed.galaxyThickness, DEFAULT_SORA_BACKGROUND_TUNING.galaxyThickness, 0.05, 3.0),
        galaxyChaos: clampNum(parsed.galaxyChaos, DEFAULT_SORA_BACKGROUND_TUNING.galaxyChaos, 0, 1.5),
        galaxyCore: clampNum(parsed.galaxyCore, DEFAULT_SORA_BACKGROUND_TUNING.galaxyCore, 0, 3.0),
        galaxySpin: clampNum(parsed.galaxySpin, DEFAULT_SORA_BACKGROUND_TUNING.galaxySpin, -2.0, 2.0),
        galaxyRotX: clampNum(parsed.galaxyRotX, DEFAULT_SORA_BACKGROUND_TUNING.galaxyRotX, -180, 180),
        galaxyRotY: clampNum(parsed.galaxyRotY, DEFAULT_SORA_BACKGROUND_TUNING.galaxyRotY, -180, 180),
        galaxyRotZ: clampNum(parsed.galaxyRotZ, DEFAULT_SORA_BACKGROUND_TUNING.galaxyRotZ, -180, 180),
        galaxyPosX: clampNum(parsed.galaxyPosX, DEFAULT_SORA_BACKGROUND_TUNING.galaxyPosX, -400, 400),
        galaxyPosY: clampNum(parsed.galaxyPosY, DEFAULT_SORA_BACKGROUND_TUNING.galaxyPosY, -300, 300),
        galaxyPosZ: clampNum(parsed.galaxyPosZ, DEFAULT_SORA_BACKGROUND_TUNING.galaxyPosZ, -700, 0),
        enableShootingStars: typeof parsed.enableShootingStars === 'boolean' ? parsed.enableShootingStars : DEFAULT_SORA_BACKGROUND_TUNING.enableShootingStars,
        shootingFreq: clampNum(parsed.shootingFreq, DEFAULT_SORA_BACKGROUND_TUNING.shootingFreq, 0.5, 10),
        shootingTail: clampNum(parsed.shootingTail, DEFAULT_SORA_BACKGROUND_TUNING.shootingTail, 10, 100),
        shootingPalette: parsed.shootingPalette === 'gold' || parsed.shootingPalette === 'cyan' || parsed.shootingPalette === 'rose' || parsed.shootingPalette === 'rainbow' || parsed.shootingPalette === 'white'
            ? parsed.shootingPalette : DEFAULT_SORA_BACKGROUND_TUNING.shootingPalette,
        audioPulse: clampNum(parsed.audioPulse, DEFAULT_SORA_BACKGROUND_TUNING.audioPulse, 0, 3.0),
    };
};

export default defineBackgroundTuning<SoraBackgroundTuning>({
    mode: 'sora',
    defaults: DEFAULT_SORA_BACKGROUND_TUNING,
    settingsKey: 'soraBackgroundTuning',
    settingsSetterKey: 'handleSetSoraBackgroundTuning',
    settingsResetterKey: 'handleResetSoraBackgroundTuning',
    storage: {
        key: 'sora_background_tuning',
        read: resolveStoredSoraBackgroundTuning,
        merge: (held, patch) => resolveStoredSoraBackgroundTuning({ ...held, ...patch }),
    },
});
