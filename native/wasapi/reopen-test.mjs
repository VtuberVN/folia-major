// native/wasapi/reopen-test.mjs
//
// Hammers the close→open cycle while the stream is STILL PLAYING: exclusive open, play briefly,
// close straight from the render loop, then immediately reopen the same endpoint with a different
// format. Validates that close() releases the device before returning, so a rapid track switch with
// a format change cannot hit AUDCLNT_E_DEVICE_IN_USE (0x8889000a).

import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const native = require(join(repo, 'electron', 'wasapi', 'folia_wasapi.node'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const devices = native.enumerateOutputDevices();
const device = devices.find((d) => d.name.includes('Macaron'))
    ?? devices.find((d) => d.name.includes('Realtek'))
    ?? devices[0];
console.log('device:', device.name);

const formats = [
    { sampleRate: 48000, channels: 2, bitsPerSample: 16, isFloat: false },
    { sampleRate: 44100, channels: 2, bitsPerSample: 24, isFloat: false },
    { sampleRate: 48000, channels: 2, bitsPerSample: 24, isFloat: false },
    { sampleRate: 44100, channels: 2, bitsPerSample: 16, isFloat: false },
];

let ok = 0;
for (let i = 0; i < 6; i += 1) {
    const format = formats[i % formats.length];
    const pcm = Buffer.alloc(format.sampleRate * format.channels * (format.bitsPerSample / 8));
    const renderer = new native.FoliaWasapi();
    try {
        renderer.openExclusive(device.id, format);
        renderer.start();
        renderer.writePcm(pcm);
        await sleep(120);
        // Close WHILE PLAYING (the render loop owns the client here).
        renderer.close();
        ok += 1;
        console.log('cycle', i, `${format.sampleRate}/${format.bitsPerSample} ok`);
    } catch (error) {
        console.log('cycle', i, 'FAILED:', error.message);
    }
}
console.log(ok === 6 ? 'REOPEN_OK' : `REOPEN_FAIL (${ok}/6)`);
process.exit(ok === 6 ? 0 : 1);
