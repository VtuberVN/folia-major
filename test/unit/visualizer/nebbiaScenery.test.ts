import { describe, expect, it } from 'vitest';
import { normalizeNebbiaTuning } from '@/components/visualizer/nebbia/tuning';
import { nebbiaFrameUniforms } from '@/components/visualizer/nebbia/nebbiaFrameUniforms';
import { DEFAULT_NEBBIA_TUNING, NEBBIA_SCENERY } from '@/components/visualizer/nebbia/types';
import type { NebbiaSpot } from '@/components/visualizer/nebbia/nebbiaSpot';
import { nebbiaSeesThrough } from '@/components/visualizer/nebbia/nebbiaBehind';

// test/unit/visualizer/nebbiaScenery.test.ts
// 雾笺窗外的开关和雨：存着的值怎么读回来（可以全关，旧的没有这项就全开、雨斜着），和交给着色器的位、聚光灯强度；
// 窗外是街景还是共用背景，播放页透明时总是透出后面。

const spot = { x: 100, y: 100, r: 50, i: 1 } as unknown as NebbiaSpot;
const uniforms = (scenery: typeof DEFAULT_NEBBIA_TUNING.scenery) => (
    nebbiaFrameUniforms({ ...DEFAULT_NEBBIA_TUNING, scenery }, [0, 0], spot, 800, 600, 0)
);

describe('nebbia scenery toggles', () => {
    it('opens every part for a tuning saved before the toggles existed', () => {
        expect(normalizeNebbiaTuning({ mist: 0.5 }).scenery).toEqual([...NEBBIA_SCENERY]);
    });

    it('keeps everything off, drops unknown parts and puts the rest in order', () => {
        expect(normalizeNebbiaTuning({ scenery: [] }).scenery).toEqual([]);
        expect(normalizeNebbiaTuning({ scenery: ['road', 'ufo', 'spot'] }).scenery).toEqual(['spot', 'road']);
    });

    it('maps the parts to the shader bits (rain slanted by default) and turns the spotlight off through its intensity', () => {
        const all = uniforms([...NEBBIA_SCENERY]);
        expect(all.scenery).toBe(1 | 2 | 4 | 8 | 16 | 32);
        expect(all.spotI).toBeGreaterThan(0);
        const some = uniforms(['buildings', 'cars']);
        expect(some.scenery).toBe(1 | 4 | 16 | 32);
        expect(some.spotI).toBe(0);
        expect(uniforms([]).scenery).toBe(16 | 32);
    });

    it('reads the rain setting and puts it in the shader bits', () => {
        expect(normalizeNebbiaTuning({}).rain).toBe('slant');
        expect(normalizeNebbiaTuning({ rain: 'straight' }).rain).toBe('straight');
        expect(normalizeNebbiaTuning({ rain: 'hail' }).rain).toBe('slant');
        const bits = (rain: typeof DEFAULT_NEBBIA_TUNING.rain) => (
            nebbiaFrameUniforms({ ...DEFAULT_NEBBIA_TUNING, scenery: [], rain }, [0, 0], spot, 800, 600, 0).scenery
        );
        expect([bits('slant'), bits('straight'), bits('off')]).toEqual([16 | 32, 16, 0]);
    });

    it('reads what is outside the window and sees through for the background or a transparent page', () => {
        expect(normalizeNebbiaTuning({}).behind).toBe('night');
        expect(normalizeNebbiaTuning({ behind: 'backdrop' }).behind).toBe('backdrop');
        expect(normalizeNebbiaTuning({ behind: 'moon' }).behind).toBe('night');
        const night = DEFAULT_NEBBIA_TUNING, backdrop = { ...DEFAULT_NEBBIA_TUNING, behind: 'backdrop' as const };
        expect(nebbiaSeesThrough(night, undefined)).toBe(false);
        expect(nebbiaSeesThrough(night, { transparent: true })).toBe(true);
        expect(nebbiaSeesThrough(backdrop, undefined)).toBe(true);
        // 样式小图把背景标成透明表示不画背景，不算播放页透明
        expect(nebbiaSeesThrough(night, { transparent: true }, true)).toBe(false);
        expect(nebbiaSeesThrough(backdrop, { transparent: true }, true)).toBe(true);
    });
});
