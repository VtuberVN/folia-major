import { mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { unzipSync } from "fflate";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const PLATFORM_NAMES = Object.freeze({
  darwin: "mac",
  linux: "linux",
  win32: "win",
});

/**
 * Pinned whisper.cpp runtime assets with GPU acceleration:
 * - win-x64: Vulkan GPU (NVIDIA, AMD, Intel GPU) + CPU fallback
 * - mac-arm64: Metal GPU (Apple Silicon M1-M4)
 * - linux-x64: Vulkan GPU (Mesa RADV, NVIDIA, Intel ANVIL) + CPU fallback
 */
export const WHISPER_ASSETS = Object.freeze({
  "win-x64": {
    url: "https://github.com/lemonade-sdk/whisper.cpp-rocm/releases/download/v1.8.4/whisper-v1.8.4-windows-vulkan-x64.zip",
    format: "zip",
    binaryName: "whisper-cli.exe",
  },
  "mac-arm64": {
    url: "https://github.com/lemonade-sdk/whisper.cpp-rocm/releases/download/v1.8.4/whisper-v1.8.4-darwin-metal-arm64.tar.gz",
    format: "tar.gz",
    binaryName: "whisper-cli",
  },
  "linux-x64": {
    url: "https://github.com/lemonade-sdk/whisper.cpp-rocm/releases/download/v1.8.4/whisper-v1.8.4-linux-vulkan-x86_64.tar.gz",
    format: "tar.gz",
    binaryName: "whisper-cli",
  },
  "linux-arm64": {
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-ubuntu-arm64.tar.gz",
    format: "tar.gz",
    binaryName: "whisper-cli",
  },
});

/**
 * Stages whisper-cli and required ggml dynamic libraries into build/whisper/<os>-<arch>
 * for electron-builder packaging.
 */
export async function prepareBundledWhisper({ platform = process.platform, arch = process.arch } = {}) {
  const osName = PLATFORM_NAMES[platform] ?? platform;
  const key = `${osName}-${arch}`;
  const targetDir = path.join(ROOT, "build", "whisper", key);
  await mkdir(targetDir, { recursive: true });

  const asset = WHISPER_ASSETS[key];
  if (!asset) {
    // If no specific asset configured for target, ensure directory exists
    return;
  }

  const cliPath = path.join(targetDir, asset.binaryName);
  if (existsSync(cliPath)) {
    return;
  }

  console.log(`[whisper] Downloading GPU-accelerated Whisper runtime for ${key} from ${asset.url}...`);
  const resp = await fetch(asset.url, { redirect: "follow" });
  if (!resp.ok) {
    throw new Error(`Failed to fetch whisper binary: HTTP ${resp.status}`);
  }

  const archiveBuf = Buffer.from(await resp.arrayBuffer());

  if (asset.format === "zip") {
    const unzipped = unzipSync(new Uint8Array(archiveBuf));
    for (const [rawPath, content] of Object.entries(unzipped)) {
      const filename = path.basename(rawPath);
      if (
        filename === "whisper-cli.exe" ||
        filename === "whisper.dll" ||
        (filename.startsWith("ggml") && filename.endsWith(".dll"))
      ) {
        await writeFile(path.join(targetDir, filename), Buffer.from(content));
        console.log(`[whisper] Staged ${filename} -> ${targetDir}`);
      }
    }
  } else if (asset.format === "tar.gz") {
    const tempArchive = path.join(targetDir, "temp_archive.tar.gz");
    await writeFile(tempArchive, archiveBuf);
    try {
      const tarResult = spawnSync("tar", ["-xzf", tempArchive, "--strip-components=1", "-C", targetDir], {
        stdio: "inherit",
      });
      if (tarResult.status !== 0) {
        // Fallback without strip-components
        spawnSync("tar", ["-xzf", tempArchive, "-C", targetDir], { stdio: "inherit" });
      }
    } finally {
      if (existsSync(tempArchive)) {
        await rm(tempArchive, { force: true });
      }
    }
  }

  // Ensure execution permissions on Unix binaries
  if (osName !== "win" && existsSync(path.join(targetDir, asset.binaryName))) {
    try {
      await chmod(path.join(targetDir, asset.binaryName), 0o755);
    } catch {}
  }
}
