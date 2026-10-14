import {
    DEFAULT_SORA_BACKGROUND_TUNING,
    SORA_CLASSIC_TUNING,
    type SoraBackgroundTuning,
    type SoraGalaxyShape,
    type SoraShootingPalette,
    type SoraStarPalette,
    type SoraStarShape,
    type Theme,
} from '../../../../types';
import { colorWithAlpha } from '../../colorMix';
import BackgroundToggleRow from '../BackgroundToggleRow';
import {
    SoraPillGroup,
    type SoraPillOption,
    SoraSectionLabel,
    SoraSliderRow,
} from './soraSettingsRows';

// src/components/visualizer/backgrounds/sora/SoraBackgroundSettingsCard.tsx
// Comprehensive settings card for the Sora 3D Celestial Engine:
// Presets, 3D Camera, Starfield Drift, Sub-Galaxy with 3D orientation, Shooting Stars, and Audio Pulse.

interface SoraBackgroundSettingsCardProps {
    t: (key: string) => string;
    isDaylight: boolean;
    theme: Theme;
    controlCardBg: string;
    rangeInputClass: string;
    tuning: SoraBackgroundTuning;
    onTuningChange?: (patch: Partial<SoraBackgroundTuning>) => void;
    onResetTuning?: () => void;
    onSliderPointerDown?: () => void;
    onSliderCommit?: () => void;
}

const SoraBackgroundSettingsCard: React.FC<SoraBackgroundSettingsCardProps> = ({
    t,
    isDaylight,
    theme,
    controlCardBg,
    rangeInputClass,
    tuning,
    onTuningChange,
    onResetTuning,
    onSliderPointerDown,
    onSliderCommit,
}) => {
    const resolved: SoraBackgroundTuning = { ...DEFAULT_SORA_BACKGROUND_TUNING, ...tuning };
    const borderColor = colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.16);

    const starShapeOptions: SoraPillOption<SoraStarShape>[] = [
        { value: 'soft', label: t('options.soraStarShapeSoft') },
        { value: 'cross', label: t('options.soraStarShapeCross') },
        { value: 'diamond', label: t('options.soraStarShapeDiamond') },
        { value: 'point', label: t('options.soraStarShapePoint') },
    ];

    const starPaletteOptions: SoraPillOption<SoraStarPalette>[] = [
        { value: 'real', label: t('options.soraStarPaletteReal') },
        { value: 'neon', label: t('options.soraStarPaletteNeon') },
        { value: 'diamond', label: t('options.soraStarPaletteDiamond') },
    ];

    const galaxyShapeOptions: SoraPillOption<SoraGalaxyShape>[] = [
        { value: 'spiral2', label: t('options.soraGalaxyShapeSpiral2') },
        { value: 'spiral4', label: t('options.soraGalaxyShapeSpiral4') },
        { value: 'ring', label: t('options.soraGalaxyShapeRing') },
        { value: 'cloud', label: t('options.soraGalaxyShapeCloud') },
    ];

    const shootingPaletteOptions: SoraPillOption<SoraShootingPalette>[] = [
        { value: 'white', label: t('options.soraShootingPaletteWhite') },
        { value: 'gold', label: t('options.soraShootingPaletteGold') },
        { value: 'cyan', label: t('options.soraShootingPaletteCyan') },
        { value: 'rose', label: t('options.soraShootingPaletteRose') },
        { value: 'rainbow', label: t('options.soraShootingPaletteRainbow') },
    ];

    const applyPreset = (preset: Partial<SoraBackgroundTuning>) => {
        onTuningChange?.(preset);
    };

    return (
        <div className="rounded-[24px] border p-4 space-y-6" style={{ backgroundColor: controlCardBg, borderColor }}>
            {/* Header & Presets */}
            <div className="space-y-3">
                <div className="text-sm font-medium" style={{ color: theme.primaryColor }}>
                    {t('options.soraBackgroundSettings')}
                </div>
                <div className="space-y-2">
                    <SoraSectionLabel theme={theme}>{t('options.soraSectionPreset')}</SoraSectionLabel>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => applyPreset(DEFAULT_SORA_BACKGROUND_TUNING)}
                            className="rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
                            style={{
                                color: theme.primaryColor,
                                borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.2 : 0.16),
                                backgroundColor: colorWithAlpha(theme.secondaryColor, 0.08),
                            }}
                        >
                            {t('options.soraPresetDefault')}
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                applyPreset({
                                    ...DEFAULT_SORA_BACKGROUND_TUNING,
                                    showGalaxy: true,
                                })
                            }
                            className="rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
                            style={{
                                color: theme.primaryColor,
                                borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.2 : 0.16),
                                backgroundColor: colorWithAlpha(theme.secondaryColor, 0.08),
                            }}
                        >
                            {t('options.soraPresetSpiralGalaxy')}
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                applyPreset({
                                    ...DEFAULT_SORA_BACKGROUND_TUNING,
                                    showGalaxy: false,
                                })
                            }
                            className="rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
                            style={{
                                color: theme.primaryColor,
                                borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.2 : 0.16),
                                backgroundColor: colorWithAlpha(theme.secondaryColor, 0.08),
                            }}
                        >
                            {t('options.soraPresetCosmicDrift')}
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset(SORA_CLASSIC_TUNING)}
                            className="rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
                            style={{
                                color: theme.primaryColor,
                                borderColor: colorWithAlpha(theme.secondaryColor, isDaylight ? 0.2 : 0.16),
                                backgroundColor: colorWithAlpha(theme.secondaryColor, 0.08),
                            }}
                        >
                            {t('options.soraPresetClassic')}
                        </button>
                        {onResetTuning && (
                            <button
                                type="button"
                                onClick={onResetTuning}
                                className="rounded-full border px-3 py-1.5 text-xs font-medium opacity-70 transition-all hover:opacity-100"
                                style={{
                                    color: theme.primaryColor,
                                    borderColor: colorWithAlpha(theme.secondaryColor, 0.12),
                                }}
                            >
                                {t('options.soraReset')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Solid Blank Switch */}
            <BackgroundToggleRow
                label={t('options.soraBlank')}
                description={t('options.soraBlankDesc')}
                checked={resolved.blank}
                onChange={blank => onTuningChange?.({ blank })}
                theme={theme}
            />

            {!resolved.blank && (
                <>
                    {/* 3D Camera Controls */}
                    <div className="space-y-4">
                        <SoraSectionLabel theme={theme}>{t('options.soraSectionCamera')}</SoraSectionLabel>
                        <BackgroundToggleRow
                            label={t('options.soraAutoCinematicCam')}
                            description={t('options.soraAutoCinematicCamDesc')}
                            checked={resolved.autoCinematicCam}
                            onChange={autoCinematicCam => onTuningChange?.({ autoCinematicCam })}
                            theme={theme}
                        />
                        <SoraSliderRow
                            label={t('options.soraCamYaw')}
                            value={resolved.camYaw}
                            valueLabel={`${resolved.camYaw}°`}
                            min={-180}
                            max={180}
                            step={1}
                            digits={0}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={camYaw => onTuningChange?.({ camYaw })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                        <SoraSliderRow
                            label={t('options.soraCamPitch')}
                            value={resolved.camPitch}
                            valueLabel={`${resolved.camPitch}°`}
                            min={-90}
                            max={90}
                            step={1}
                            digits={0}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={camPitch => onTuningChange?.({ camPitch })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                        <SoraSliderRow
                            label={t('options.soraCamRoll')}
                            value={resolved.camRoll}
                            valueLabel={`${resolved.camRoll}°`}
                            min={-180}
                            max={180}
                            step={1}
                            digits={0}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={camRoll => onTuningChange?.({ camRoll })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                    </div>

                    {/* Sound Reactivity */}
                    <div className="space-y-4">
                        <SoraSectionLabel theme={theme}>{t('options.soraSectionAudio')}</SoraSectionLabel>
                        <SoraSliderRow
                            label={t('options.soraAudioPulse')}
                            value={resolved.audioPulse}
                            min={0}
                            max={3.0}
                            step={0.1}
                            digits={2}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={audioPulse => onTuningChange?.({ audioPulse })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                    </div>

                    {/* Starfield Section */}
                    <div className="space-y-4">
                        <SoraSectionLabel theme={theme}>{t('options.soraSectionStarfield')}</SoraSectionLabel>
                        <SoraPillGroup
                            label={t('options.soraStarShape')}
                            value={resolved.starShape}
                            options={starShapeOptions}
                            onChange={starShape => onTuningChange?.({ starShape })}
                            isDaylight={isDaylight}
                            theme={theme}
                        />
                        <SoraPillGroup
                            label={t('options.soraStarPalette')}
                            value={resolved.starPalette}
                            options={starPaletteOptions}
                            onChange={starPalette => onTuningChange?.({ starPalette })}
                            isDaylight={isDaylight}
                            theme={theme}
                        />
                        <SoraSliderRow
                            label={t('options.soraStarDriftAngle')}
                            value={resolved.starDriftAngle}
                            valueLabel={`${resolved.starDriftAngle}°`}
                            min={0}
                            max={360}
                            step={5}
                            digits={0}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={starDriftAngle => onTuningChange?.({ starDriftAngle })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                        <SoraSliderRow
                            label={t('options.soraStarDriftSpeed')}
                            value={resolved.starDriftSpeed}
                            min={0}
                            max={5.0}
                            step={0.1}
                            digits={1}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={starDriftSpeed => onTuningChange?.({ starDriftSpeed })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                        <SoraSliderRow
                            label={t('options.soraStarCount')}
                            value={resolved.starCount}
                            min={100}
                            max={3000}
                            step={50}
                            digits={0}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={starCount => onTuningChange?.({ starCount })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                        <SoraSliderRow
                            label={t('options.soraStarScale')}
                            value={resolved.starScale}
                            min={0.2}
                            max={3.0}
                            step={0.1}
                            digits={1}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={starScale => onTuningChange?.({ starScale })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                        <SoraSliderRow
                            label={t('options.soraDepthSpread')}
                            value={resolved.depthSpread}
                            min={0.2}
                            max={3.0}
                            step={0.1}
                            digits={1}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={depthSpread => onTuningChange?.({ depthSpread })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                        <SoraSliderRow
                            label={t('options.soraTwinkle')}
                            value={resolved.twinkle}
                            min={0}
                            max={2.0}
                            step={0.05}
                            digits={2}
                            rangeInputClass={rangeInputClass}
                            theme={theme}
                            onChange={twinkle => onTuningChange?.({ twinkle })}
                            onPointerDown={onSliderPointerDown}
                            onPointerUp={onSliderCommit}
                        />
                    </div>

                    {/* Sub-Galaxy Section */}
                    <div className="space-y-4">
                        <SoraSectionLabel theme={theme}>{t('options.soraSectionGalaxy')}</SoraSectionLabel>
                        <BackgroundToggleRow
                            label={t('options.soraShowGalaxy')}
                            description={t('options.soraShowGalaxyDesc')}
                            checked={resolved.showGalaxy}
                            onChange={showGalaxy => onTuningChange?.({ showGalaxy })}
                            theme={theme}
                        />
                        {resolved.showGalaxy && (
                            <>
                                <SoraPillGroup
                                    label={t('options.soraGalaxyShape')}
                                    value={resolved.galaxyShape}
                                    options={galaxyShapeOptions}
                                    onChange={galaxyShape => onTuningChange?.({ galaxyShape })}
                                    isDaylight={isDaylight}
                                    theme={theme}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyRadius')}
                                    value={resolved.galaxyRadius}
                                    min={30}
                                    max={300}
                                    step={5}
                                    digits={0}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyRadius => onTuningChange?.({ galaxyRadius })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyTwist')}
                                    value={resolved.galaxyTwist}
                                    min={0.2}
                                    max={3.0}
                                    step={0.05}
                                    digits={2}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyTwist => onTuningChange?.({ galaxyTwist })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyArmWidth')}
                                    value={resolved.galaxyArmWidth}
                                    min={0.2}
                                    max={2.5}
                                    step={0.05}
                                    digits={2}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyArmWidth => onTuningChange?.({ galaxyArmWidth })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyThickness')}
                                    value={resolved.galaxyThickness}
                                    min={0.05}
                                    max={3.0}
                                    step={0.05}
                                    digits={2}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyThickness => onTuningChange?.({ galaxyThickness })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyChaos')}
                                    value={resolved.galaxyChaos}
                                    min={0}
                                    max={1.5}
                                    step={0.05}
                                    digits={2}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyChaos => onTuningChange?.({ galaxyChaos })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyCore')}
                                    value={resolved.galaxyCore}
                                    min={0}
                                    max={2.0}
                                    step={0.05}
                                    digits={2}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyCore => onTuningChange?.({ galaxyCore })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxySpin')}
                                    value={resolved.galaxySpin}
                                    min={-2.0}
                                    max={2.0}
                                    step={0.05}
                                    digits={2}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxySpin => onTuningChange?.({ galaxySpin })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyRotX')}
                                    value={resolved.galaxyRotX}
                                    valueLabel={`${resolved.galaxyRotX}°`}
                                    min={-180}
                                    max={180}
                                    step={1}
                                    digits={0}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyRotX => onTuningChange?.({ galaxyRotX })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyRotY')}
                                    value={resolved.galaxyRotY}
                                    valueLabel={`${resolved.galaxyRotY}°`}
                                    min={-180}
                                    max={180}
                                    step={1}
                                    digits={0}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyRotY => onTuningChange?.({ galaxyRotY })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyRotZ')}
                                    value={resolved.galaxyRotZ}
                                    valueLabel={`${resolved.galaxyRotZ}°`}
                                    min={-180}
                                    max={180}
                                    step={1}
                                    digits={0}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyRotZ => onTuningChange?.({ galaxyRotZ })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyPosX')}
                                    value={resolved.galaxyPosX}
                                    min={-400}
                                    max={400}
                                    step={5}
                                    digits={0}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyPosX => onTuningChange?.({ galaxyPosX })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyPosY')}
                                    value={resolved.galaxyPosY}
                                    min={-300}
                                    max={300}
                                    step={5}
                                    digits={0}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyPosY => onTuningChange?.({ galaxyPosY })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraGalaxyPosZ')}
                                    value={resolved.galaxyPosZ}
                                    min={-700}
                                    max={0}
                                    step={10}
                                    digits={0}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={galaxyPosZ => onTuningChange?.({ galaxyPosZ })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                            </>
                        )}
                    </div>

                    {/* Shooting Stars Section */}
                    <div className="space-y-4">
                        <SoraSectionLabel theme={theme}>{t('options.soraSectionShootingStars')}</SoraSectionLabel>
                        <BackgroundToggleRow
                            label={t('options.soraEnableShootingStars')}
                            description={t('options.soraEnableShootingStarsDesc')}
                            checked={resolved.enableShootingStars}
                            onChange={enableShootingStars => onTuningChange?.({ enableShootingStars })}
                            theme={theme}
                        />
                        {resolved.enableShootingStars && (
                            <>
                                <SoraPillGroup
                                    label={t('options.soraShootingPalette')}
                                    value={resolved.shootingPalette}
                                    options={shootingPaletteOptions}
                                    onChange={shootingPalette => onTuningChange?.({ shootingPalette })}
                                    isDaylight={isDaylight}
                                    theme={theme}
                                />
                                <SoraSliderRow
                                    label={t('options.soraShootingFreq')}
                                    value={resolved.shootingFreq}
                                    min={0.5}
                                    max={10}
                                    step={0.5}
                                    digits={1}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={shootingFreq => onTuningChange?.({ shootingFreq })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                                <SoraSliderRow
                                    label={t('options.soraShootingTail')}
                                    value={resolved.shootingTail}
                                    min={10}
                                    max={100}
                                    step={5}
                                    digits={0}
                                    rangeInputClass={rangeInputClass}
                                    theme={theme}
                                    onChange={shootingTail => onTuningChange?.({ shootingTail })}
                                    onPointerDown={onSliderPointerDown}
                                    onPointerUp={onSliderCommit}
                                />
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default SoraBackgroundSettingsCard;
