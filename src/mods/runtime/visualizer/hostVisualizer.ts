import { useVisualizerSettingsStore } from '@/stores/useVisualizerSettingsStore';
import type { LyricRenderQuality } from '@/types';
import type { ModRuntimeInfo } from '../../types';
import type { FoliumLyricRenderQuality, FoliumRenderQualityChangeOrigin } from '../../folium/contract';
import { emitFoliumEvent, hasFoliumEventHandlers } from '../../folium/events';
import { registerFoliumVisualizerSource, type FoliumVisualizerSource } from '../../folium/visualizer/service';

// src/mods/runtime/visualizer/hostVisualizer.ts
// The main window's source of `folium.visualizer` and of the `visualizer.renderQualityChanged` event (Folium
// 1.8). The visualizer settings store is the one place the global lyric render quality lives: a mod's write
// goes through the store's action, the same one Settings → Performance & motion calls, and the styles follow
// the store. A style's own override (in its tuning) is never read or written here. Installed in the main
// window only (mainWindowStart.ts).
//
// The host's LyricRenderScale / LyricAntialias and the contract's FoliumLyricRenderScale / FoliumLyricAntialias
// are the same lists: the store's value is handed to mods as it is, and a mod's checked value to the store,
// so a value either side gains and the other lacks fails to compile here.

type VisualizerSettingsState = ReturnType<typeof useVisualizerSettingsStore.getState>;

let frozenFor: LyricRenderQuality | null = null;
let frozenQuality: FoliumLyricRenderQuality | null = null;

/** The global level, frozen, for `getRenderQuality()` and the event: the same object until the store's value changes. */
export const buildFoliumRenderQuality = (): FoliumLyricRenderQuality => {
    const quality = useVisualizerSettingsStore.getState().lyricRenderQuality;
    if (quality !== frozenFor || !frozenQuality) {
        frozenFor = quality;
        frozenQuality = Object.freeze({ scale: quality.scale, antialias: quality.antialias });
    }
    return frozenQuality;
};

// The mod whose write is in the store's action right now: the store's subscribers run inside it.
let writingModId: string | null = null;

/** What `folium.visualizer` goes through in the main window: the visualizer settings store, through its action. */
export const FOLIUM_HOST_VISUALIZER_SOURCE: FoliumVisualizerSource = Object.freeze({
    getRenderQuality: buildFoliumRenderQuality,
    setRenderQuality: (mod: ModRuntimeInfo, quality: FoliumLyricRenderQuality) => {
        const before = useVisualizerSettingsStore.getState().lyricRenderQuality;
        writingModId = mod.id;
        try {
            useVisualizerSettingsStore.getState().handleSetLyricRenderQuality({ scale: quality.scale, antialias: quality.antialias });
        } finally {
            writingModId = null;
        }
        const after = useVisualizerSettingsStore.getState().lyricRenderQuality;
        const changed = after !== before;
        if (changed) console.info(`[FoliumVisualizer] ${mod.id} set the lyric render quality to ${after.scale}x, antialias ${after.antialias}`);
        return changed;
    },
});

/* What the event compares: the level, as one string. */
const signatureOf = (quality: FoliumLyricRenderQuality) => `${quality.scale}|${quality.antialias}`;

let lastSignature = '';
// The origins of the changes of this task, in order; emptied when the event of the task is made.
let pendingOrigins: FoliumRenderQualityChangeOrigin[] = [];

/*
 * visualizer.renderQualityChanged: one event for all the changes of a task, a microtask after the first, read
 * from the level as it settled, with the origin of the last change. A level that ends where it began fires
 * none. The signature is kept up to date while no mod listens, so a mod that starts listening later is not
 * told of changes that came before it.
 */
const emitRenderQualityChange = () => {
    const origins = pendingOrigins;
    pendingOrigins = [];
    const quality = buildFoliumRenderQuality();
    const signature = signatureOf(quality);
    if (signature === lastSignature) return;
    lastSignature = signature;
    if (!hasFoliumEventHandlers('visualizer.renderQualityChanged')) return;
    const origin = origins[origins.length - 1] ?? Object.freeze({ kind: 'user' as const, modId: null });
    emitFoliumEvent('visualizer.renderQualityChanged', { quality, origin });
};

/* The store changed: a write of a mod's when one is in the action, anyone else's otherwise. */
const onVisualizerSettingsChange = (state: VisualizerSettingsState, previous: VisualizerSettingsState) => {
    if (state.lyricRenderQuality === previous.lyricRenderQuality) return;
    pendingOrigins.push(Object.freeze(writingModId !== null
        ? { kind: 'mod' as const, modId: writingModId }
        : { kind: 'user' as const, modId: null }));
    if (pendingOrigins.length === 1) queueMicrotask(emitRenderQualityChange);
};

let installed = false;

/** Installs the `folium.visualizer` source and `visualizer.renderQualityChanged` (main window only; idempotent). */
export const installFoliumHostVisualizer = () => {
    if (installed) return;
    installed = true;
    registerFoliumVisualizerSource(FOLIUM_HOST_VISUALIZER_SOURCE);
    // The starting point: what is there before any mod could listen is no change.
    lastSignature = signatureOf(buildFoliumRenderQuality());
    useVisualizerSettingsStore.subscribe(onVisualizerSettingsChange);
};
