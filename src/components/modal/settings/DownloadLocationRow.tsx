// src/components/modal/settings/DownloadLocationRow.tsx
// Shows where downloaded songs are saved, lets the listener change that folder (moving the songs
// that are already downloaded), and opens the folder in the OS file manager.

import React, { useEffect, useState } from 'react';
import { Download, FolderOpen, Loader2, Pencil, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';

const DownloadLocationRow: React.FC = () => {
    const { t } = useTranslation();
    const [directory, setDirectory] = useState('');
    const [isDefault, setIsDefault] = useState(true);
    const [status, setStatus] = useState<'idle' | 'working'>('idle');

    useEffect(() => {
        let cancelled = false;
        void window.electron?.download?.getDirectory?.().then((result) => {
            if (cancelled || !result?.path) return;
            setDirectory(result.path);
            setIsDefault(Boolean(result.isDefault));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!window.electron?.download) return null;

    const reportMigration = (moved?: number, failed?: number) => {
        if (failed && failed > 0) {
            setStatusMessage({
                type: 'error',
                text: t('options.downloadLocationMoveFailed', { count: failed }),
            });
        } else if (moved && moved > 0) {
            setStatusMessage({
                type: 'success',
                text: t('options.downloadLocationMoved', { count: moved }),
            });
        }
    };

    const handleChoose = async () => {
        setStatus('working');
        try {
            const result = await window.electron?.download?.chooseDirectory?.();
            if (result && !result.canceled) {
                setDirectory(result.path);
                setIsDefault(Boolean(result.isDefault));
                reportMigration(result.moved, result.failed);
            }
        } finally {
            setStatus('idle');
        }
    };

    const handleReset = async () => {
        setStatus('working');
        try {
            const result = await window.electron?.download?.resetDirectory?.();
            if (result) {
                setDirectory(result.path);
                setIsDefault(Boolean(result.isDefault));
                reportMigration(result.moved, result.failed);
            }
        } finally {
            setStatus('idle');
        }
    };

    return (
        <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="space-y-1">
                <div className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Download size={14} />
                    {t('options.downloadLocation') || 'Download Location'}
                </div>
                <div className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }}>
                    {t('options.downloadLocationDesc') || 'Songs you download from a playlist are saved here.'}
                </div>
            </div>

            <div className="flex gap-2">
                <div className="flex-1 bg-black/10 rounded-lg border border-white/5 px-3 py-2 min-w-0">
                    <div className="text-[11px] break-all font-mono" style={{ color: 'var(--text-primary)' }}>
                        {directory || '...'}
                    </div>
                    <div className="text-[10px] opacity-45 mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {isDefault
                            ? (t('options.downloadLocationDefaultHint') || 'Using the default download location.')
                            : (t('options.downloadLocationCustomHint') || 'Using a custom download location.')}
                    </div>
                </div>
                <button
                    onClick={() => void window.electron?.download?.openDirectory?.()}
                    className="shrink-0 w-11 rounded-lg text-sm font-medium transition-colors flex items-center justify-center bg-white/10 hover:bg-white/15"
                    style={{ color: 'var(--text-primary)' }}
                    title={t('options.openDownloadLocation') || 'Open Folder'}
                    aria-label={t('options.openDownloadLocation') || 'Open Folder'}
                >
                    <FolderOpen size={16} />
                </button>
                <button
                    onClick={() => void handleChoose()}
                    disabled={status !== 'idle'}
                    className="shrink-0 w-11 rounded-lg text-sm font-medium transition-colors flex items-center justify-center bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ color: 'var(--text-primary)' }}
                    title={t('options.chooseDownloadLocation') || 'Choose Folder'}
                    aria-label={t('options.chooseDownloadLocation') || 'Choose Folder'}
                >
                    {status === 'working' ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                </button>
                {!isDefault && (
                    <button
                        onClick={() => void handleReset()}
                        disabled={status !== 'idle'}
                        className="shrink-0 w-11 rounded-lg text-sm font-medium transition-colors flex items-center justify-center bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: 'var(--text-primary)' }}
                        title={t('options.resetDownloadLocation') || 'Use Default Folder'}
                        aria-label={t('options.resetDownloadLocation') || 'Use Default Folder'}
                    >
                        <RotateCcw size={16} />
                    </button>
                )}
            </div>
        </div>
    );
};

export default DownloadLocationRow;
