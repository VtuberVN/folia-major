import type { ModRuntimeInfo } from '../../types';
import type {
    FoliumContextKind,
    FoliumLyricAntialias,
    FoliumLyricRenderQuality,
    FoliumLyricRenderScale,
    FoliumRenderQualityWriteResult,
    FoliumVisualizerService,
} from '../contract';
import type { FoliumStoppedCheck } from '../api';
import type { FoliumPermissionId } from '../shared';

// src/mods/folium/visualizer/service.ts
// `folium.visualizer` (Folium 1.8) as a mod sees it, and the seam it goes through. Like equalizer/service.ts
// this module is loaded in the export window too, so it imports no store and nothing of runtime/: the main
// window installs the source (runtime/visualizer/hostVisualizer.ts, which reads and writes the visualizer
// settings store). Here: the checks in the order the contract gives, and each mod's write allowance.

/** Where the main window's lyric render quality comes from (runtime/visualizer/hostVisualizer.ts). */
export interface FoliumVisualizerSource {
    getRenderQuality(): FoliumLyricRenderQuality;
    /** Sets the global level as the settings page does, for this mod; whether anything changed. */
    setRenderQuality(mod: ModRuntimeInfo, quality: FoliumLyricRenderQuality): boolean;
}

let visualizerSource: FoliumVisualizerSource | null = null;

/** Installs (or with null removes) the main window's `folium.visualizer` source. */
export const registerFoliumVisualizerSource = (source: FoliumVisualizerSource | null) => {
    visualizerSource = source;
};

/** The values the contract promises for 1.x (FoliumLyricRenderScale / FoliumLyricAntialias); setRenderQuality takes these and no others. */
export const FOLIUM_LYRIC_RENDER_SCALES = [0.5, 0.75, 1, 1.5, 2] as const satisfies readonly FoliumLyricRenderScale[];
export const FOLIUM_LYRIC_ANTIALIAS_MODES = ['auto', 'on', 'off'] as const satisfies readonly FoliumLyricAntialias[];

/*
 * As in equalizer/service.ts: `satisfies` only keeps out values the contract does not have; these two keep in
 * every value it does, so a value the contract gains and the lists lack would fail to compile rather than be
 * refused as an invalid argument.
 */
type FoliumRenderValuesMissing<All, Listed> = [Exclude<All, Listed>] extends [never] ? true : never;
const scalesComplete: FoliumRenderValuesMissing<FoliumLyricRenderScale, typeof FOLIUM_LYRIC_RENDER_SCALES[number]> = true;
const antialiasComplete: FoliumRenderValuesMissing<FoliumLyricAntialias, typeof FOLIUM_LYRIC_ANTIALIAS_MODES[number]> = true;
void scalesComplete;
void antialiasComplete;

/** The permission a write needs. */
const RENDER_QUALITY: FoliumPermissionId = 'visualizer.renderQuality';

/** The shortest time between two counted writes of one mod. */
const RENDER_QUALITY_WRITE_MIN_INTERVAL_MS = 1000;
/** The counted writes one mod may make in any 60 seconds. */
const RENDER_QUALITY_WRITES_PER_MINUTE = 20;
const MINUTE_MS = 60_000;

/** When each mod's counted writes were, within the last minute, by mod id: a reload of the mod keeps them. */
const countedWrites = new Map<string, number[]>();

/* Whether one more counted write of this mod fits its allowance now. */
const withinAllowance = (modId: string, now: number): boolean => {
    const recent = (countedWrites.get(modId) ?? []).filter((at) => now - at < MINUTE_MS);
    countedWrites.set(modId, recent);
    const last = recent[recent.length - 1];
    if (last !== undefined && now - last < RENDER_QUALITY_WRITE_MIN_INTERVAL_MS) return false;
    return recent.length < RENDER_QUALITY_WRITES_PER_MINUTE;
};

const countWrite = (modId: string, now: number) => {
    countedWrites.set(modId, [...(countedWrites.get(modId) ?? []), now]);
};

/** Forgets every mod's counted writes; for tests (call it in afterEach). */
export const resetFoliumVisualizerWriteLimitsForTest = () => {
    countedWrites.clear();
};

const invalid = (problem: string) => new TypeError(`invalid-arguments: ${problem}`);

const isListed = <T>(list: readonly T[], value: unknown): value is T => (list as readonly unknown[]).includes(value);

/* The patch argument of setRenderQuality: an object whose `scale` and `antialias`, where given, are listed values. Other keys are dropped. */
const patchOf = (patch: unknown): Partial<FoliumLyricRenderQuality> => {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw invalid('patch must be { scale?, antialias? }');
    const { scale, antialias } = patch as Record<string, unknown>;
    if (scale !== undefined && !isListed(FOLIUM_LYRIC_RENDER_SCALES, scale)) {
        throw invalid(`scale must be one of ${FOLIUM_LYRIC_RENDER_SCALES.join(', ')}`);
    }
    if (antialias !== undefined && !isListed(FOLIUM_LYRIC_ANTIALIAS_MODES, antialias)) {
        throw invalid(`antialias must be one of ${FOLIUM_LYRIC_ANTIALIAS_MODES.join(', ')}`);
    }
    return {
        ...(scale !== undefined ? { scale } : {}),
        ...(antialias !== undefined ? { antialias } : {}),
    };
};

/**
 * `folium.visualizer` for one mod in `context`. `stopped` refuses the writes of an activation that was torn
 * down (and names the call in the console).
 */
export const createFoliumVisualizerService = (
    mod: ModRuntimeInfo,
    context: FoliumContextKind,
    stopped: FoliumStoppedCheck = () => false,
): FoliumVisualizerService => {
    /* The installed source; outside the main window, and before it is installed, every call throws. */
    const sourceOf = (): FoliumVisualizerSource => {
        if (context !== 'main' || !visualizerSource) throw new Error(`visualizer-unavailable-in-${context}-context`);
        return visualizerSource;
    };

    return Object.freeze({
        getRenderQuality: () => sourceOf().getRenderQuality(),
        /*
         * The permission first, then where the call is made (as equalizer/service.ts), then the patch, a
         * stopped mod, a write that changes nothing (accepted, uncounted), the allowance; then the write,
         * counted when it changed something.
         */
        setRenderQuality: (patch: Partial<FoliumLyricRenderQuality>): FoliumRenderQualityWriteResult => {
            if (!mod.permissions.includes(RENDER_QUALITY)) throw new Error(`permission-denied:${RENDER_QUALITY}`);
            const source = sourceOf();
            const checked = patchOf(patch);
            if (stopped('visualizer.setRenderQuality')) return Object.freeze({ ok: false, reason: 'stopped' });
            const current = source.getRenderQuality();
            const next: FoliumLyricRenderQuality = Object.freeze({
                scale: checked.scale ?? current.scale,
                antialias: checked.antialias ?? current.antialias,
            });
            if (next.scale === current.scale && next.antialias === current.antialias) {
                return Object.freeze({ ok: true, quality: current });
            }
            const now = Date.now();
            if (!withinAllowance(mod.id, now)) return Object.freeze({ ok: false, reason: 'rate-limited' });
            if (source.setRenderQuality(mod, next)) countWrite(mod.id, now);
            return Object.freeze({ ok: true, quality: source.getRenderQuality() });
        },
    });
};
