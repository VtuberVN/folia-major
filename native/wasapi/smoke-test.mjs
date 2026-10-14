// native/wasapi/smoke-test.mjs
//
// Manual smoke test for the WASAPI native module. Lists output devices and, when
// `--play` is passed, opens the default device in exclusive mode and plays 2 seconds
// of a 440 Hz sine tone to verify the render loop end-to-end.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const addon = require(path.join(here, 'folia_wasapi.node'));

console.log('exports:', Object.keys(addon));

const devices = addon.enumerateOutputDevices();
console.log('output devices:');
for (const d of devices) {
  console.log('  -', d.id, '=>', d.name);
}

if (process.argv.includes('--play')) {
  const deviceId = process.argv.includes('--device')
    ? process.argv[process.argv.indexOf('--device') + 1]
    : '';
  const sampleRate = Number(process.argv.includes('--rate') ? process.argv[process.argv.indexOf('--rate') + 1] : 48000);
  const channels = 2;
  const bitsPerSample = Number(process.argv.includes('--bits') ? process.argv[process.argv.indexOf('--bits') + 1] : 16);
  const isFloat = false;

  console.log('opening exclusive:', deviceId || '(default)', { sampleRate, channels, bitsPerSample, isFloat });
  const renderer = new addon.FoliaWasapi();
  renderer.openExclusive(deviceId, { sampleRate, channels, bitsPerSample, isFloat });
  console.log('opened. state:', renderer.getState());

  // Generate 2 seconds of a 440 Hz sine wave, 16-bit stereo.
  const durationSec = 2;
  const bytesPerSample = Math.ceil(bitsPerSample / 8);
  const blockAlign = channels * bytesPerSample;
  const totalBytes = sampleRate * durationSec * blockAlign;
  const pcm = Buffer.alloc(totalBytes);
  const amplitude = bitsPerSample === 24 ? 838860 : 12000;
  for (let i = 0; i < sampleRate * durationSec; i++) {
    const s = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * amplitude);
    for (let c = 0; c < channels; c++) {
      if (bitsPerSample === 24) {
        pcm.writeIntLE(s, i * blockAlign + c * bytesPerSample, 3);
      } else {
        pcm.writeInt16LE(s, i * blockAlign + c * bytesPerSample);
      }
    }
  }

  renderer.start();
  console.log('started. state:', renderer.getState());

  let off = 0;
  while (off < pcm.length) {
    const accepted = renderer.writePcm(pcm.subarray(off));
    off += accepted;
    if (accepted === 0) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  console.log('all PCM fed. buffered bytes:', renderer.getBufferedBytes(), 'position ms:', renderer.getPositionMs());

  // Wait for the buffer to drain.
  await new Promise((r) => setTimeout(r, 2500));
  console.log('final position ms:', renderer.getPositionMs(), 'state:', renderer.getState());

  renderer.stop();
  renderer.close();
  console.log('done');
}
