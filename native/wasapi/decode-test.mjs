// native/wasapi/decode-test.mjs
//
// Verifies the FFmpeg decode path used by the WASAPI engine: decode a generated WAV to raw
// PCM (16-bit) on stdout and confirm the WAV header parse + byte count are correct.

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ffmpeg = process.env.FFMPEG || 'D:/Music/Folia/resources/ffmpeg-audio/ffmpeg.exe';
const tmp = join(homedir(), 'AppData', 'Local', 'Temp', 'opencode', 'wasapi-test');
mkdirSync(tmp, { recursive: true });
const wavPath = join(tmp, 'tone.wav');

// Generate a 2s 440 Hz stereo 16-bit 48 kHz WAV.
const sr = 48000;
const ch = 2;
const dur = 2;
const frames = sr * dur;
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
writeFileSync(wavPath, buf);

// Decode to WAV on stdout.
const r = spawnSync(ffmpeg, [
    '-hide_banner', '-nostdin', '-v', 'error',
    '-i', wavPath,
    '-map', '0:a:0', '-vn',
    '-ac', String(ch),
    '-ar', String(sr),
    '-c:a', 'pcm_s16le',
    '-f', 'wav', 'pipe:1',
]);

console.log('ffmpeg exit:', r.status);
console.log('stderr:', r.stderr.toString().slice(0, 300));
const out = r.stdout;
console.log('stdout bytes:', out.length);
console.log('RIFF?', out.toString('ascii', 0, 4));
console.log('WAVE?', out.toString('ascii', 8, 12));

// Parse the data chunk offset (search for 'data').
const findData = (b) => {
    if (b.toString('ascii', 0, 4) !== 'RIFF') return -1;
    let i = 12;
    while (i + 8 <= b.length) {
        const id = b.toString('ascii', i, i + 4);
        const size = b.readUInt32LE(i + 4);
        if (id === 'data') return i + 8;
        i += 8 + size + (size & 1);
    }
    return -1;
};
const off = findData(out);
console.log('data offset:', off);
console.log('pcm bytes:', out.length - off, '(expect', dataBytes, ')');
console.log(out.length - off === dataBytes ? 'OK' : 'MISMATCH');
