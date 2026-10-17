import React from 'react';
import { DEFAULT_MONET_TUNING } from '../../../types';
import { defineVisualizer } from '../definition';
import { MonetSettingsPanel } from './MonetSettingsPanel';

const VisualizerMonet = React.lazy(() => import('./VisualizerMonet'));

// src/components/visualizer/monet/entry.tsx
// Registers the Monet poster visualizer and its mode-owned settings panel.
export default defineVisualizer({
    mode: 'monet',
    order: 90,
    labelKey: 'ui.visualizerMonet',
    labelFallback: 'Monet',
    previewSeed: 'monet',
    previewStartOffset: 0,
    // 莫奈：左侧关键字，右侧立绘
    glyph: (
        <>
            <path d="M3 9.5h7" />
            <path d="M3 13.5h5" opacity="0.55" />
            <rect x="14" y="5" width="7" height="14" rx="1.5" opacity="0.55" />
        </>
    ),
    command: {
        title: 'Visualizer: Monet',
        description: 'Switch to Monet visualizer',
        keywords: ['monet', '莫奈', '切换到可视化：莫奈', '切换到可视化莫奈'],
    },
    seeksOnLineClick: true,
    render: props => {
        const monetTuning = props.monetTuning ?? DEFAULT_MONET_TUNING;
        const lyricsFontScale = props.lyricsFontScale ?? 1;
        return (
            <VisualizerMonet
                {...props}
                monetTuning={{
                    ...monetTuning,
                    fontScale: monetTuning.fontScale * lyricsFontScale,
                }}
            />
        );
    },
    renderSettingsPanel: props => <MonetSettingsPanel {...props} />,
});
