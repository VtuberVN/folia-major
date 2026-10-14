// src/stores/useSignalPathStore.ts
// Hi-Fi signal-path telemetry: track formats, bit depths, and output engine state.

import { create } from 'zustand';

export interface SignalSnapshot {
    session?: string;
    backend: 'wasapi-exclusive' | 'browser';
    deviceId?: string;
    sampleRate?: number;
    channels?: number;
    bitsPerSample?: number;
    sourceCodec?: string;
    sourceSampleRate?: number;
    sourceBitsPerSample?: number;
    sourceBitrate?: number;
    bitPerfect?: boolean;
    outputFormat?: string;
    processingMode?: 'integer-direct' | 'compatibility';
    volumeDb?: number;
}

export type SignalPathStoreState = {
    snapshot: SignalSnapshot | null;
    owner: string;
    failureCode: string | null;
    setSnapshot: (snapshot: SignalSnapshot | null) => void;
    setFailureCode: (code: string | null) => void;
    clear: () => void;
};

export const useSignalPathStore = create<SignalPathStoreState>((set) => ({
    snapshot: null,
    owner: '',
    failureCode: null,
    setSnapshot: (snapshot) => set({ snapshot, failureCode: null }),
    setFailureCode: (failureCode) => set({ failureCode }),
    clear: () => set({ snapshot: null, owner: '', failureCode: null }),
}));

export const publishSignalPath = (snapshot: SignalSnapshot) =>
    useSignalPathStore.getState().setSnapshot(snapshot);

export const clearSignalPath = () =>
    useSignalPathStore.getState().clear();
