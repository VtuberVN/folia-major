import { useSyncExternalStore } from 'react';
import { createMainWindowRenderActivityStore } from './mainWindowRenderActivity';

// Main-window activity subscriptions are shared by the visualizer and audio bridge.
const activity = createMainWindowRenderActivityStore(
    typeof window !== 'undefined' ? window.electron : undefined,
    typeof document !== 'undefined' ? document : undefined,
);

export const useMainWindowRenderActivity = () => useSyncExternalStore(
    activity.subscribe, activity.getSnapshot, activity.getSnapshot,
);
