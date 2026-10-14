# Folia WASAPI 独占输出（bit-perfect）

Windows 专用的 WASAPI 独占模式输出。开启后，本地文件解码出的 PCM 直通音频端点，绕过系统混音器、重采样与软件音量，实现 bit-perfect 播放；普通（共享模式）播放不受影响。

目前仅 Windows x64。非 Windows 平台不注册相关入口，设置项也不会出现。

## 一、如何开启

设置 → **播放设备** → 打开「**WASAPI 独占输出（bit-perfect）**」开关。开启后下方出现「**独占输出设备**」下拉，可选择具体声卡/耳机（默认跟随系统默认设备）。

开关标题旁的**徽章**会显示当前实际状态：**独占模式**（引擎接管、bit-perfect）/ **共享模式**（回退，Chromium 输出）/ **已关闭**；状态切换时也会有提示。在线曲因需整首下载，独占启动会晚于共享播放，随后自动对齐进度。

- 开关持久化在 `localStorage` 的 `folia_enable_wasapi_exclusive`（默认：Windows 上为开，其它平台不可用）；设备选择持久化在 `folia_wasapi_device_id`。
- 开启后播放时，HTML5 音频被静音，实际出声由 WASAPI 独占引擎负责；进度条、歌词、自动下一首等仍由原 `<audio>` 元素驱动。
- 关闭开关即恢复 Chromium 共享模式播放。

## 二、工作机制

三层结构，互不阻塞：

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 原生 | `native/wasapi/`（Rust + napi-rs） | `IAudioClient` 独占打开、事件驱动 ping-pong 填 PCM、`IAudioClock` 报位、设备枚举 |
| 主进程 | `electron/wasapi/wasapiEngine.cjs` / `wasapiWorker.cjs` | worker 线程持有原生渲染器与 FFmpeg 子进程；解析本地路径或下载远程 URL、探测格式、解码到 PCM、喂缓冲；对渲染层暴露 IPC |
| 渲染层 | `src/hooks/useWasapiExclusive.ts` | 监听播放状态/当前歌曲/音源，解析源（本地路径或远程 URL），驱动引擎，静音/解除静音，回退 |

音源有两种，worker 统一处理：

- **本地文件**：渲染层从本地曲库解析出文件路径，交给引擎。
- **在线 / Navidrome**：渲染层把远程 http(s) 音频地址交给引擎；worker 用 Node `fetch` 把流**下载到临时文件**（打包的 FFmpeg 是 `--disable-network`，读不了 URL），再交给 FFmpeg 解码；换曲/停止时删除临时文件。


数据流：

```
本地文件 ────────────────────────────────┐
                                          ▼
在线/Navidrome ──(worker: Node fetch 下载)──> 临时文件 ──ffmpeg(解码到 PCM, WAV on stdout)──> worker 环形缓冲 ──> 原生 WASAPI 独占渲染器 ──> 音频设备
   ▲
   └── 渲染层把「文件路径或远程 URL」+ 播放/暂停/seek 经 IPC 交给 worker（不传音频数据）
```

关键点：

- **格式探测**：worker 用 `music-metadata` 读源文件原生采样率/声道/位深，按位深选择 FFmpeg PCM 编码器与独占输出位深（16 / 24 / 32-bit）。独占设备必须**原生支持**该采样率，否则打开失败。
- **静音原生声道**：主进程 `webContents.setAudioMuted(true)` 静音渲染层，避免与 WASAPI 双重出声（不影响主进程的 WASAPI 输出）。
- **回退**：独占打开失败（设备不支持该采样率、被占用、被禁用独占等）时，引擎上报 `fallback`，渲染层解除静音，改由 Chromium 共享模式继续播放，并提示「已回退到共享模式」。
- **seek**：监听 `<audio>` 的 `seeked` 事件，重启 FFmpeg 到新的位置。

## 三、支持范围与限制

- **音源**：本地文件始终支持。若曲库是通过「选择文件夹」导入的，Folia 只持有文件夹授权句柄、`filePath` 是相对路径，引擎拿不到绝对路径——此时渲染层会把当前播放的 **blob 音频字节**交给主进程写成临时文件再解码（`{ kind: 'buffer' }`，seek 复用缓存）。在线（网易/QQ/酷狗）与 Navidrome 的远程 http(s) 源为**实验性、默认关闭**（设置里的「在线音源也使用独占」）——引擎需先整首下载，会与 Chromium 的在线流抢带宽并可能卡顿，且设备不支持其采样率时必然失败；一旦某次在线独占失败，本会话不再对在线曲尝试。
- **位深**：16/24/32-bit 由定制 FFmpeg 支持；源位深超过独占输出位深时按较低位深输出（事件标记 `bitPerfect:false`）。
- **绕过 DSP**：独占时均衡器、音效、软件音量、automix/交叉淡化均不生效——这是 bit-perfect 的定义。
- **采样率匹配**：设备独占只认自己的原生时钟。例如设备只支持 48kHz 时，44.1kHz 源会被拒绝并回退共享模式。
- **设备占用**：独占会排斥其它独占客户端；被占用时回退共享模式。

## 四、构建

需要 Node ≥ 24、Rust（含 MSVC 目标）与（可选）MSYS2 用于定制 FFmpeg。

### 1. 原生模块

```bash
npm run build:wasapi      # cargo build --release，并把 .node 复制到 electron/wasapi/
```

`native/wasapi/` 是自包含的 Rust crate，产物为 N-API 模块，Electron 可直接 `require`，无需 electron-rebuild。打包时 `electron/wasapi/**` 已加入 `asarUnpack`，`wasapiEngine.cjs` 会从 `app.asar.unpacked` 加载。

### 2. 定制 FFmpeg（24/32-bit）

上游打包的 `ffmpeg-audio` 精简构建只含 `pcm_s16le` 编码器，无法输出 24/32-bit PCM。需要用定制构建：

```bash
npm run build:ffmpeg:wasapi   # 见 packaging/ffmpeg/build-ffmpeg-wasapi.sh
```

- Windows：脚本在 MSYS2 MINGW64 下原生编译（需 `mingw-w64-x86_64-gcc`、`nasm`、`make`）。
- Linux/CI：用 `FOLIA_FFMPEG_CROSS_PREFIX=x86_64-w64-mingw32-` 交叉编译；仓库内已有 `build-ffmpeg-wasapi.yml` workflow。
- 产物落在 `build/ffmpeg/win-x64/`（该目录按上游设计被 gitignore），并写入 `WASAPI-FFMPEG.txt` 标记；`fetch-ffmpeg.mjs` 检测到该标记时优先使用本地定制版本，而不是拉取上游 16-bit 版。

**CI 发版（让 GitHub Actions 打出的包也带 24-bit）**：`build-ffmpeg-wasapi.yml` 除了构建，还会把产物打成 `ffmpeg-8.1.2-folia-wasapi-win-x64.tar.gz` + `.sha256` 并发布到 `ffmpeg-wasapi` tag。`fetch-ffmpeg.mjs` 对 win-x64 会优先从该 release 拉取定制版（用 `.sha256` 校验），拿不到才回退上游 16-bit 版。因此：
1. 首次使用：手动触发一次 `Build WASAPI FFmpeg (win-x64)` workflow，生成 release 资源。
2. 之后每次 `electron-release.yml` 打包时，`beforePack` 会自动拉到 24-bit 版。

### 3. 完整打包

```bash
npm run build:electron    # vite build + helper + build:wasapi + electron-builder
```

产物：`release\Folia-Setup-<version>.exe`。

## 五、验证

```bash
npx tsc --noEmit
npm run test:unit
```

原生/解码链路的独立冒烟测试（在 `native/wasapi/` 下，会真实出声）：

```bash
node native/wasapi/smoke-test.mjs --play --device "<设备ID>" --rate 48000 --bits 16
node native/wasapi/decode-test24.mjs   # 校验 24-bit 解码输出
```

## 六、故障排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 提示「已回退到共享模式」 | 设备不支持源采样率 / 被占用 / 禁用了独占 | 在「独占输出设备」下拉里换一个支持独占的设备；或在「声音设置 → 高级」允许应用独占控制 |
| 一直无声且未回退 | 渲染层被静音但引擎未出声 | 检查 `logs/` 与主进程控制台 `[WASAPI]`；关闭再打开开关重置 |
| 24-bit 源提示按 16-bit 输出 | 使用的是上游 16-bit FFmpeg | 执行 `npm run build:ffmpeg:wasapi` 后重新打包 |
| 原生模块加载失败 | `.node` 未构建或未 unpack | 执行 `npm run build:wasapi`；确认打包时 `asarUnpack` 生效 |

### 调试日志

WASAPI 引擎与 worker 会把每一步（初始化路径、`play/resume/seek/stop`、设备、格式、`started/fallback/error`）写入：

```
%APPDATA%\Folia\wasapi-debug.log
```

打包版没有可见的主进程控制台，排查时以这个文件为准。想看实时控制台，可从源码运行 `npm run dev:electron`。

## 七、相关文件速查

```
native/wasapi/src/renderer.rs           WASAPI 独占渲染器
native/wasapi/src/lib.rs                napi 导出
electron/wasapi/wasapiEngine.cjs         主进程引擎（worker 管理 + IPC 注册参见 electron/main.cjs）
electron/wasapi/wasapiWorker.cjs         worker：探测 + 解码 + 喂 PCM
electron/preload.cjs                     window.electron.wasapi 桥
src/hooks/useWasapiExclusive.ts          渲染层桥接与回退
src/stores/useAudioSettingsStore.ts      enableWasapiExclusive 设置
packaging/ffmpeg/build-ffmpeg-wasapi.sh  定制 FFmpeg 构建
```
