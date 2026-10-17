import React from 'react';
import { defineVisualizer } from '../definition';
import { TiltSettingsPanel } from '../settingsPanels';

const VisualizerTilt = React.lazy(() => import('./VisualizerTilt'));

// src/components/visualizer/tilt/entry.tsx
// Registers Tilt and its preview tuning panel.
export default defineVisualizer({
    mode: 'tilt',
    order: 70,
    labelKey: 'ui.visualizerTilt',
    labelFallback: 'Tilt',
    previewSeed: 'tilt',
    previewStartOffset: 0,
    // 倾诉：主行水平，副行倾斜
    glyph: (
        <>
            <path d="M4 9h16" />
            <path d="M5 16.5l14-3" opacity="0.55" />
        </>
    ),
    command: {
        title: 'Visualizer: Tilt',
        description: 'Switch to tilt visualizer',
        keywords: ['tilt', '倾诉'],
    },
    render: props => <VisualizerTilt {...props} />,
    renderSettingsPanel: props => <TiltSettingsPanel {...props} />,
});
