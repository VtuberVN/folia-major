// native/wasapi/build.mjs
//
// Builds the Rust WASAPI native addon and copies it to electron/wasapi/ so the packaged app
// (and dev runs) can load it. Requires a Rust toolchain with the MSVC target on Windows.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const target = join(repoRoot, 'electron', 'wasapi', 'folia_wasapi.node');

const cargoName = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
const resolveCargo = () => {
    const fromHome = join(homedir(), '.cargo', 'bin', cargoName);
    if (existsSync(fromHome)) return fromHome;
    return cargoName;
};

console.log('[wasapi] building native addon...');
execFileSync(resolveCargo(), ['build', '--release'], {
    cwd: here,
    stdio: 'inherit',
});

const dll = join(here, 'target', 'release', process.platform === 'win32' ? 'folia_wasapi.dll' : 'libfolia_wasapi.so');
if (!existsSync(dll)) {
    throw new Error(`[wasapi] build artifact not found: ${dll}`);
}
copyFileSync(dll, target);
console.log(`[wasapi] copied native addon to ${target}`);
