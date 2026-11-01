// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stores read localStorage at import time; see foliumUiRegistries.test.ts.
const storage = vi.hoisted(() => {
    const items = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => items.get(key) ?? null,
            setItem: (key: string, value: string) => { items.set(key, String(value)); },
            removeItem: (key: string) => { items.delete(key); },
            clear: () => items.clear(),
            key: (index: number) => Array.from(items.keys())[index] ?? null,
            get length() { return items.size; },
        },
    });
    return items;
});

import type { ModRuntimeInfo } from '@/mods/types';
import type { FoliumLyricRenderQuality, FoliumRenderQualityChangeOrigin, FoliumVisualizerService } from '@/mods/folium/contract';
import { createFoliumClientApi } from '@/mods/folium/api';
import { addFoliumEventHandler, removeFoliumEventHandlers } from '@/mods/folium/events';
import {
    FOLIUM_LYRIC_ANTIALIAS_MODES,
    FOLIUM_LYRIC_RENDER_SCALES,
    registerFoliumVisualizerSource,
    resetFoliumVisualizerWriteLimitsForTest,
} from '@/mods/folium/visualizer/service';
import { FOLIUM_HOST_VISUALIZER_SOURCE, installFoliumHostVisualizer } from '@/mods/runtime/visualizer/hostVisualizer';
import { DEFAULT_LYRIC_RENDER_QUALITY, LYRIC_ANTIALIAS_MODES, LYRIC_RENDER_QUALITY_STORAGE_KEY, LYRIC_RENDER_SCALES } from '@/utils/lyricRenderQuality';
import { useVisualizerSettingsStore } from '@/stores/useVisualizerSettingsStore';
import { clientApiOptions } from './clientApiOptions';

// test/unit/mod-system/foliumVisualizer.test.ts
// Folium 1.8 `folium.visualizer` and `visualizer.renderQualityChanged`, end to end over the real visualizer
// settings store and the real host source: the frozen global level; a write that lands where the settings
// page's does; the checks in the contract's order, a write that changes nothing accepted whatever else
// holds; the allowance per mod; and one event per task, with the origin a mod can step back by.

installFoliumHostVisualizer();

const settings = () => useVisualizerSettingsStore.getState();
const initialSettings = settings();
const flush = () => new Promise<void>((resolve) => { queueMicrotask(resolve); });

const modInfo = (id: string, overrides: Partial<ModRuntimeInfo> = {}): ModRuntimeInfo => ({
    id, name: `Mod ${id}`, version: '1.0.0', author: null, description: null, permissions: ['visualizer.renderQuality'],
    status: 'loaded', error: null, enabled: true, trustStale: false, signature: { status: 'unsigned', reason: null, keyId: null, keyLabel: null, signedAt: null }, devSource: false, experimental: [], embedOrigins: [],
    folia: null, hasMain: false, clientUrl: null,
    ...overrides,
});

const visualizerOf = (mod: ModRuntimeInfo, options = clientApiOptions('main')): FoliumVisualizerService => (
    createFoliumClientApi(mod, options).visualizer
);
const rqMod = () => visualizerOf(modInfo('rq-mod'));
const otherMod = () => visualizerOf(modInfo('other-mod'));

const seen: Array<{ quality: FoliumLyricRenderQuality; origin: FoliumRenderQualityChangeOrigin }> = [];
const listen = () => {
    addFoliumEventHandler('listener-mod', 'visualizer.renderQualityChanged', (event) => { seen.push(event); });
};

beforeEach(async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    storage.clear();
    useVisualizerSettingsStore.setState(initialSettings, true);
    useVisualizerSettingsStore.setState({ lyricRenderQuality: { ...DEFAULT_LYRIC_RENDER_QUALITY } });
    // What the resets set off goes out with no one listening.
    await flush();
    seen.length = 0;
});

afterEach(() => {
    removeFoliumEventHandlers('listener-mod');
    resetFoliumVisualizerWriteLimitsForTest();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('the contract\'s values', () => {
    it('are the host\'s, so every value the contract promises is one the store keeps', () => {
        expect([...FOLIUM_LYRIC_RENDER_SCALES]).toEqual([...LYRIC_RENDER_SCALES]);
        expect([...FOLIUM_LYRIC_ANTIALIAS_MODES]).toEqual([...LYRIC_ANTIALIAS_MODES]);
    });
});

describe('getRenderQuality', () => {
    it('reads the global level, frozen, the same object until it changes', () => {
        const quality = rqMod().getRenderQuality();
        expect(quality).toEqual({ scale: 1, antialias: 'auto' });
        expect(Object.isFrozen(quality)).toBe(true);
        expect(rqMod().getRenderQuality()).toBe(quality);
        settings().handleSetLyricRenderQuality({ scale: 1.5 });
        expect(rqMod().getRenderQuality()).toEqual({ scale: 1.5, antialias: 'auto' });
    });

    it('needs no permission', () => {
        expect(visualizerOf(modInfo('reader', { permissions: [] })).getRenderQuality()).toEqual({ scale: 1, antialias: 'auto' });
    });
});

describe('setRenderQuality', () => {
    it('changes the fields it is given, as the settings page does, and saves the level', () => {
        const result = rqMod().setRenderQuality({ scale: 2 });
        expect(result).toEqual({ ok: true, quality: { scale: 2, antialias: 'auto' } });
        expect(Object.isFrozen(result)).toBe(true);
        expect(settings().lyricRenderQuality).toEqual({ scale: 2, antialias: 'auto' });
        expect(JSON.parse(storage.get(LYRIC_RENDER_QUALITY_STORAGE_KEY)!)).toEqual({ scale: 2, antialias: 'auto' });
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + 2000);
        expect(rqMod().setRenderQuality({ antialias: 'off' })).toEqual({ ok: true, quality: { scale: 2, antialias: 'off' } });
    });

    it('takes every value the contract promises', () => {
        for (const scale of FOLIUM_LYRIC_RENDER_SCALES) {
            resetFoliumVisualizerWriteLimitsForTest();
            expect(rqMod().setRenderQuality({ scale }), String(scale)).toMatchObject({ ok: true, quality: { scale } });
        }
        for (const antialias of FOLIUM_LYRIC_ANTIALIAS_MODES) {
            resetFoliumVisualizerWriteLimitsForTest();
            expect(rqMod().setRenderQuality({ antialias }), antialias).toMatchObject({ ok: true, quality: { antialias } });
        }
    });

    it('throws a TypeError for a patch it cannot take, and changes nothing', () => {
        const bad = [null, 'high', 2, [2], { scale: 3 }, { scale: '2' }, { scale: Number.NaN }, { antialias: 'msaa' }, { antialias: true }, { scale: 2, antialias: 'smaa' }];
        for (const patch of bad) {
            expect(() => rqMod().setRenderQuality(patch as unknown as Partial<FoliumLyricRenderQuality>), JSON.stringify(patch)).toThrow(TypeError);
        }
        expect(() => rqMod().setRenderQuality({ scale: 3 } as unknown as Partial<FoliumLyricRenderQuality>)).toThrow(/^invalid-arguments: /);
        expect(settings().lyricRenderQuality).toEqual({ scale: 1, antialias: 'auto' });
    });

    it('ignores other keys, and takes {} as a write that changes nothing', () => {
        expect(rqMod().setRenderQuality({})).toEqual({ ok: true, quality: { scale: 1, antialias: 'auto' } });
        expect(rqMod().setRenderQuality({ scale: 0.5, fps: 30 } as unknown as Partial<FoliumLyricRenderQuality>)).toEqual({
            ok: true,
            quality: { scale: 0.5, antialias: 'auto' },
        });
    });
});

describe('the checks', () => {
    it('refuse a write without visualizer.renderQuality', () => {
        const reader = visualizerOf(modInfo('reader', { permissions: [] }));
        expect(() => reader.setRenderQuality({ scale: 2 })).toThrow('permission-denied:visualizer.renderQuality');
        // The permission comes before the arguments.
        expect(() => reader.setRenderQuality(null as unknown as Partial<FoliumLyricRenderQuality>)).toThrow('permission-denied:visualizer.renderQuality');
        expect(settings().lyricRenderQuality).toEqual({ scale: 1, antialias: 'auto' });
    });

    it('throw in the export window, the permission first', () => {
        const exported = visualizerOf(modInfo('rq-mod'), clientApiOptions('export'));
        expect(() => exported.getRenderQuality()).toThrow('visualizer-unavailable-in-export-context');
        expect(() => exported.setRenderQuality({ scale: 2 })).toThrow('visualizer-unavailable-in-export-context');
        const reader = visualizerOf(modInfo('reader', { permissions: [] }), clientApiOptions('export'));
        expect(() => reader.setRenderQuality({ scale: 2 })).toThrow('permission-denied:visualizer.renderQuality');
    });

    it('throw in the main window before the source is installed', () => {
        registerFoliumVisualizerSource(null);
        try {
            expect(() => rqMod().getRenderQuality()).toThrow('visualizer-unavailable-in-main-context');
            expect(() => rqMod().setRenderQuality({ scale: 2 })).toThrow('visualizer-unavailable-in-main-context');
        } finally {
            registerFoliumVisualizerSource(FOLIUM_HOST_VISUALIZER_SOURCE);
        }
    });

    it('answer `stopped` once the activation was torn down, after checking the arguments', () => {
        const stopped = visualizerOf(modInfo('rq-mod'), clientApiOptions('main', { stopped: () => true }));
        expect(stopped.setRenderQuality({ scale: 2 })).toEqual({ ok: false, reason: 'stopped' });
        expect(() => stopped.setRenderQuality({ scale: 3 } as unknown as Partial<FoliumLyricRenderQuality>)).toThrow(TypeError);
        expect(settings().lyricRenderQuality).toEqual({ scale: 1, antialias: 'auto' });
    });
});

describe('the allowance', () => {
    it('allows one counted write a second, per mod', () => {
        vi.useFakeTimers();
        const start = Date.parse('2026-10-31T10:00:00.000Z');
        vi.setSystemTime(start);
        expect(rqMod().setRenderQuality({ scale: 2 }).ok).toBe(true);
        vi.setSystemTime(start + 500);
        expect(rqMod().setRenderQuality({ scale: 0.5 })).toEqual({ ok: false, reason: 'rate-limited' });
        // Another mod has an allowance of its own.
        expect(otherMod().setRenderQuality({ scale: 0.5 }).ok).toBe(true);
        vi.setSystemTime(start + 1600);
        expect(rqMod().setRenderQuality({ scale: 0.75 }).ok).toBe(true);
    });

    it('allows 20 counted writes a minute, and lets the minute slide', () => {
        vi.useFakeTimers();
        const start = Date.parse('2026-10-31T11:00:00.000Z');
        for (let index = 0; index < 20; index += 1) {
            vi.setSystemTime(start + index * 1000);
            expect(rqMod().setRenderQuality({ scale: index % 2 === 0 ? 2 : 1 }).ok, String(index)).toBe(true);
        }
        vi.setSystemTime(start + 20_000);
        expect(rqMod().setRenderQuality({ scale: 0.5 })).toEqual({ ok: false, reason: 'rate-limited' });
        vi.setSystemTime(start + 60_000);
        expect(rqMod().setRenderQuality({ scale: 0.5 }).ok).toBe(true);
    });

    it('never counts or refuses a write that changes nothing', () => {
        vi.useFakeTimers();
        const start = Date.parse('2026-10-31T12:00:00.000Z');
        vi.setSystemTime(start);
        expect(rqMod().setRenderQuality({ scale: 2 }).ok).toBe(true);
        vi.setSystemTime(start + 100);
        expect(rqMod().setRenderQuality({ scale: 2, antialias: 'auto' })).toEqual({ ok: true, quality: { scale: 2, antialias: 'auto' } });
        expect(rqMod().setRenderQuality({})).toEqual({ ok: true, quality: { scale: 2, antialias: 'auto' } });
        vi.setSystemTime(start + 1100);
        expect(rqMod().setRenderQuality({ scale: 1 }).ok).toBe(true);
    });
});

describe('visualizer.renderQualityChanged', () => {
    it('names the mod that wrote, frozen', async () => {
        listen();
        rqMod().setRenderQuality({ scale: 1.5, antialias: 'on' });
        await flush();
        expect(seen).toEqual([{ quality: { scale: 1.5, antialias: 'on' }, origin: { kind: 'mod', modId: 'rq-mod' } }]);
        expect(Object.isFrozen(seen[0].quality)).toBe(true);
        expect(Object.isFrozen(seen[0].origin)).toBe(true);
    });

    it('names the user for a change made anywhere else', async () => {
        listen();
        settings().handleSetLyricRenderQuality({ antialias: 'off' });
        await flush();
        expect(seen).toEqual([{ quality: { scale: 1, antialias: 'off' }, origin: { kind: 'user', modId: null } }]);
    });

    it('comes once for the changes of one task, with the origin of the last', async () => {
        listen();
        rqMod().setRenderQuality({ scale: 2 });
        settings().handleSetLyricRenderQuality({ scale: 0.5 });
        await flush();
        expect(seen).toEqual([{ quality: { scale: 0.5, antialias: 'auto' }, origin: { kind: 'user', modId: null } }]);
    });

    it('does not come for a change that changes nothing, or that ends where it began', async () => {
        listen();
        settings().handleSetLyricRenderQuality({ scale: 1 });
        settings().handleSetLyricRenderQuality({ scale: 2 });
        settings().handleSetLyricRenderQuality({ scale: 1 });
        await flush();
        expect(seen).toEqual([]);
    });

    it('tells a mod that starts listening nothing of what came before', async () => {
        settings().handleSetLyricRenderQuality({ scale: 0.75 });
        await flush();
        listen();
        await flush();
        expect(seen).toEqual([]);
    });
});
