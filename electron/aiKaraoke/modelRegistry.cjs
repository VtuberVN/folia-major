// electron/aiKaraoke/modelRegistry.cjs
// Model metadata, storage paths, and download manager for AI Karaoke MSS & ASR models.

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

/**
 * Supported Music Source Separation (MSS) & ASR / Forced Alignment models.
 */
const MODEL_CATALOG = [
    {
        id: 'uvr_mdxnet_kara_2',
        name: 'UVR-MDX-Net Karaoke 2',
        category: 'mss',
        fileName: 'UVR_MDXNET_KARA_2.onnx',
        fileSizeMb: 66.8,
        recommendedVram: '1.5 - 2.5 GB',
        typicalSpeed: '6 - 10s',
        description: 'Tối ưu cho Karaoke: Tách giọng hát chính, giữ lại giọng bè (backing vocals) trong beat nhạc nền.',
        descriptionVi: 'Tối ưu cho Karaoke: Tách giọng hát chính, giữ lại giọng bè (backing vocals) trong beat nhạc nền.',
        downloadUrl: 'https://github.com/VtuberVN/folia-models/releases/download/v1.0.0/UVR_MDXNET_KARA_2.onnx',
    },
    {
        id: 'kim_vocal_2',
        name: 'Kim Vocal 2',
        category: 'mss',
        fileName: 'Kim_Vocal_2.onnx',
        fileSizeMb: 66.8,
        recommendedVram: '1.5 - 2.5 GB',
        typicalSpeed: '6 - 10s',
        description: 'Tách vocal siêu sạch, giữ dải tần cao. Phù hợp nhất để trích xuất giọng hát đưa vào nhận diện lời ASR.',
        descriptionVi: 'Tách vocal siêu sạch, giữ dải tần cao. Phù hợp nhất để trích xuất giọng hát đưa vào nhận diện lời ASR.',
        downloadUrl: 'https://github.com/VtuberVN/folia-models/releases/download/v1.0.0/Kim_Vocal_2.onnx',
    },
    {
        id: 'htdemucs_mnn',
        name: 'HTDemucs v4 (Folia Native)',
        category: 'mss',
        fileName: 'htdemucs-wgsl.bin',
        fileSizeMb: 80.0,
        recommendedVram: '2.0 - 3.0 GB',
        typicalSpeed: '8 - 14s',
        description: 'Tích hợp sẵn trong Folia. Tách đồng thời 4 luồng: Drums, Bass, Other, Vocals bằng C++ MNN AVX2 CPU đa nhân, tối ưu hiệu năng và không tranh chấp VRAM GPU với Visualizer 3D.',
        descriptionVi: 'Tích hợp sẵn trong Folia. Tách đồng thời 4 luồng: Drums, Bass, Other, Vocals bằng C++ MNN AVX2 CPU đa nhân, tối ưu hiệu năng và không tranh chấp VRAM GPU với Visualizer 3D.',
        downloadUrl: 'https://github.com/VtuberVN/folia-models/releases/download/v1.0.0/htdemucs-wgsl.bin',
    },
    {
        id: 'bs_roformer',
        name: 'BS-RoFormer Viperx 12.97',
        category: 'mss',
        fileName: 'model_bs_roformer_ep_317_sdr_12.9755.ckpt',
        fileSizeMb: 639.0,
        recommendedVram: '2.8 - 4.5 GB',
        typicalSpeed: '18 - 30s',
        description: 'Chất lượng phòng thu Studio đỉnh cao (SDR 12.97 dB). Tách sạch tiếng thở, reverb, không lẹm nhạc nền.',
        descriptionVi: 'Chất lượng phòng thu Studio đỉnh cao (SDR 12.97 dB). Tách sạch tiếng thở, reverb, không lẹm nhạc nền.',
        downloadUrl: 'https://github.com/VtuberVN/folia-models/releases/download/v1.0.0/model_bs_roformer_ep_317_sdr_12.9755.ckpt',
    },
    {
        id: 'uvr_mdxnet_inst_3',
        name: 'UVR-MDX-NET Inst HQ 3',
        category: 'mss',
        fileName: 'UVR-MDX-NET-Inst_HQ_3.onnx',
        uvrSubfolder: 'MDX_Net_Models',
        fileSizeMb: 60.0,
        recommendedVram: '1.5 - 2.5 GB',
        typicalSpeed: '6 - 10s',
        description: 'Tách nhạc nền chất lượng cao (Instrumental HQ 3), lọc sạch vocal chính và vocal bè.',
        descriptionVi: 'Tách nhạc nền chất lượng cao (Instrumental HQ 3), lọc sạch vocal chính và vocal bè.',
        downloadUrl: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Inst_HQ_3.onnx',
    },
    {
        id: 'uvr_mdxnet_inst_5',
        name: 'UVR-MDX-NET Inst HQ 5',
        category: 'mss',
        fileName: 'UVR-MDX-NET-Inst_HQ_5.onnx',
        uvrSubfolder: 'MDX_Net_Models',
        fileSizeMb: 60.0,
        recommendedVram: '1.5 - 2.5 GB',
        typicalSpeed: '6 - 10s',
        description: 'Bản nâng cấp Instrumental HQ 5 tối ưu dải động cao cho beat nhạc sống và acoustic.',
        descriptionVi: 'Bản nâng cấp Instrumental HQ 5 tối ưu dải động cao cho beat nhạc sống và acoustic.',
        downloadUrl: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Inst_HQ_5.onnx',
    },
    {
        id: 'uvr_crowd_backing',
        name: 'UVR-MDX-NET Crowd HQ 1',
        category: 'mss',
        fileName: 'UVR-MDX-NET_Crowd_HQ_1.onnx',
        uvrSubfolder: 'MDX_Net_Models',
        fileSizeMb: 60.0,
        recommendedVram: '1.5 - 2.5 GB',
        typicalSpeed: '6 - 10s',
        description: 'Tách giọng bè (backing vocals), tiếng khán giả cổ vũ và tiếng đám đông khỏi bản thu trực tiếp.',
        descriptionVi: 'Tách giọng bè (backing vocals), tiếng khán giả cổ vũ và tiếng đám đông khỏi bản thu trực tiếp.',
        downloadUrl: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET_Crowd_HQ_1.onnx',
    },
    {
        id: 'uvr_wind_inst',
        name: '17_HP-Wind_Inst-UVR (Đạo cụ / Nhạc cụ)',
        category: 'mss',
        fileName: '17_HP-Wind_Inst-UVR.pth',
        uvrSubfolder: 'VR_Models',
        fileSizeMb: 60.0,
        recommendedVram: '1.5 - 2.5 GB',
        typicalSpeed: '6 - 12s',
        description: 'Tách đạo cụ & nhạc cụ hơi (sáo, kèn saxophone, brass, woodwinds) và giai điệu nhạc cụ dẫn dắt.',
        descriptionVi: 'Tách đạo cụ & nhạc cụ hơi (sáo, kèn saxophone, brass, woodwinds) và giai điệu nhạc cụ dẫn dắt.',
        downloadUrl: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/17_HP-Wind_Inst-UVR.pth',
    },
    {
        id: 'uvr_de_echo',
        name: 'UVR-De-Echo-Normal (Khử Âm vang)',
        category: 'mss',
        fileName: 'UVR-De-Echo-Normal.pth',
        uvrSubfolder: 'VR_Models',
        fileSizeMb: 60.0,
        recommendedVram: '1.5 - 2.5 GB',
        typicalSpeed: '5 - 10s',
        description: 'Tách & khử âm vang (Echo/Reverb) phòng thu hoặc sân vận động, tạo vocal khô sạch.',
        descriptionVi: 'Tách & khử âm vang (Echo/Reverb) phòng thu hoặc sân vận động, tạo vocal khô sạch.',
        downloadUrl: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-De-Echo-Normal.pth',
    },
    {
        id: 'uvr_denoise',
        name: 'UVR-DeNoise-Lite (Khử Nhiễu)',
        category: 'mss',
        fileName: 'UVR-DeNoise-Lite.pth',
        uvrSubfolder: 'VR_Models',
        fileSizeMb: 60.0,
        recommendedVram: '1.0 - 2.0 GB',
        typicalSpeed: '4 - 8s',
        description: 'Khử nhiễu nền, tiếng xì xào, tạp âm micro và tiếng ồn môi trường.',
        descriptionVi: 'Khử nhiễu nền, tiếng xì xào, tạp âm micro và tiếng ồn môi trường.',
        downloadUrl: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-DeNoise-Lite.pth',
    },
    {
        id: 'uvr_1_hp',
        name: '1_HP-UVR (Vocal / Beat)',
        category: 'mss',
        fileName: '1_HP-UVR.pth',
        uvrSubfolder: 'VR_Models',
        fileSizeMb: 60.0,
        recommendedVram: '1.5 - 2.5 GB',
        typicalSpeed: '6 - 10s',
        description: 'Mô hình VR kinh điển của Ultimate Vocal Remover, tách vocal và instrumental cân bằng.',
        descriptionVi: 'Mô hình VR kinh điển của Ultimate Vocal Remover, tách vocal và instrumental cân bằng.',
        downloadUrl: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/1_HP-UVR.pth',
    },
    {
        id: 'whisper_turbo',
        name: 'Whisper Large-v3 Turbo',
        category: 'asr',
        fileName: 'whisper-large-v3-turbo-int8.bin',
        fileSizeMb: 809.0,
        recommendedVram: '1.5 - 2.5 GB',
        typicalSpeed: '2 - 4s',
        description: 'Model nhận diện giọng nói siêu tốc độ (809M tham số, 4 decoder layers), cực kỳ chuẩn xác cho nhạc Việt & quốc tế.',
        descriptionVi: 'Model nhận diện giọng nói siêu tốc độ (809M tham số, 4 decoder layers), cực kỳ chuẩn xác cho nhạc Việt & quốc tế.',
        downloadUrl: 'https://github.com/VtuberVN/folia-models/releases/download/v1.0.0/whisper-large-v3-turbo-int8.bin',
    },
    {
        id: 'whisper_small',
        name: 'Whisper Small',
        category: 'asr',
        fileName: 'whisper-small-int8.bin',
        fileSizeMb: 460.0,
        recommendedVram: '1.0 - 1.5 GB',
        typicalSpeed: '3 - 6s',
        description: 'Bản rút gọn dung lượng vừa tầm, hoạt động mượt mà trên cả CPU hoặc máy tính không có GPU rời.',
        descriptionVi: 'Bản rút gọn dung lượng vừa tầm, hoạt động mượt mà trên cả CPU hoặc máy tính không có GPU rời.',
        downloadUrl: 'https://github.com/VtuberVN/folia-models/releases/download/v1.0.0/whisper-small-int8.bin',
    },
    {
        id: 'forced_alignment',
        name: 'Meta MMS Forced Alignment / Stable-TS',
        category: 'asr',
        fileName: 'mms_fa.pt',
        fileSizeMb: 1200.0,
        recommendedVram: '1.2 - 1.8 GB',
        typicalSpeed: '1 - 2s',
        description: 'Ép khớp lời bài hát text có sẵn vào file giọng hát với độ lệch dưới 30-50ms (hỗ trợ hơn 1100 ngôn ngữ).',
        descriptionVi: 'Ép khớp lời bài hát text có sẵn vào file giọng hát với độ lệch dưới 30-50ms (hỗ trợ hơn 1100 ngôn ngữ).',
        downloadUrl: 'https://dl.fbaipublicfiles.com/mms/torchaudio/ctc_alignment_mling_uroman/model.pt',
    },
];

const getAiModelsDir = (userDataPath) => {
    const base = userDataPath || path.join(os.homedir(), '.folia');
    const dir = path.join(base, 'ai-models');
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    }
    return dir;
};

const getKaraokeOutputDir = (userDataPath) => {
    const dir = path.join(userDataPath, 'karaoke-output');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
};

/** Standard UVR5 base directories across user system and disks */
const UVR_MODELS_BASE_DIRS = [
    'D:\\AI-Voice\\Ultimate Vocal Remover\\models',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ultimate Vocal Remover', 'models'),
    'C:\\Program Files\\Ultimate Vocal Remover\\models',
];

const findUvrModelPath = (fileName, uvrSubfolder) => {
    for (const base of UVR_MODELS_BASE_DIRS) {
        if (!base) continue;
        try {
            if (!fs.existsSync(base)) continue;
        } catch {
            continue;
        }
        if (uvrSubfolder) {
            const specific = path.join(base, uvrSubfolder, fileName);
            if (fs.existsSync(specific)) return specific;
        }
        const subdirs = ['VR_Models', 'MDX_Net_Models', 'Demucs_Models', path.join('Demucs_Models', 'v3_v4_repo')];
        for (const sub of subdirs) {
            const p = path.join(base, sub, fileName);
            if (fs.existsSync(p)) return p;
        }
        const flat = path.join(base, fileName);
        if (fs.existsSync(flat)) return flat;
    }
    return null;
};

/** Active downloads map: modelId -> { req, aborted } */
const activeDownloads = new Map();

/**
 * Checks which models are downloaded and ready on disk.
 */
const getModelsStatus = (userDataPath, appModelsDir) => {
    const modelsDir = getAiModelsDir(userDataPath);

    return MODEL_CATALOG.map((model) => {
        // Built-in htdemucs is available if packaged in appModelsDir
        if (model.id === 'htdemucs_mnn') {
            const bundledPath = appModelsDir ? path.join(appModelsDir, model.fileName) : null;
            const isBundled = bundledPath ? fs.existsSync(bundledPath) : false;
            return {
                ...model,
                isDownloaded: isBundled || true, // Treated as available built-in
                localPath: bundledPath || '',
                source: 'builtin',
            };
        }

        // 1. Check Folia local models dir
        const localPath = path.join(modelsDir, model.fileName);
        const exists = fs.existsSync(localPath);
        let sizeMb = 0;
        if (exists) {
            try {
                sizeMb = Math.round((fs.statSync(localPath).size / (1024 * 1024)) * 10) / 10;
            } catch {
                sizeMb = 0;
            }
        }

        if (exists && sizeMb > 0) {
            return {
                ...model,
                isDownloaded: true,
                localPath,
                actualSizeMb: sizeMb,
                source: 'download',
            };
        }

        // 2. Check UVR models directory on disk (e.g. D:\AI-Voice\Ultimate Vocal Remover\models)
        const uvrPath = findUvrModelPath(model.fileName, model.uvrSubfolder);
        if (uvrPath && fs.existsSync(uvrPath)) {
            let uvrSizeMb = 0;
            try {
                uvrSizeMb = Math.round((fs.statSync(uvrPath).size / (1024 * 1024)) * 10) / 10;
            } catch {
                uvrSizeMb = 0;
            }
            if (uvrSizeMb > 0) {
                return {
                    ...model,
                    isDownloaded: true,
                    isUvrDetected: true,
                    source: 'uvr5',
                    localPath: uvrPath,
                    actualSizeMb: uvrSizeMb,
                };
            }
        }

        return {
            ...model,
            isDownloaded: false,
            localPath: '',
            actualSizeMb: 0,
            source: 'download',
        };
    });
};

/**
 * Downloads a model weight file with streaming progress.
 */
const downloadModel = async (userDataPath, modelId, onProgress) => {
    const model = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!model) throw new Error(`Model not found: ${modelId}`);
    if (!model.downloadUrl) {
        throw new Error(`Model ${modelId} does not require downloading (built-in).`);
    }

    const modelsDir = getAiModelsDir(userDataPath);
    const targetPath = path.join(modelsDir, model.fileName);
    const tmpPath = `${targetPath}.tmp`;

    if (activeDownloads.has(modelId)) {
        throw new Error(`Download already in progress for model: ${modelId}`);
    }

    return new Promise((resolve, reject) => {
        const executeDownload = (url, redirectCount = 0) => {
            if (redirectCount > 5) {
                activeDownloads.delete(modelId);
                reject(new Error('Too many HTTP redirects'));
                return;
            }

            const client = url.startsWith('https:') ? https : http;
            const req = client.get(url, { headers: { 'User-Agent': 'Folia-AI-Karaoke/0.7.21' } }, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    executeDownload(res.headers.location, redirectCount + 1);
                    return;
                }

                if (res.statusCode !== 200) {
                    activeDownloads.delete(modelId);
                    reject(new Error(`Server returned HTTP ${res.statusCode}`));
                    return;
                }

                const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
                let receivedBytes = 0;
                const fileStream = fs.createWriteStream(tmpPath);

                fileStream.on('error', (err) => {
                    activeDownloads.delete(modelId);
                    try { fileStream.close(); } catch {}
                    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
                    reject(err);
                });

                let lastReportTime = Date.now();
                let lastReportBytes = 0;

                res.on('data', (chunk) => {
                    receivedBytes += chunk.length;
                    fileStream.write(chunk);
                    const now = Date.now();
                    if (totalBytes > 0 && onProgress && (now - lastReportTime >= 250 || receivedBytes === totalBytes)) {
                        const elapsedSec = (now - lastReportTime) / 1000;
                        const speedBytesPerSec = elapsedSec > 0 ? (receivedBytes - lastReportBytes) / elapsedSec : 0;
                        lastReportTime = now;
                        lastReportBytes = receivedBytes;
                        const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
                        onProgress({ modelId, percent, receivedBytes, totalBytes, speedBytesPerSec });
                    }
                });

                res.on('end', () => {
                    fileStream.end(async () => {
                        activeDownloads.delete(modelId);
                        try {
                            if (fs.existsSync(targetPath)) {
                                fs.unlinkSync(targetPath);
                            }
                            fs.renameSync(tmpPath, targetPath);
                            resolve({ success: true, localPath: targetPath });
                        } catch (err) {
                            reject(err);
                        }
                    });
                });

                res.on('error', (err) => {
                    activeDownloads.delete(modelId);
                    fileStream.close();
                    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                    reject(err);
                });
            });

            req.on('error', (err) => {
                activeDownloads.delete(modelId);
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                reject(err);
            });

            activeDownloads.set(modelId, { req });
        };

        executeDownload(model.downloadUrl);
    });
};

/**
 * Cancels an in-progress model download.
 */
const cancelModelDownload = (userDataPath, modelId) => {
    const active = activeDownloads.get(modelId);
    if (active) {
        active.req.destroy();
        activeDownloads.delete(modelId);
    }
    const modelsDir = getAiModelsDir(userDataPath);
    const model = MODEL_CATALOG.find((m) => m.id === modelId);
    if (model) {
        const tmpPath = path.join(modelsDir, `${model.fileName}.tmp`);
        if (fs.existsSync(tmpPath)) {
            try {
                fs.unlinkSync(tmpPath);
            } catch {
                // Ignore cleanup error
            }
        }
    }
    return { canceled: true };
};

/**
 * Deletes a downloaded model to free space.
 */
const deleteModel = (userDataPath, modelId) => {
    const modelsDir = getAiModelsDir(userDataPath);
    const model = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!model) return { removed: false };

    const targetPath = path.join(modelsDir, model.fileName);
    if (fs.existsSync(targetPath)) {
        try {
            fs.unlinkSync(targetPath);
            return { removed: true, path: targetPath };
        } catch (err) {
            return { removed: false, error: String(err) };
        }
    }
    return { removed: false };
};

/**
 * Retrieves cached karaoke output files (vocals, beat, lrc) for a song.
 */
const getCachedKaraoke = (userDataPath, songId) => {
    if (!songId) return null;
    const cleanSongId = path.basename(String(songId || '')).replace(/[^\p{L}\p{N}_.-]/gu, '');
    if (!cleanSongId) return null;
    const baseDir = path.resolve(getKaraokeOutputDir(userDataPath));
    const outputDir = path.resolve(baseDir, cleanSongId);
    if (!outputDir.startsWith(baseDir + path.sep)) return null;
    const infoPath = path.join(outputDir, 'info.json');
    if (!fs.existsSync(infoPath)) return null;

    try {
        const raw = fs.readFileSync(infoPath, 'utf8');
        const data = JSON.parse(raw);
        if (data.lrcPath && fs.existsSync(data.lrcPath)) {
            data.lrcText = fs.readFileSync(data.lrcPath, 'utf8');
        } else {
            const fallbackLrc = path.join(outputDir, `${songId}.lrc`);
            if (fs.existsSync(fallbackLrc)) {
                data.lrcText = fs.readFileSync(fallbackLrc, 'utf8');
                data.lrcPath = fallbackLrc;
            }
        }
        if (data.enhancedLrcPath && fs.existsSync(data.enhancedLrcPath)) {
            data.enhancedLrcText = fs.readFileSync(data.enhancedLrcPath, 'utf8');
        } else {
            const fallbackKaraokeLrc = path.join(outputDir, `${songId}.karaoke.lrc`);
            if (fs.existsSync(fallbackKaraokeLrc)) {
                data.enhancedLrcText = fs.readFileSync(fallbackKaraokeLrc, 'utf8');
                data.enhancedLrcPath = fallbackKaraokeLrc;
            }
        }
        return data;
    } catch {
        return null;
    }
};

/**
 * Lists all cached karaoke outputs from disk with metadata, sorted newest first.
 */
const listAllKaraokeOutputs = (userDataPath) => {
    const baseDir = getKaraokeOutputDir(userDataPath);
    if (!fs.existsSync(baseDir)) return [];

    try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        const results = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const songDir = path.join(baseDir, entry.name);
            const infoPath = path.join(songDir, 'info.json');
            if (!fs.existsSync(infoPath)) continue;

            try {
                const raw = fs.readFileSync(infoPath, 'utf8');
                const data = JSON.parse(raw);

                let totalSizeBytes = 0;
                let hasVocals = false;
                let hasInstrumental = false;
                let hasInstruments = false;
                let hasDrums = false;
                let hasBass = false;
                let hasLrc = false;

                if (data.vocalsPath && fs.existsSync(data.vocalsPath)) {
                    hasVocals = true;
                    try { totalSizeBytes += fs.statSync(data.vocalsPath).size; } catch {}
                }
                if (data.instrumentalPath && fs.existsSync(data.instrumentalPath)) {
                    hasInstrumental = true;
                    try { totalSizeBytes += fs.statSync(data.instrumentalPath).size; } catch {}
                }
                if (data.instrumentsPath && fs.existsSync(data.instrumentsPath)) {
                    hasInstruments = true;
                    try { totalSizeBytes += fs.statSync(data.instrumentsPath).size; } catch {}
                } else {
                    const fallbackInst = path.join(songDir, 'instruments.wav');
                    if (fs.existsSync(fallbackInst)) {
                        hasInstruments = true;
                        data.instrumentsPath = fallbackInst;
                        try { totalSizeBytes += fs.statSync(fallbackInst).size; } catch {}
                    }
                }
                if (data.drumsPath && fs.existsSync(data.drumsPath)) {
                    hasDrums = true;
                    try { totalSizeBytes += fs.statSync(data.drumsPath).size; } catch {}
                } else {
                    const fallbackDrums = path.join(songDir, 'drums.wav');
                    if (fs.existsSync(fallbackDrums)) {
                        hasDrums = true;
                        data.drumsPath = fallbackDrums;
                        try { totalSizeBytes += fs.statSync(fallbackDrums).size; } catch {}
                    }
                }
                if (data.bassPath && fs.existsSync(data.bassPath)) {
                    hasBass = true;
                    try { totalSizeBytes += fs.statSync(data.bassPath).size; } catch {}
                } else {
                    const fallbackBass = path.join(songDir, 'bass.wav');
                    if (fs.existsSync(fallbackBass)) {
                        hasBass = true;
                        data.bassPath = fallbackBass;
                        try { totalSizeBytes += fs.statSync(fallbackBass).size; } catch {}
                    }
                }
                if (data.lrcPath && fs.existsSync(data.lrcPath)) {
                    hasLrc = true;
                    try { totalSizeBytes += fs.statSync(data.lrcPath).size; } catch {}
                } else {
                    const fallbackLrc = path.join(songDir, `${data.songId || entry.name}.lrc`);
                    if (fs.existsSync(fallbackLrc)) {
                        hasLrc = true;
                        data.lrcPath = fallbackLrc;
                        try { totalSizeBytes += fs.statSync(fallbackLrc).size; } catch {}
                    }
                }
                if (data.enhancedLrcPath && fs.existsSync(data.enhancedLrcPath)) {
                    hasLrc = true;
                    try { totalSizeBytes += fs.statSync(data.enhancedLrcPath).size; } catch {}
                } else {
                    const fallbackKaraokeLrc = path.join(songDir, `${data.songId || entry.name}.karaoke.lrc`);
                    if (fs.existsSync(fallbackKaraokeLrc)) {
                        hasLrc = true;
                        data.enhancedLrcPath = fallbackKaraokeLrc;
                        try { totalSizeBytes += fs.statSync(fallbackKaraokeLrc).size; } catch {}
                    }
                }

                results.push({
                    songId: String(data.songId || entry.name),
                    songTitle: data.songTitle || entry.name,
                    artist: data.artist || '',
                    duration: Number(data.duration) || 0,
                    mssModelUsed: data.mssModelUsed || 'htdemucs_mnn',
                    asrModelUsed: data.asrModelUsed || 'whisper_turbo',
                    alignmentMode: data.alignmentMode || 'forced_alignment',
                    deviceUsed: data.deviceUsed || 'cpu',
                    generatedAt: Number(data.generatedAt) || (fs.statSync(infoPath).mtimeMs || 0),
                    vocalsPath: data.vocalsPath || '',
                    instrumentalPath: data.instrumentalPath || '',
                    instrumentsPath: data.instrumentsPath || '',
                    drumsPath: data.drumsPath || '',
                    bassPath: data.bassPath || '',
                    lrcPath: data.lrcPath || '',
                    enhancedLrcPath: data.enhancedLrcPath || '',
                    hasVocals,
                    hasInstrumental,
                    hasInstruments,
                    hasDrums,
                    hasBass,
                    hasLrc,
                    totalSizeBytes,
                });
            } catch (err) {
                console.warn(`[aiKaraoke] Error reading info.json in ${entry.name}:`, err);
            }
        }

        results.sort((a, b) => b.generatedAt - a.generatedAt);
        return results;
    } catch (err) {
        console.error('[aiKaraoke] Error listing karaoke outputs:', err);
        return [];
    }
};

/**
 * Deletes a cached karaoke output directory for a song.
 */
const deleteKaraokeOutput = (userDataPath, songId) => {
    if (!songId) return { ok: false, error: 'invalid_song_id' };
    const cleanSongId = path.basename(String(songId || '')).replace(/[^\p{L}\p{N}_.-]/gu, '');
    if (!cleanSongId) return { ok: false, error: 'invalid_song_id' };
    const baseDir = path.resolve(getKaraokeOutputDir(userDataPath));
    const outputDir = path.resolve(baseDir, cleanSongId);
    if (!outputDir.startsWith(baseDir + path.sep)) return { ok: false, error: 'invalid_path' };
    if (!fs.existsSync(outputDir)) return { ok: true, removed: false };

    try {
        fs.rmSync(outputDir, { recursive: true, force: true });
        return { ok: true, removed: true, songId: cleanSongId };
    } catch (err) {
        console.error(`[aiKaraoke] Error deleting karaoke output for ${songId}:`, err);
        return { ok: false, error: String((err && err.message) || err) };
    }
};


module.exports = {
    MODEL_CATALOG,
    getAiModelsDir,
    getKaraokeOutputDir,
    getModelsStatus,
    downloadModel,
    cancelModelDownload,
    deleteModel,
    getCachedKaraoke,
    listAllKaraokeOutputs,
    deleteKaraokeOutput,
};
