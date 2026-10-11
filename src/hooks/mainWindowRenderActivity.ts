// Main-window visual work is separate from transport and external lyric clocks.
export type MainWindowRenderState = { visible: boolean; wallpaper: boolean };
export type MainWindowRenderActivity = { renderEnabled: boolean; audioAnalysisEnabled: boolean };
type ObsStatus = { enabled: boolean; clientCount: number };
export type MainWindowRenderBridge = {
    getMainWindowRenderState?: () => Promise<MainWindowRenderState>;
    onMainWindowRenderStateChanged?: (callback: (state: MainWindowRenderState) => void) => () => void;
    getObsBrowserSourceStatus?: () => Promise<ObsStatus>;
    onObsBrowserSourceStatusChanged?: (callback: (state: ObsStatus) => void) => () => void;
};

/** Subscribe once for all hosts, ignoring initial IPC responses overtaken by events. */
export function createMainWindowRenderActivityStore(
    bridge: MainWindowRenderBridge | undefined,
    visibility: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> | undefined,
) {
    let state: MainWindowRenderState = { visible: bridge ? true : !visibility?.hidden, wallpaper: false };
    let obsConnected = false;
    let snapshot: MainWindowRenderActivity = { renderEnabled: state.visible, audioAnalysisEnabled: state.visible };
    const listeners = new Set<() => void>();
    let stop: (() => void) | undefined;
    const update = () => {
        const renderEnabled = state.visible || state.wallpaper;
        const audioAnalysisEnabled = renderEnabled || obsConnected;
        if (snapshot.renderEnabled === renderEnabled && snapshot.audioAnalysisEnabled === audioAnalysisEnabled) return;
        snapshot = { renderEnabled, audioAnalysisEnabled };
        for (const listener of listeners) listener();
    };
    const start = () => {
        let disposed = false;
        let windowRevision = 0;
        let obsRevision = 0;
        const onVisibility = () => {
            state = { ...state, visible: !visibility?.hidden };
            update();
        };
        const unsubscribeWindow = bridge?.onMainWindowRenderStateChanged?.(next => {
            if (disposed) return;
            windowRevision++;
            state = next;
            update();
        });
        const unsubscribeObs = bridge?.onObsBrowserSourceStatusChanged?.(next => {
            if (disposed) return;
            obsRevision++;
            obsConnected = next.enabled && next.clientCount > 0;
            update();
        });
        if (bridge?.getMainWindowRenderState) {
            void bridge.getMainWindowRenderState().then(next => {
                if (disposed || windowRevision > 0) return;
                state = next;
                update();
            }).catch(() => {});
        } else if (!bridge) {
            visibility?.addEventListener('visibilitychange', onVisibility);
            onVisibility();
        }
        void bridge?.getObsBrowserSourceStatus?.().then(next => {
            if (disposed || obsRevision > 0) return;
            obsConnected = next.enabled && next.clientCount > 0;
            update();
        }).catch(() => {});
        stop = () => {
            disposed = true;
            unsubscribeWindow?.();
            unsubscribeObs?.();
            visibility?.removeEventListener('visibilitychange', onVisibility);
        };
    };
    return {
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            if (listeners.size === 1) start();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    stop?.();
                    stop = undefined;
                }
            };
        },
    };
}
