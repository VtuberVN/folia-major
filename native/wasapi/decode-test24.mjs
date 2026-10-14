// native/wasapi/decode-test24.mjs
//
// Verifies the custom FFmpeg build outputs 24-bit PCM: decode a generated 24-bit WAV to a
// 24-bit WAV on stdout and confirm the WAV header reports 24-bit and the byte count is right.

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ffmpeg = process.env.FFMPEG || 'C:/Users/noname/AppData/Local/Temp/opencode/ffmpeg-out/ffmpeg.exe';
const tmp = join(homedir(), 'AppData', 'Local', 'Temp', 'opencode', 'wasapi-test');
mkdirSync(tmp, { recursive: true });
const wavPath = join(tmp, 'tone24.wav');

const sr = 48000;
const ch = 2;
const dur = 2;
const frames = sr * dur;
const bytesPerSample = 3;
const blockAlign = ch * bytesPerSample;
const dataBytes = frames * blockAlign;
const buf = Buffer.alloc(44 + dataBytes);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(ch, 22);
buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * blockAlign, 28);
buf.writeUInt16LE(blockAlign, 32);
buf.writeUInt16LE(24, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataBytes, 40);
let o = 44;
for (let i = 0; i < frames; i++) {
    const s = Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 3000000);
    for (let c = 0; c < ch; c++) {
        buf.writeIntLE(s, o, 3);
        o += 3;
    }
}
writeFileSync(wavPath, buf);

const r = spawnSync(ffmpeg, [
    '-hide_banner', '-nostdin', '-v', 'error',
    '-i', wavPath,
    '-map', '0:a:0', '-vn',
    '-ac', String(ch),
    '-ar', String(sr),
    '-c:a', 'pcm_s24le',
    '-f', 'wav', 'pipe:1',
]);

console.log('ffmpeg exit:', r.status);
console.log('stderr:', r.stderr.toString().slice(0, 300));
const out = r.stdout;
const bits = out.readUInt16LE(34);
console.log('stdout bytes:', out.length);
console.log('output bitsPerSample:', bits, '(expect 24)');
console.log('output RIFF:', out.toString('ascii', 0, 4));
console.log(bits === 24 ? 'OK' : 'MISMATCH');
