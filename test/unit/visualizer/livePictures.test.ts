import { describe, expect, it } from 'vitest';
import { panelMakesImages, panelPictureTheme } from '../../../src/components/panelTab/controls/panelPictures';
import { imageOf, keepImage, pictureKey, stylePictureKey, themeForPictures } from '../../../src/components/visualizer/preview/pictureImages';
import { afterTry, FIRST_IMAGE_REST_MS, IMAGE_TRIES, imageRest, NEW_IMAGE_REST_MS, pictureWants } from '../../../src/components/visualizer/preview/pictureRule';
import { claimRun, holdTurns, runningPicture, takeTurn, whenFree } from '../../../src/components/visualizer/preview/pictureTurns';
import { coverStage, fitStage } from '../../../src/components/visualizer/preview/previewScale';
import type { Theme } from '../../../src/types';

// test/unit/visualizer/livePictures.test.ts
// The rules of the small pictures of lyric styles that nobody sees by looking: how the window-sized
// stage is scaled into a picture's frame (and into the big sample), which picture runs, when an
// image is made, that images are made one at a time and one picture runs at a time, that none
// starts while the page switches its lyric style, and under which text an image is filed.
// The two "one at a time" rules failing shows far from here: the page stutters, or the playing
// page loses its WebGL context. An image made too often shows as the large sample stopping.

describe('the stage scaled into a picture', () => {
    it('covers a frame of another shape and is centred, so both sides are cut evenly', () => {
        // A 1440x900 window (16:10) in a 16:9 frame: the width decides, the height sticks out.
        const place = coverStage({ width: 1440, height: 900 }, { width: 160, height: 90 })!;
        expect(place.scale).toBeCloseTo(160 / 1440);
        expect(place.left).toBeCloseTo(0);
        expect(place.top).toBeCloseTo((90 - 900 * place.scale) / 2);
        expect(place.top).toBeLessThan(0);
    });

    it('lets the height decide in a frame that is taller than the window is', () => {
        const place = coverStage({ width: 1920, height: 1080 }, { width: 100, height: 100 })!;
        expect(place.scale).toBeCloseTo(100 / 1080);
        expect(place.top).toBeCloseTo(0);
        expect(place.left).toBeCloseTo((100 - 1920 * place.scale) / 2);
    });

    it('fills a frame of the window\'s own shape exactly', () => {
        expect(coverStage({ width: 1440, height: 900 }, { width: 144, height: 90 })).toEqual({ scale: 0.1, left: 0, top: 0 });
    });

    it('gives nothing while either has no size', () => {
        expect(coverStage({ width: 0, height: 900 }, { width: 100, height: 60 })).toBeNull();
        expect(coverStage({ width: 1440, height: 900 }, { width: 100, height: 0 })).toBeNull();
    });
});

describe('the stage fitted into the big sample', () => {
    it('shows all of the window in a wider box, the height deciding and the sides left empty evenly', () => {
        // A 1440x900 window in the sample's box of the lyric style window, about 2:1.
        const place = fitStage({ width: 1440, height: 900 }, { width: 772, height: 386 })!;
        expect(place.scale).toBeCloseTo(386 / 900);
        expect(place.top).toBeCloseTo(0);
        expect(place.left).toBeCloseTo((772 - 1440 * place.scale) / 2);
        expect(place.left).toBeGreaterThan(0);
    });

    it('lets the width decide in a box that is taller than the window is', () => {
        const place = fitStage({ width: 1920, height: 1080 }, { width: 600, height: 600 })!;
        expect(place.scale).toBeCloseTo(600 / 1920);
        expect(place.left).toBeCloseTo(0);
        expect(place.top).toBeCloseTo((600 - 1080 * place.scale) / 2);
        expect(place.top).toBeGreaterThan(0);
    });

    it('gives nothing while the box has no size', () => {
        expect(fitStage({ width: 1440, height: 900 }, { width: 0, height: 300 })).toBeNull();
    });
});

describe('what a picture does', () => {
    const state = (visible: boolean, chosen = false, active = false) => ({ visible, chosen, active });

    it('draws nothing off screen, whatever else holds', () => {
        expect(pictureWants(state(false, true, true))).toBe('nothing');
        expect(pictureWants(state(false, false, true))).toBe('nothing');
    });

    it('is an image on screen, and runs only under the pointer', () => {
        expect(pictureWants(state(true))).toBe('image');
        expect(pictureWants(state(true, false, true))).toBe('live');
    });

    it('never runs the chosen picture: the chosen style runs in the large sample', () => {
        expect(pictureWants(state(true, true))).toBe('image');
        expect(pictureWants(state(true, true, true))).toBe('image');
    });
});

describe('when a picture\'s image is made', () => {
    const picture = (over: Partial<Parameters<typeof imageRest>[0]> = {}) => imageRest({ allowed: true, wants: 'image', chosen: false, made: false, shows: false, tried: 0, ...over });

    it('makes none where the picker says images are not to be made now, whatever else holds', () => {
        expect(picture({ allowed: false })).toBeNull();
        expect(picture({ allowed: false, shows: true })).toBeNull();
        expect(picture({ allowed: false, chosen: true })).toBeNull();
        expect(picture({ allowed: false, wants: 'live' })).toBeNull();
    });

    it('makes none off screen, and none where one of the same settings exists', () => {
        expect(picture({ wants: 'nothing' })).toBeNull();
        expect(picture({ made: true, shows: true })).toBeNull();
        // Known that nothing can be drawn: not tried again.
        expect(picture({ made: true })).toBeNull();
    });

    it('makes the first one once a window has arrived, also for the chosen and the pointed picture', () => {
        expect(picture()).toBe(FIRST_IMAGE_REST_MS);
        expect(picture({ chosen: true })).toBe(FIRST_IMAGE_REST_MS);
        expect(picture({ wants: 'live' })).toBe(FIRST_IMAGE_REST_MS);
    });

    it('waits longer before it makes one again', () => {
        expect(picture({ shows: true })).toBe(NEW_IMAGE_REST_MS);
        expect(NEW_IMAGE_REST_MS).toBeGreaterThan(FIRST_IMAGE_REST_MS);
    });

    it('leaves the chosen picture as it is while it is chosen: its style is the one being adjusted', () => {
        expect(picture({ chosen: true, shows: true })).toBeNull();
    });

    it('asks again later, not at once, after a try that came to nothing', () => {
        expect(picture({ tried: 1 })).toBe(NEW_IMAGE_REST_MS);
    });
});

describe('what becomes of a try to make an image', () => {
    it('keeps what a stage shows', () => {
        expect(afterTry('shown', 0)).toBe('keep');
        expect(afterTry('shown', 1)).toBe('keep');
    });

    it('files nothing for an empty stage and tries once more, then lets the glyph stand in', () => {
        expect(IMAGE_TRIES).toBe(2);
        expect(afterTry('empty', 0)).toBe('again');
        expect(afterTry('empty', 1)).toBe('glyph');
    });

    it('does not try again after a throw: the glyph stands in at once', () => {
        expect(afterTry('failed', 0)).toBe('glyph');
    });
});

describe('images are made one at a time', () => {
    it('starts the first ask at once and the next when the turn is given back, in the order asked', () => {
        const started: string[] = [];
        const giveBack = ['a', 'b', 'c'].map(name => takeTurn(() => started.push(name)));
        expect(started).toEqual(['a']);
        giveBack[0]();
        expect(started).toEqual(['a', 'b']);
        giveBack[1]();
        expect(started).toEqual(['a', 'b', 'c']);
        giveBack[2]();
    });

    it('passes over an ask that was taken back while it waited', () => {
        const started: string[] = [];
        const giveBack = ['a', 'b', 'c'].map(name => takeTurn(() => started.push(name)));
        giveBack[1]();
        giveBack[0]();
        expect(started).toEqual(['a', 'c']);
        giveBack[2]();
    });

    it('does nothing when a turn is given back twice', () => {
        const started: string[] = [];
        const first = takeTurn(() => started.push('a'));
        const second = takeTurn(() => started.push('b'));
        first();
        first();
        expect(started).toEqual(['a', 'b']);
        second();
        const third = takeTurn(() => started.push('c'));
        expect(started).toEqual(['a', 'b', 'c']);
        third();
    });
});

describe('one picture runs at a time', () => {
    it('stops the picture that ran when another starts', () => {
        const stopFirst = claimRun('first');
        expect(runningPicture()).toBe('first');
        const stopSecond = claimRun('second');
        expect(runningPicture()).toBe('second');
        // The first one stopping later must not stop the second.
        stopFirst();
        expect(runningPicture()).toBe('second');
        stopSecond();
        expect(runningPicture()).toBeNull();
    });
});

describe('no picture starts while the page switches its lyric style', () => {
    it('starts a picture at once when nothing holds them back', () => {
        const started: string[] = [];
        whenFree(() => started.push('a'));
        expect(started).toEqual(['a']);
    });

    it('starts one asked during a hold when the last hold is let go, and only once', () => {
        const started: string[] = [];
        const letGoA = holdTurns();
        const letGoB = holdTurns();
        whenFree(() => started.push('a'));
        letGoA();
        letGoA();
        expect(started).toEqual([]);
        letGoB();
        expect(started).toEqual(['a']);
        const letGoC = holdTurns();
        letGoC();
        expect(started).toEqual(['a']);
    });

    it('starts none that was taken back while it waited', () => {
        const started: string[] = [];
        const letGo = holdTurns();
        const takeBack = whenFree(() => started.push('gone'));
        whenFree(() => started.push('kept'));
        takeBack();
        letGo();
        expect(started).toEqual(['kept']);
    });
});

describe('when an image is made anew', () => {
    it('files equal settings under the same text and other settings under another', () => {
        const key = (scale: number) => pictureKey(['style', 'classic', { width: 1440, height: 900 }, { backgroundColor: '#000' }, scale]);
        expect(key(1)).toBe(key(1));
        expect(key(1.1)).not.toBe(key(1));
    });

    it('tells uploaded pictures apart by which object they are, not by their data', () => {
        const one = { url: 'data:same' };
        const other = { url: 'data:same' };
        expect(pictureKey('x', one)).toBe(pictureKey('x', one));
        expect(pictureKey('x', one)).not.toBe(pictureKey('x', other));
        expect(pictureKey('x', null)).toBe(pictureKey('x', undefined));
    });

    it('files a theme under what a picture shows of it: not its name, description or provider', () => {
        const song: Theme = {
            name: 'Midnight harbour', description: 'A slow song', provider: 'ai',
            backgroundColor: '#0b1020', primaryColor: '#e8ecff', accentColor: '#7aa2ff', secondaryColor: '#7c86a8',
            fontStyle: 'sans', animationIntensity: 'normal',
        };
        const key = (theme: Theme) => pictureKey(['style', 'classic', themeForPictures(theme)]);
        expect(key({ ...song, name: 'Another song', description: 'Faster', provider: 'preset' })).toBe(key(song));
        expect(key({ ...song, accentColor: '#ff8a4c' })).not.toBe(key(song));
        expect(key({ ...song, fontStyle: 'serif' })).not.toBe(key(song));
        expect(key({ ...song, wordColors: [{ word: 'harbour', color: '#fff' }] })).not.toBe(key(song));
        // What the styles print of a theme is not in a picture either.
        expect(themeForPictures(song)).toMatchObject({ name: '', description: undefined, provider: undefined });
    });

    it('files a lyric style\'s picture under its own tuning and under what mods add to it', () => {
        const shows = {
            mode: 'mod:someone:style', stage: { width: 1440, height: 900 }, theme: themeForPictures({
                name: 'x', backgroundColor: '#000', primaryColor: '#fff', accentColor: '#fff', secondaryColor: '#888', fontStyle: 'sans', animationIntensity: 'normal',
            }),
            isDaylight: false, sample: 'default', fontScale: 1, tuning: undefined, modSettings: { speed: 1 }, modTunings: {},
        };
        expect(stylePictureKey({ ...shows })).toBe(stylePictureKey(shows));
        // A mod style's own setting changed: its picture is another one.
        expect(stylePictureKey({ ...shows, modSettings: { speed: 2 } })).not.toBe(stylePictureKey(shows));
        // Another mod put a multiplier on a built-in style.
        expect(stylePictureKey({ ...shows, mode: 'sonnet', modSettings: null, modTunings: { cameraIntensity: 1.5 } }))
            .not.toBe(stylePictureKey({ ...shows, mode: 'sonnet', modSettings: null }));
        expect(stylePictureKey({ ...shows, mode: 'sonnet', modSettings: null, tuning: { cameraIntensity: 1 } }))
            .not.toBe(stylePictureKey({ ...shows, mode: 'sonnet', modSettings: null, tuning: { cameraIntensity: 2 } }));
        expect(stylePictureKey({ ...shows, fontScale: 1.1 })).not.toBe(stylePictureKey(shows));
        expect(stylePictureKey({ ...shows, sample: 'reserved' })).not.toBe(stylePictureKey(shows));
    });

    it('has no image until one is kept, and remembers that nothing could be drawn', () => {
        expect(imageOf('not made')).toBeUndefined();
        keepImage('empty style', null);
        expect(imageOf('empty style')).toBeNull();
    });
});

describe('the player panel\'s pictures over a playing song', () => {
    it('makes images only for an open picker while a song plays, and freely while none does', () => {
        expect(panelMakesImages({ playing: true, pickerOpen: false })).toBe(false);
        expect(panelMakesImages({ playing: true, pickerOpen: true })).toBe(true);
        expect(panelMakesImages({ playing: false, pickerOpen: false })).toBe(true);
        expect(panelMakesImages({ playing: false, pickerOpen: true })).toBe(true);
    });

    it('keeps the pictures\' theme over a song change, also under an open picker, until a picker opens', () => {
        const [first, second] = ['theme of the first song', 'theme of the second song'];
        // The song changes while one plays: the pictures stay as they are, so none is made again.
        expect(panelPictureTheme(first, second, { playing: true, pickerOpens: false })).toBe(first);
        // A picker opens: the pictures take the playing theme.
        expect(panelPictureTheme(first, second, { playing: true, pickerOpens: true })).toBe(second);
        // Nothing plays: they follow the page.
        expect(panelPictureTheme(first, second, { playing: false, pickerOpens: false })).toBe(second);
    });
});
