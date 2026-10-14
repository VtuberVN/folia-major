// native/wasapi/buffer-source-test.mjs
//
// Verifies the renderer-bytes path: hand the worker { kind: 'buffer', name, bytes } and confirm it
// spills to a temp file, decodes and plays. This is what local library files use (their Folia path
// is relative to a File System Access handle, so no OS path exists).

import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const nativePath = join(repo, 'electron', 'wasapi', 'folia_wasapi.node');
const ffmpegPath = join(repo, 'build', 'ffmpeg', 'win-x64', 'ffmpeg.exe');
const workerPath = join(repo, 'electron', 'wasapi', 'wasapiWorker.cjs');

// 2s 440 Hz stereo 16-bit 48 kHz WAV in memory.
const sr = 48000;
const ch = 2;
const frames = sr * 2;
const dataBytes = frames * ch * 2;
const buf = Buffer.alloc(44 + dataBytes);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(ch, 22);
buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * ch * 2, 28);
buf.writeUInt16LE(ch * 2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataBytes, 40);
let o = 44;
for (let i = 0; i < frames; i++) {
    const s = Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 12000);
    for (let c = 0; c < ch; c++) {
        buf.writeInt16LE(s, o);
        o += 2;
    }
}
// Copy into a standalone ArrayBuffer as the renderer would send it.
const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const worker = new Worker(workerPath);
const native = require(nativePath);
const devices = native.enumerateOutputDevices();
const device = devices.find((d) => d.name.includes('Realtek')) ?? devices[0];
console.log('device:', device.name);

const outcome = await new Promise((resolveOutcome) => {
    let lastPos = 0;
    worker.on('message', (m) => {
        if (m.type === 'started') {
            setTimeout(() => {
                worker.postMessage({ type: 'close' });
                resolveOutcome({ ok: lastPos > 800, lastPos });
            }, 1600);
        }
        if (m.type === 'position') lastPos = m.positionMs;
        if (m.type === 'fallback') resolveOutcome({ ok: false, reason: `fallback: ${m.message}` });
        if (m.type === 'error') resolveOutcome({ ok: false, reason: `error: ${m.message}` });
    });
    worker.postMessage({ type: 'init', nativePath, ffmpegPath });
    worker.postMessage({ type: 'setDevice', deviceId: device.id });
    worker.postMessage({ type: 'play', source: { kind: 'buffer', name: 'blob:test', bytes }, startSec: 0 });
});

await new Promise((r) => setTimeout(r, 400));
await worker.terminate();
console.log('position after ~1.6s:', outcome.lastPos);
console.log(outcome.ok ? 'BUFFER_OK' : `BUFFER_FAIL (${outcome.reason ?? 'position did not advance'})`);
process.exit(outcome.ok ? 0 : 1);
