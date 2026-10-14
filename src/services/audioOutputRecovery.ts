// src/services/audioOutputRecovery.ts
//
// A renderer-side signal that Chromium's audio output was torn down (WASAPI exclusive mode took the
// endpoint) and must be re-acquired when playback returns to shared output.
//
// The AudioContext is created once for the whole app and cannot be recreated (createMediaElementSource
// only works once), so recovery has to re-target its existing output rather than build a new graph.

type Listener = () => void;

const listeners = new Set<Listener>();

export const onRecoverAudioOutput = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const recoverAudioOutput = (): void => {
    listeners.forEach((listener) => {
        try {
            listener();
        } catch {
            // A failed recovery on one listener must not block the others.
        }
    });
};
