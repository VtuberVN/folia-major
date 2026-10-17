import React from 'react';
import { Layers } from 'lucide-react';
import { DEFAULT_NOMAND_BACKGROUND_TUNING } from '../../../../types';
import NomandBackgroundLayer, { resolveNomandSourceUrl } from './NomandBackgroundLayer';
import NomandBackgroundSettingsCard from './NomandBackgroundSettingsCard';
import { defineVisualizerBackground } from '../definition';
import { QuickControlToggle } from '../../../shared/QuickControlChip';

// src/components/visualizer/backgrounds/nomand/entry.tsx
// Registers the Paper image-effect shell background.

export default defineVisualizerBackground({
    mode: 'nomand',
    order: 30,
    labelKey: 'options.visualizerBackgroundModeNomand',
    labelFallback: 'Nomand',
    // 漫游：像素块
    glyph: (
        <>
            <rect x="4" y="4" width="6.5" height="6.5" rx="0.8" />
            <rect x="13.5" y="4" width="6.5" height="6.5" rx="0.8" opacity="0.45" />
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="0.8" opacity="0.45" />
            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="0.8" />
        </>
    ),
    command: {
        title: 'Background: Nomand',
        description: 'Switch background to theme-colored image dithering',
        keywords: ['nomand', 'dithering', 'dither', 'shader background', '漫游', '像素画', '像素画背景', '抖动背景', '网点背景', '主题色背景'],
    },
    // The shader draws one image and cannot blend to another, so a new song's image comes as a new copy;
    // the copy on screen was already rebuilt for every new image (its elements are keyed by it).
    song: ({ config, coverUrl }) => [
        resolveNomandSourceUrl(coverUrl, config?.customImage, { ...DEFAULT_NOMAND_BACKGROUND_TUNING, ...config?.nomand?.tuning }) ?? null,
    ],
    render: ({ config, coverUrl, theme, isDaylight }) => (
        <NomandBackgroundLayer
            coverUrl={coverUrl}
            monetBackgroundImage={config?.customImage}
            tuning={config?.nomand?.tuning}
            theme={theme}
            isDaylight={isDaylight}
        />
    ),
    renderSettingsPanel: ({ config, actions, ...props }) => (
        <NomandBackgroundSettingsCard
            {...props}
            tuning={config?.nomand?.tuning ?? DEFAULT_NOMAND_BACKGROUND_TUNING}
            onTuningChange={actions?.nomand?.onTuningChange}
            monetBackgroundImage={config?.customImage}
            onUploadMonetBackgroundImage={actions?.customImage?.onUpload}
            onClearMonetBackgroundImage={actions?.customImage?.onClear}
            isLoadingMonetBackgroundImage={actions?.customImage?.isLoading}
        />
    ),
    renderQuickControls: ({ config, actions, t, theme }) => {
        const tuning = config?.nomand?.tuning ?? DEFAULT_NOMAND_BACKGROUND_TUNING;

        return (
            <QuickControlToggle
                active={tuning.overlayEnabled}
                theme={theme}
                label={t('options.nomandBackgroundOverlay')}
                onToggle={() => actions?.nomand?.onTuningChange?.({ overlayEnabled: !tuning.overlayEnabled })}
            >
                <Layers size={14} />
            </QuickControlToggle>
        );
    },
    resetSettings: actions => actions?.nomand?.onResetTuning?.(),
});
