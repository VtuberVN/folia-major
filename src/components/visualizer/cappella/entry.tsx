import React from 'react';
import { defineVisualizer } from '../definition';
import { CappellaSettingsPanel } from '../settingsPanels';

const VisualizerCappella = React.lazy(() => import('./VisualizerCappella'));

// src/components/visualizer/cappella/entry.tsx
// Registers the Cappella chat visualizer mode.
export default defineVisualizer({
    mode: 'cappella',
    order: 110,
    labelKey: 'ui.visualizerCappella',
    labelFallback: 'Cappella',
    previewSeed: 'cappella',
    previewStartOffset: 0,
    // 群唱：左右交替的对话气泡
    glyph: (
        <>
            <rect x="3" y="5" width="12" height="6" rx="3" />
            <rect x="9" y="13.5" width="12" height="6" rx="3" opacity="0.5" />
        </>
    ),
    command: {
        title: 'Visualizer: Cappella',
        description: 'Switch to cappella visualizer',
        keywords: ['cappella', '群唱'],
    },
    render: props => <VisualizerCappella {...props} />,
    renderSettingsPanel: props => <CappellaSettingsPanel {...props} />,
});
