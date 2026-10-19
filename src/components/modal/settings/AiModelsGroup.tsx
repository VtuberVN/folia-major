import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Trash2, Check, RefreshCw, Cpu, Sparkles, Layers, FolderOpen } from 'lucide-react';
import { Group, Row, Button, Value, type SettingsGroupDef } from './kit';
import { useAiKaraokeStore, openAiKaraokeLibraryModal } from '../../../stores/useAiKaraokeStore';
import {
    fetchAiModels,
    downloadAiModel,
    deleteAiModel,
    fetchKaraokeOutputs,
    openAiKaraokeOutputDirectory,
} from '../../../services/aiKaraokeService';
import { formatByteSize } from '../../../utils/formatByteSize';
import { closeSettings } from '../../../stores/useSettingsModalStore';
import type { AiModelInfo } from '../../../types/aiKaraoke';

const AI_MODELS_GROUP_DEF: SettingsGroupDef = {
    id: 'ai-karaoke-models',
    titleKey: 'options.aiKaraokeGroupTitle',
    electronOnly: true,
};

export const AiModelsGroup: React.FC = () => {
    const { t } = useTranslation();
    const models = useAiKaraokeStore((state) => state.models);
    const outputs = useAiKaraokeStore((state) => state.outputs);
    const [operatingModelId, setOperatingModelId] = useState<string | null>(null);

    const totalBytes = useMemo(
        () => outputs.reduce((sum, item) => sum + (item.totalSizeBytes || 0), 0),
        [outputs],
    );

    useEffect(() => {
        void fetchAiModels();
        void fetchKaraokeOutputs();
    }, []);

    const handleDownload = async (modelId: string) => {
        try {
            setOperatingModelId(modelId);
            await downloadAiModel(modelId);
        } finally {
            setOperatingModelId(null);
        }
    };

    const handleDelete = async (modelId: string) => {
        try {
            setOperatingModelId(modelId);
            await deleteAiModel(modelId);
        } finally {
            setOperatingModelId(null);
        }
    };

    return (
        <Group
            def={AI_MODELS_GROUP_DEF}
            foot={
                <p className="mt-2 px-1 text-[11.5px] leading-4 text-[color:var(--st-t3)]">
                    {t(
                        'options.aiKaraokeGroupDesc',
                        'Quản lý các mô hình AI để tách beat/vocal và tạo file Karaoke nhảy chữ (Enhanced LRC).',
                    )}
                </p>
            }
            action={
                <Button
                    variant="quiet"
                    onClick={() => {
                        void fetchAiModels();
                        void fetchKaraokeOutputs();
                    }}
                >
                    <RefreshCw size={13} className={operatingModelId ? 'animate-spin' : ''} />
                    <span>{t('ui.refresh', 'Làm mới')}</span>
                </Button>
            }
        >
            <Row
                label={t('options.karaokeOutputsTitle', 'Bài hát đã tách lời AI')}
                hint={t(
                    'options.karaokeOutputsHint',
                    'Danh sách file Beat & Vocal lưu trữ riêng biệt, không bị trộn lẫn vào thư mục nhạc cục bộ.',
                )}
            >
                <div className="flex items-center gap-3">
                    <Value>
                        {outputs.length} {t('karaoke.tracks', 'bài')} · {formatByteSize(totalBytes)}
                    </Value>
                    <Button
                        variant="quiet"
                        onClick={() => void openAiKaraokeOutputDirectory()}
                    >
                        <FolderOpen size={13} />
                        <span>{t('options.openFolder', 'Mở thư mục')}</span>
                    </Button>
                    <Button
                        onClick={() => {
                            closeSettings();
                            openAiKaraokeLibraryModal();
                        }}
                    >
                        <Layers size={13} />
                        <span>{t('options.manageSeparatedSongs', 'Quản lý bài đã tách')}</span>
                    </Button>
                </div>
            </Row>

            {models.length === 0 ? (
                <Row label={t('options.loadingAiModels', 'Đang tải danh sách mô hình...')}>
                    <Value>...</Value>
                </Row>
            ) : (
                models.map((model: AiModelInfo) => {
                    const isOperating = operatingModelId === model.id;
                    const isBuiltIn = model.id === 'htdemucs_mnn';

                    return (
                        <Row
                            key={model.id}
                            label={model.name}
                            hint={`${model.descriptionVi || model.description} · Khuyên dùng VRAM: ${model.recommendedVram} · Tốc độ: ${model.typicalSpeed}`}
                        >
                            <div className="flex items-center gap-3">
                                <Value>
                                    {isBuiltIn
                                        ? t('karaoke.builtIn', 'Tích hợp sẵn')
                                        : model.isDownloaded
                                          ? `${model.fileSizeMb} MB`
                                          : t('karaoke.notDownloaded', 'Chưa tải')}
                                </Value>

                                {isBuiltIn ? (
                                    <span className="text-emerald-400 text-xs flex items-center gap-1 font-medium">
                                        <Check size={14} /> {t('karaoke.ready', 'Sẵn sàng')}
                                    </span>
                                ) : model.isDownloaded ? (
                                    <Button
                                        variant="quiet"
                                        onClick={() => void handleDelete(model.id)}
                                        disabled={isOperating}
                                    >
                                        <Trash2 size={13} className="text-red-400" />
                                        <span>{t('ui.delete', 'Xóa')}</span>
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => void handleDownload(model.id)}
                                        disabled={isOperating}
                                    >
                                        <Download size={13} className={isOperating ? 'animate-spin' : ''} />
                                        <span>
                                            {isOperating
                                                ? `${model.downloadProgress ?? 0}%`
                                                : t('options.downloadModel', 'Tải về')}
                                        </span>
                                    </Button>
                                )}
                            </div>
                        </Row>
                    );
                })
            )}
        </Group>
    );
};

export default AiModelsGroup;
