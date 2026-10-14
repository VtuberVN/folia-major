// src/services/exclusiveClock.ts
// The exclusive renderer owns the endpoint, which stalls Chromium's own transport clock: the
// HTMLAudioElement's `currentTime` freezes while the engine keeps playing. The UI clock (progress
// bar, lyrics) therefore has to follow the engine. The engine reports its position a few times a
// second; between reports the render loop interpolates so the bar and karaoke move smoothly.

let positionSec = 0;
let tickAtMs = 0;
let running = false;

/** Record an engine position report and mark the engine clock live. */
export const setExclusiveClock = (nextPositionSec: number, nowMs: number = performance.now()) => {
    positionSec = nextPositionSec;
    tickAtMs = nowMs;
    running = true;
};

/** The engine is no longer playing (paused, stopped, error, fallback): freeze the UI clock. */
export const clearExclusiveClock = () => {
    running = false;
};

export const isExclusiveClockRunning = () => running;

/** Interpolated engine position now, in seconds. Only meaningful while running. */
export const getExclusiveClockSec = (nowMs: number = performance.now()) => {
    if (!running) return positionSec;
    return positionSec + Math.max(0, (nowMs - tickAtMs) / 1000);
};
