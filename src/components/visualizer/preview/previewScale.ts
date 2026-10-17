// src/components/visualizer/preview/previewScale.ts
// The arithmetic of a small live picture. Several lyric styles lay themselves out from the size of
// the app's window, not of the box they are in, and the Pixi styles never make a canvas smaller
// than 320 by 240. So a picture draws the style on a stage as large as the window, where it lays
// out as on the playing page, and scales that stage down until it covers the picture's box. The
// big sample of the lyric style window does the same, but fits the whole stage into its box.

export type Size = { width: number; height: number };

/** Where the scaled stage sits in the box, from the box's top left corner. */
export type StagePlace = { scale: number; left: number; top: number };

/** Scales a stage by the ratio `pick` chooses of the two and centres it in the box. Null while either has no size. */
const placeStage = (stage: Size, box: Size, pick: (across: number, down: number) => number): StagePlace | null => {
    if (!(stage.width > 0 && stage.height > 0 && box.width > 0 && box.height > 0)) {
        return null;
    }
    const scale = pick(box.width / stage.width, box.height / stage.height);
    return {
        scale,
        left: (box.width - stage.width * scale) / 2,
        top: (box.height - stage.height * scale) / 2,
    };
};

/**
 * Places a stage in a box so that it covers the box: scaled by the larger of the two ratios and
 * centred, so what sticks out is cut evenly at both sides. Null while either has no size.
 */
export const coverStage = (stage: Size, box: Size): StagePlace | null => placeStage(stage, box, Math.max);

/**
 * Places a stage in a box so that all of it shows: scaled by the smaller of the two ratios and
 * centred, so the box is left empty evenly at two sides. Null while either has no size.
 */
export const fitStage = (stage: Size, box: Size): StagePlace | null => placeStage(stage, box, Math.min);
