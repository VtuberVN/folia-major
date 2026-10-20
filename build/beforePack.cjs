"use strict";

// build/beforePack.cjs
// Stages native runtimes for electron-builder's target platform and architecture.

const fs = require('fs');
const path = require('path');

const ARCH_NAMES = ["ia32", "x64", "armv7l", "arm64", "universal"];

exports.default = async (context) => {
  const arch = ARCH_NAMES[context.arch];
  if (!arch)
    throw new Error(
      `Unsupported electron-builder architecture ordinal: ${context.arch}`,
    );

  const distIndexPath = path.join(context.packager.projectDir, 'dist', 'index.html');
  if (fs.existsSync(distIndexPath)) {
    const htmlContent = fs.readFileSync(distIndexPath, 'utf8');
    if (htmlContent.includes('src="/assets/') || htmlContent.includes('href="/assets/')) {
      throw new Error(
        '[beforePack] dist/index.html contains absolute asset paths ("src=/assets"). Electron packaging requires relative asset paths. Please run `vite build` with ELECTRON=true.',
      );
    }
  }
  const { prepareBundledFfmpeg } = await import(
    "../packaging/ffmpeg/fetch-ffmpeg.mjs"
  );
  await prepareBundledFfmpeg({ platform: context.electronPlatformName, arch });
  const { prepareBundledWhisper } = await import(
    "../packaging/whisper/fetch-whisper.mjs"
  );
  await prepareBundledWhisper({ platform: context.electronPlatformName, arch });
  // The analysis models' runtime (electron/analysis/mnn.cjs), built from the pinned MNN source.
  const { prepareBundledMnn } = await import("./buildMnnRuntime.mjs");
  await prepareBundledMnn({ platform: context.electronPlatformName, arch });
  // The two models (Beat This! final0, htdemucs), verified against shared/modelManifest.json; one
  // file each for every platform.
  const { prepareBundledModels } = await import("./fetchModels.mjs");
  await prepareBundledModels({ outputDir: require("path").join(context.packager.projectDir, "models") });
  if (context.electronPlatformName === 'darwin') {
    const { prepareBundledKoffi } = await import('../packaging/macos/prepare-koffi.mjs');
    await prepareBundledKoffi({ arch, projectRoot: context.packager.projectDir });
  }
};
