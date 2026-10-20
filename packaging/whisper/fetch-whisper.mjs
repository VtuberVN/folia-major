import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const PLATFORM_NAMES = Object.freeze({
  darwin: "mac",
  linux: "linux",
  win32: "win",
});

const WHISPER_WIN_X64_URL = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip";

/**
 * Stages whisper-cli and required ggml dynamic libraries into build/whisper/<os>-<arch>
 * for electron-builder packaging.
 */
export async function prepareBundledWhisper({ platform = process.platform, arch = process.arch } = {}) {
  const osName = PLATFORM_NAMES[platform] ?? platform;
  const targetDir = path.join(ROOT, "build", "whisper", `${osName}-${arch}`);
  await mkdir(targetDir, { recursive: true });

  if (osName !== "win" || arch !== "x64") {
    // For non-win-x64 platforms, ensure the directory exists so electron-builder doesn't fail
    return;
  }

  const cliPath = path.join(targetDir, "whisper-cli.exe");
  if (existsSync(cliPath)) {
    return;
  }

  console.log(`[whisper] Downloading whisper-bin-x64 from ${WHISPER_WIN_X64_URL}...`);
  const resp = await fetch(WHISPER_WIN_X64_URL, { redirect: "follow" });
  if (!resp.ok) {
    throw new Error(`Failed to fetch whisper binary: HTTP ${resp.status}`);
  }

  const zipBuf = Buffer.from(await resp.arrayBuffer());
  const unzipped = unzipSync(new Uint8Array(zipBuf));

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
}
