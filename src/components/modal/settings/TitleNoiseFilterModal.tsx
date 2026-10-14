import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ChevronLeft, Music2, RotateCcw, Search, Sparkles } from 'lucide-react';
import { useLyricSettingsStore } from '../../../stores/useLyricSettingsStore';
import { cleanTitleWithRules, parseAndValidateFilterRules } from '../../../utils/lyrics/titleNoiseFilter';

// src/components/modal/settings/TitleNoiseFilterModal.tsx
// Dedicated modal for configuring online lyric search title noise filtering.

interface TitleNoiseFilterModalProps {
    isOpen: boolean;
    isDaylight: boolean;
    currentSongTitle?: string | null;
    onClose: () => void;
}

const shellTransition = {
    duration: 0.28,
    ease: [0.22, 1, 0.36, 1] as const,
};

const panelMotion = {
    initial: { y: 24, opacity: 0, scale: 0.985 },
    animate: { y: 0, opacity: 1, scale: 1 },
    exit: { y: 24, opacity: 0, scale: 0.985 },
};

const TitleNoiseFilterModal: React.FC<TitleNoiseFilterModalProps> = ({
    isOpen,
    isDaylight,
    currentSongTitle,
    onClose,
}) => {
    const { t } = useTranslation();

    const isEnabled = useLyricSettingsStore(state => state.titleNoiseFilterEnabled);
    const isDefaultEnabled = useLyricSettingsStore(state => state.titleNoiseFilterDefaultEnabled);
    const customKeywords = useLyricSettingsStore(state => state.titleNoiseFilterCustomKeywords);

    const toggleEnabled = useLyricSettingsStore(state => state.handleSetTitleNoiseFilterEnabled);
    const toggleDefaultEnabled = useLyricSettingsStore(state => state.handleSetTitleNoiseFilterDefaultEnabled);
    const setCustomKeywords = useLyricSettingsStore(state => state.handleSetTitleNoiseFilterCustomKeywords);

    const [testTitle, setTestTitle] = useState(currentSongTitle || '');

    const glassBg = isDaylight ? 'bg-white/70' : 'bg-black/40';
    const cardBg = isDaylight ? 'bg-black/[0.03]' : 'bg-white/[0.04]';
    const borderColor = isDaylight ? 'border-black/5' : 'border-white/10';
    const inputBg = isDaylight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10';
    const trackBg = isDaylight ? 'bg-black/[0.04]' : 'bg-white/[0.03]';
    const mutedText = isDaylight ? 'text-zinc-500' : 'text-white/50';
    const dangerText = isDaylight ? 'text-red-600' : 'text-red-300';
    const overlayBackground = isDaylight ? 'rgba(244, 244, 245, 0.9)' : 'rgba(10, 10, 12, 0.82)';
    const toggleOffBackgroundClass = isDaylight ? 'bg-zinc-300/90' : 'bg-white/10';

    // Parse and validate custom rules
    const { validRules, errors } = useMemo(
        () => parseAndValidateFilterRules(customKeywords),
        [customKeywords]
    );

    // Compute live preview
    const cleanedPreview = useMemo(() => {
        if (!isEnabled) return testTitle;
        return cleanTitleWithRules(testTitle, {
            useDefaultFilter: isDefaultEnabled,
            customRules: validRules,
        });
    }, [isEnabled, isDefaultEnabled, validRules, testTitle]);

    const handleReset = () => {
        setCustomKeywords('');
        if (!isDefaultEnabled) toggleDefaultEnabled(true);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={shellTransition}
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 backdrop-blur-2xl"
                    style={{ backgroundColor: overlayBackground }}
                    onClick={onClose}
                >
                    <motion.div
                        {...panelMotion}
                        transition={shellTransition}
                        className={`mx-auto flex h-full max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border ${borderColor} ${glassBg} shadow-[0_24px_80px_rgba(0,0,0,0.28)]`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
                            <div className="flex min-w-0 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label={t('options.back', 'Back')}
                                    className="h-10 w-10 shrink-0 rounded-full border border-white/10 bg-white/5 flex items-center justify-center transition-colors hover:bg-white/10 cursor-pointer"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="truncate text-lg font-semibold sm:text-xl" style={{ color: 'var(--text-primary)' }}>
                                            {t('lyricFilter.titleNoiseFilterTitle')}
                                        </div>
                                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${borderColor} ${trackBg}`} style={{ color: 'var(--text-secondary)' }}>
                                            {t('lyricFilter.titleNoiseFilterTag')}
                                        </span>
                                    </div>
                                    <div className={`mt-0.5 text-xs truncate max-w-[420px] ${mutedText}`}>
                                        {t('lyricFilter.titleNoiseFilterDesc')}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleReset}
                                title={t('lyricFilter.clear')}
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs transition-colors hover:bg-white/10 cursor-pointer"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                <RotateCcw size={13} />
                                <span>{t('options.resetToDefault', 'Reset')}</span>
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                            {/* Card 1: Master Toggle Switch */}
                            <div className={`flex items-center justify-between gap-4 rounded-[24px] border p-4 sm:p-5 ${cardBg} ${borderColor}`}>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        <Search size={15} className="opacity-70" />
                                        <span>{t('lyricFilter.titleNoiseFilterTitle')}</span>
                                    </div>
                                    <div className={`text-xs ${mutedText} max-w-[460px]`}>
                                        {t('lyricFilter.titleNoiseFilterDesc')}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => toggleEnabled(!isEnabled)}
                                    aria-label={t('lyricFilter.titleNoiseFilterTitle')}
                                    className={`h-6 w-12 shrink-0 rounded-full p-1 transition-colors cursor-pointer ${!isEnabled ? toggleOffBackgroundClass : ''}`}
                                    style={{ backgroundColor: isEnabled ? 'var(--text-secondary)' : undefined }}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {isEnabled && (
                                <>
                                    {/* Card 2: Default universal rules - Smooth Toggle Switch */}
                                    <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${cardBg} ${borderColor}`}>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                                <Sparkles size={14} className="opacity-70" />
                                                <span>{t('lyricFilter.useDefaultKeywords')}</span>
                                            </div>
                                            <div className={`text-[11px] ${mutedText} max-w-[460px]`}>
                                                {t('lyricFilter.useDefaultKeywordsDesc')}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => toggleDefaultEnabled(!isDefaultEnabled)}
                                            aria-label={t('lyricFilter.useDefaultKeywords')}
                                            className={`h-5 w-10 shrink-0 rounded-full p-0.5 transition-colors cursor-pointer ${!isDefaultEnabled ? toggleOffBackgroundClass : ''}`}
                                            style={{ backgroundColor: isDefaultEnabled ? 'var(--text-secondary)' : undefined }}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${isDefaultEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>

                                    {/* Card 3: Custom keywords & Regex Textarea (Tall height) */}
                                    <div className={`rounded-2xl border p-4 sm:p-5 ${cardBg} ${borderColor}`}>
                                        <div className="flex items-center justify-between text-xs mb-2">
                                            <span style={{ color: 'var(--text-primary)' }} className="font-semibold">
                                                {t('lyricFilter.customKeywordsTitle')}
                                            </span>
                                            <span className={mutedText}>
                                                {t('lyricFilter.customKeywordsHint')}
                                            </span>
                                        </div>
                                        <textarea
                                            value={customKeywords}
                                            onChange={(e) => setCustomKeywords(e.target.value)}
                                            placeholder={t('lyricFilter.customKeywordsPlaceholder')}
                                            rows={7}
                                            className={`w-full resize-y rounded-2xl border px-4 py-3 font-mono text-xs leading-relaxed outline-none transition-colors ${inputBg} ${
                                                errors.length > 0 ? 'border-red-500/50 focus:border-red-500' : ''
                                            }`}
                                            style={{ color: 'var(--text-primary)' }}
                                        />

                                        {/* Error banner if regex syntax is invalid */}
                                        {errors.length > 0 && (
                                            <div className={`mt-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs ${dangerText} space-y-1`}>
                                                <div className="flex items-center gap-1.5 font-semibold">
                                                    <AlertCircle size={14} />
                                                    <span>{t('lyricFilter.syntaxErrorTitle')}</span>
                                                </div>
                                                {errors.map((err, i) => (
                                                    <div key={i} className="pl-5 text-[11px] opacity-90">
                                                        • {t('lyricFilter.syntaxErrorLine', { line: err.lineNumber, raw: err.raw, error: err.error })}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Card 4: Live Test & Preview Box */}
                                    <div className={`rounded-2xl border p-4 sm:p-5 ${borderColor} ${trackBg}`}>
                                        <div className="flex items-center justify-between text-xs mb-3">
                                            <span className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                                                <CheckCircle2 size={14} className="opacity-70" />
                                                {t('lyricFilter.liveTestTitle')}
                                            </span>
                                            {currentSongTitle && currentSongTitle !== testTitle && (
                                                <button
                                                    type="button"
                                                    onClick={() => setTestTitle(currentSongTitle)}
                                                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-white/10 cursor-pointer ${borderColor} ${inputBg}`}
                                                    style={{ color: 'var(--text-primary)' }}
                                                >
                                                    <Music2 size={12} className="opacity-70" />
                                                    <span>{t('lyricFilter.useCurrentSong')}</span>
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-3">
                                            <div>
                                                <label className={`block text-[11px] font-medium mb-1.5 ${mutedText}`}>
                                                    {t('lyricFilter.testInputLabel')}
                                                </label>
                                                <textarea
                                                    rows={2}
                                                    value={testTitle}
                                                    onChange={(e) => setTestTitle(e.target.value)}
                                                    placeholder={t('lyricFilter.testInputPlaceholder')}
                                                    className={`w-full resize-none rounded-2xl border px-4 py-2.5 text-xs leading-relaxed outline-none transition-colors ${inputBg}`}
                                                    style={{ color: 'var(--text-primary)' }}
                                                />
                                            </div>

                                            <div>
                                                <label className={`block text-[11px] font-medium mb-1.5 ${mutedText}`}>
                                                    {t('lyricFilter.testOutputLabel')}
                                                </label>
                                                <div
                                                    className={`w-full min-h-[48px] flex items-center rounded-2xl border px-4 py-2.5 text-xs font-semibold leading-relaxed select-all transition-colors ${inputBg}`}
                                                    style={{ color: 'var(--text-primary)' }}
                                                >
                                                    {cleanedPreview || <span className="opacity-40">{t('lyricFilter.emptyCleanedTitle')}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default TitleNoiseFilterModal;
