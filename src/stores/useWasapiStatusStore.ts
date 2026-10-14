// src/stores/useWasapiStatusStore.ts
// The current WASAPI output mode, surfaced so the UI can tell exclusive from shared at a glance.

import { create } from 'zustand';

export type WasapiMode = 'off' | 'exclusive' | 'shared';

type WasapiStatusState = {
    /** off = feature disabled; exclusive = bit-perfect engine owns output; shared = Chromium output. */
    mode: WasapiMode;
    /** Human-readable detail (device name / reason), display only. */
    detail: string;
    setWasapiMode: (mode: WasapiMode, detail?: string) => void;
};

export const useWasapiStatusStore = create<WasapiStatusState>((set) => ({
    mode: 'off',
    detail: '',
    setWasapiMode: (mode, detail = '') => set({ mode, detail }),
}));

export const setWasapiMode = (mode: WasapiMode, detail?: string) =>
    useWasapiStatusStore.getState().setWasapiMode(mode, detail);
