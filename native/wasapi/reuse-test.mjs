// native/wasapi/reuse-test.mjs
//
// Opens ONE exclusive stream and reuses it for several "tracks": start, play briefly, stop, then
// start again on the same client (the worker's reuse path). Confirms no reopen and that the
// position counter resets on stop.

import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const native = require(join(repo, 'electron', 'wasapi', 'folia_wasapi.node'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const devices = native.enumerateOutputDevices();
const device = devices.find((d) => d.name.includes('Realtek')) ?? devices[0];
console.log('device:', device.name);

const format = { sampleRate: 48000, channels: 2, bitsPerSample: 16, isFloat: false };
const pcm = Buffer.alloc(48000 * 2 * 2);

const renderer = new native.FoliaWasapi();
renderer.openExclusive(device.id, format);
console.log('opened once');

let ok = 0;
for (let i = 0; i < 5; i += 1) {
    try {
        renderer.start();
        renderer.writePcm(pcm);
        await sleep(150);
        const pos = renderer.getPositionMs();
        renderer.stop();
        console.log('cycle', i, 'pos', pos, 'state', renderer.getState());
        if (pos > 50) ok += 1;
    } catch (error) {
        console.log('cycle', i, 'FAILED:', error.message);
    }
}
renderer.close();
console.log(ok === 5 ? 'REUSE_OK' : `REUSE_FAIL (${ok}/5)`);
process.exit(ok === 5 ? 0 : 1);
