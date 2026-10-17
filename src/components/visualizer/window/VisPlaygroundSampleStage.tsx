import React, { useCallback, useRef } from 'react';
import { MotionConfig } from 'framer-motion';
import { stageStyle, useBoxSize } from '../preview/LivePicture';
import { useLyricPreview } from '../preview/LyricPreviewContext';
import { fitStage } from '../preview/previewScale';

// src/components/visualizer/window/VisPlaygroundSampleStage.tsx
// The stage of the big sample in the lyric style window. Several styles lay themselves out from the
// size of the app's window (window.innerWidth, vw, vh), not of the box they are in, so the sample
// draws them as the small pictures do (LivePicture): on a stage as large as the window, scaled
// down until all of it fits the sample's box. A style there looks like the playing page made
// smaller. Only what is drawn is scaled: the sample's own buttons lie over it, outside this stage.

type VisPlaygroundSampleStageProps = {
    children: React.ReactNode;
};

const VisPlaygroundSampleStage: React.FC<VisPlaygroundSampleStageProps> = ({ children }) => {
    const { stage } = useLyricPreview();
    const boxRef = useRef<HTMLDivElement>(null);
    const box = useBoxSize(boxRef);
    const place = box && fitStage(stage, box);
    const scale = place?.scale ?? 1;
    // framer-motion reads the pointer in the page's pixels: on the scaled stage a drag (Monet's
    // portrait) must move by the stage's pixels to stay under the pointer.
    const toStagePoint = useCallback((point: { x: number; y: number }) => ({ x: point.x / scale, y: point.y / scale }), [scale]);

    return (
        <div ref={boxRef} className="absolute inset-0">
            {place && (
                <div className="absolute origin-top-left" style={stageStyle(stage, place) ?? undefined}>
                    <MotionConfig transformPagePoint={toStagePoint}>{children}</MotionConfig>
                </div>
            )}
        </div>
    );
};

export default VisPlaygroundSampleStage;
