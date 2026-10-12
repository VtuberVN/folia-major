#!/usr/bin/env node
// packaging/windows/build-win-ytb.mjs
// Builds the Windows desktop installer & portable zip with built-in YouTube Music provider.

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const isDir = process.argv.includes('dir');

console.log('[build-win-ytb] 1. Building Vite frontend with VITE_ENABLE_YOUTUBE=true...');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const viteRes = spawnSync(
  npxCmd,
  ['vite', 'build'],
  {
    stdio: 'inherit',
    cwd: ROOT,
    shell: true,
    env: {
      ...process.env,
      ELECTRON_DEV: 'false',
      ELECTRON: 'true',
      VITE_ENABLE_YOUTUBE: 'true',
    },
  }
);

if (viteRes.status !== 0) {
  process.exit(viteRes.status || 1);
}

console.log('[build-win-ytb] 2. Building wallpaper-helper...');
execFileSync(
  process.execPath,
  [path.join(ROOT, 'packaging', 'windows', 'build-wallpaper-helper.mjs')],
  { stdio: 'inherit', cwd: ROOT }
);

console.log('[build-win-ytb] 3. Packaging Windows binaries with with_ytb artifact names...');
const builderArgs = [
  '--win',
  ...(isDir ? ['dir'] : []),
  '-c.nsis.artifactName=${productName}-Setup-${version}-with_ytb.${ext}',
  '-c.win.artifactName=${productName}-${version}-${arch}-with_ytb.${ext}',
];

const builderRes = spawnSync(
  npxCmd,
  ['electron-builder', ...builderArgs],
  {
    stdio: 'inherit',
    cwd: ROOT,
    shell: true,
    env: {
      ...process.env,
      ELECTRON_DEV: 'false',
      ELECTRON: 'true',
      VITE_ENABLE_YOUTUBE: 'true',
    },
  }
);

if (builderRes.status !== 0) {
  process.exit(builderRes.status || 1);
}

console.log('[build-win-ytb] Windows build with YouTube completed successfully!');
