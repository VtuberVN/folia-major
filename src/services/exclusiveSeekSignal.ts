// src/services/exclusiveSeekSignal.ts
//
// Marks a *user* seek so the WASAPI exclusive bridge can tell it apart from the app moving the
// transport element on its own (a fresh blob URL for the same song, session restore, ...).
//
// Under exclusive output Chromium's transport clock is frozen, so the element's `seeked` events are
// the only channel a user seek has to reach the engine - but the app also fires `seeked` for its own
// resets, and mirroring those would restart playback. Every user-facing seek path calls
// `markUserSeek()` right before it moves the element; the bridge then knows the next `seeked` is real.

let userSeekUntil = 0;

/** Call immediately before a user-initiated seek moves the transport element. */
export const markUserSeek = (): void => {
    userSeekUntil = Date.now() + 3500;
};

/** Clear the user seek flag once the engine has confirmed the new position. */
export const clearUserSeek = (): void => {
    userSeekUntil = 0;
};

/** True if a user seek is in flight. */
export const consumeUserSeek = (): boolean => {
    return Date.now() < userSeekUntil;
};

/** True if a user seek is actively in flight (non-destructive check). */
export const isUserSeekInProgress = (): boolean => {
    return Date.now() < userSeekUntil;
};
