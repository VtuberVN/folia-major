// native/wasapi/url-source-test.mjs
//
// Verifies the worker's remote-URL path end to end: serve a WAV over HTTP, tell the worker to
// play it as { url }, and confirm it downloads, decodes and advances the position. Plays ~1.5s
// of a 440 Hz tone on the chosen device (realtek if present, else the default output).

import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const nativePath = join(repo, 'electron', 'wasapi', 'folia_wasapi.node');
const ffmpegPath = join(repo, 'build', 'ffmpeg', 'win-x64', 'ffmpeg.exe');
const workerPath = join(repo, 'electron', 'wasapi', 'wasapiWorker.cjs');

// 2s 440 Hz stereo 16-bit 48 kHz WAV
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
const tmp = join(homedir(), 'AppData', 'Local', 'Temp', 'opencode', 'wasapi-test');
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'tone.wav'), buf);

const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': buf.length });
    res.end(buf);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/tone.wav`;
console.log('serving', url);

const worker = new Worker(workerPath);
const native = require(nativePath);
const devices = native.enumerateOutputDevices();
const device = devices.find((d) => d.name.includes('Realtek')) ?? devices[0];
console.log('device:', device.name);

const outcome = await new Promise((resolveOutcome) => {
    let lastPos = 0;
    worker.on('message', (m) => {
        if (m.type === 'started') {
            console.log('started', m);
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
    worker.postMessage({ type: 'play', source: { url }, startSec: 0 });
});

await new Promise((r) => setTimeout(r, 400));
await worker.terminate();
server.close();
console.log('position after ~1.6s:', outcome.lastPos);
console.log(outcome.ok ? 'URL_OK' : `URL_FAIL (${outcome.reason ?? 'position did not advance'})`);
process.exit(outcome.ok ? 0 : 1);
