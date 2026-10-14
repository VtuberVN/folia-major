import React from 'react';
import { Square } from 'lucide-react';
import { DEFAULT_SORA_BACKGROUND_TUNING } from '../../../../types';
import SoraBackground from './SoraBackground';
import SoraBackgroundSettingsCard from './SoraBackgroundSettingsCard';
import { defineVisualizerBackground } from '../definition';
import { QuickControlToggle } from '../../../shared/QuickControlChip';

// src/components/visualizer/backgrounds/sora/entry.tsx
// Registers the shader-based Sora starfield shell background.

export default defineVisualizerBackground({
    mode: 'sora',
    order: 50,
    labelKey: 'options.visualizerBackgroundModeSora',
    labelFallback: 'Sora',
    // Blank mode never mounts the WebGL canvas: just a static black (night) / white (daylight) frame.
    // Static mode intentionally freezes the starfield, matching the shared background contract.
    render: ({ config, theme, isDaylight, paused, staticMode, audioBands, audioPower }) => (
        <div className="absolute inset-0 z-0" style={{ backgroundColor: isDaylight ? '#ffffff' : '#000000' }}>
            {!config?.sora?.tuning?.blank && (
                <SoraBackground
                    theme={theme}
                    isDaylight={isDaylight}
                    paused={paused}
                    staticMode={staticMode}
                    tuning={config?.sora?.tuning ?? DEFAULT_SORA_BACKGROUND_TUNING}
                    audioBands={audioBands}
                    audioPower={audioPower}
                />
            )}
        </div>
    ),
    renderSettingsPanel: ({ config, actions, t, isDaylight, theme, controlCardBg, rangeInputClass }) => (
        <SoraBackgroundSettingsCard
            t={t}
            isDaylight={isDaylight}
            theme={theme}
            controlCardBg={controlCardBg}
            rangeInputClass={rangeInputClass}
            tuning={config?.sora?.tuning ?? DEFAULT_SORA_BACKGROUND_TUNING}
            onTuningChange={actions?.sora?.onTuningChange}
            onResetTuning={actions?.sora?.onResetTuning}
        />
    ),
    renderQuickControls: ({ config, actions, t, theme }) => {
        const tuning = config?.sora?.tuning ?? DEFAULT_SORA_BACKGROUND_TUNING;
        return (
            <QuickControlToggle
                active={tuning.blank}
                theme={theme}
                label={t('options.soraBlank')}
                onToggle={() => actions?.sora?.onTuningChange?.({ blank: !tuning.blank })}
            >
                <Square size={14} />
            </QuickControlToggle>
        );
    },
    resetSettings: actions => actions?.sora?.onResetTuning?.(),
});
