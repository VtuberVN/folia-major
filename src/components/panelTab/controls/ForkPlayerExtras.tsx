import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../types';
import { usePlayerChromeSettingsStore } from '../../../stores/usePlayerChromeSettingsStore';
import { useTypographySettingsStore } from '../../../stores/useTypographySettingsStore';
import { useStageSettingsStore } from '../../../stores/useStageSettingsStore';
import { setStatusMessage } from '../../../stores/useStatusMessageStore';
import { ObsCopyUrlButton } from '../../shared/ObsCopyUrlButton';
import { ObsCopyCssButton } from '../../shared/ObsCopyCssButton';
import { buildCurrentObsUrl } from '../../../services/obs/currentObsUrl';
import { resolveWebObsTarget, selectWebObsSource } from '../../../services/obs/webObsTarget';
import { resolveObsCopyHintKey } from '../../../services/obs/visualSettingsConfig';

// src/components/panelTab/controls/ForkPlayerExtras.tsx
// Nhanh chong bat tat 5 tuy chon hien thi va copy link/CSS OBS ngay trong panel dieu khien.
const QuickToggleRow: React.FC<{
    label: string;
    hint: string;
    on: boolean;
    accent?: string;
    offClass: string;
    onToggle: () => void;
}> = ({ label, hint, on, accent, offClass, onToggle }) => (
    <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest truncate" title={hint}>
            {label}
        </span>
        <button
            type="button"
            onClick={onToggle}
            role="switch"
            aria-checked={on}
            aria-label={label}
            title={hint}
            className={`w-9 h-5 shrink-0 rounded-full p-0.5 transition-colors ${on ? '' : offClass}`}
            style={{ backgroundColor: on ? (accent || 'rgba(114, 119, 134, 1)') : undefined }}
        >
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
    </div>
);

interface ForkPlayerExtrasProps {
    theme: Theme;
    isDaylight: boolean;
}

const ForkPlayerExtras: React.FC<ForkPlayerExtrasProps> = ({ theme, isDaylight }) => {
    const { t } = useTranslation();
    const transparentPlayerBackground = usePlayerChromeSettingsStore(state => state.transparentPlayerBackground);
    const toggleTransparentPlayerBackground = usePlayerChromeSettingsStore(state => state.handleToggleTransparentPlayerBackground);
    const autoHidePlayerChrome = usePlayerChromeSettingsStore(state => state.autoHidePlayerChrome);
    const toggleAutoHidePlayerChrome = usePlayerChromeSettingsStore(state => state.handleToggleAutoHidePlayerChrome);
    const hidePlayerProgressBar = usePlayerChromeSettingsStore(state => state.hidePlayerProgressBar);
    const toggleHidePlayerProgressBar = usePlayerChromeSettingsStore(state => state.handleToggleHidePlayerProgressBar);
    const hidePlayerTranslationSubtitle = useTypographySettingsStore(state => state.hidePlayerTranslationSubtitle);
    const toggleHidePlayerTranslationSubtitle = useTypographySettingsStore(state => state.handleToggleHidePlayerTranslationSubtitle);
    const showHarmonySubtitle = useTypographySettingsStore(state => state.showHarmonySubtitle);
    const toggleShowHarmonySubtitle = useTypographySettingsStore(state => state.handleToggleShowHarmonySubtitle);
    const toggleOffClass = isDaylight ? 'bg-black/10' : 'bg-white/10';

    const isElectron = typeof window !== 'undefined' && Boolean((window as { electron?: unknown }).electron);
    const webObsSource = useStageSettingsStore(selectWebObsSource);
    const [obsUrlCopied, setObsUrlCopied] = useState(false);
    const handleCopyObsUrl = async () => {
        const target = resolveWebObsTarget();
        if (!target) return;
        const url = await buildCurrentObsUrl(target.source, target.host, target.extra);
        try {
            await navigator.clipboard.writeText(url);
            setObsUrlCopied(true);
            window.setTimeout(() => setObsUrlCopied(false), 1600);
            const hint = resolveObsCopyHintKey();
            setStatusMessage({ type: hint.type, text: t(hint.key) });
        } catch (err) {
            console.error('Failed to copy OBS URL:', err);
            setStatusMessage({ type: 'error', text: t('status.copyFailed') });
        }
    };

    return (
        <>
            <div className="pt-2 border-t border-white/5 space-y-2">
                <QuickToggleRow
                    label={t('options.transparentPlayerBackground')}
                    hint={t('options.transparentPlayerBackgroundDesc')}
                    on={transparentPlayerBackground}
                    accent={theme.secondaryColor}
                    offClass={toggleOffClass}
                    onToggle={() => toggleTransparentPlayerBackground(!transparentPlayerBackground)}
                />
                <QuickToggleRow
                    label={t('options.autoHidePlayerChrome')}
                    hint={t('options.autoHidePlayerChromeDesc')}
                    on={autoHidePlayerChrome}
                    accent={theme.secondaryColor}
                    offClass={toggleOffClass}
                    onToggle={() => toggleAutoHidePlayerChrome(!autoHidePlayerChrome)}
                />
                <QuickToggleRow
                    label={t('options.hidePlayerProgressBar')}
                    hint={t('options.hidePlayerProgressBar')}
                    on={hidePlayerProgressBar}
                    accent={theme.secondaryColor}
                    offClass={toggleOffClass}
                    onToggle={() => toggleHidePlayerProgressBar(!hidePlayerProgressBar)}
                />
                <QuickToggleRow
                    label={t('options.hidePlayerTranslationSubtitle')}
                    hint={t('options.hidePlayerTranslationSubtitleDesc')}
                    on={hidePlayerTranslationSubtitle}
                    accent={theme.secondaryColor}
                    offClass={toggleOffClass}
                    onToggle={() => toggleHidePlayerTranslationSubtitle(!hidePlayerTranslationSubtitle)}
                />
                <QuickToggleRow
                    label={t('options.showHarmonySubtitle')}
                    hint={t('options.showHarmonySubtitleDesc')}
                    on={showHarmonySubtitle}
                    accent={theme.secondaryColor}
                    offClass={toggleOffClass}
                    onToggle={() => toggleShowHarmonySubtitle(!showHarmonySubtitle)}
                />
            </div>

            {!isElectron && (
                <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="flex w-full">
                        <ObsCopyUrlButton
                            onCopy={handleCopyObsUrl}
                            copied={obsUrlCopied}
                            disabled={webObsSource === null}
                            buttonClassName="flex-1 py-2"
                        />
                    </div>
                    <ObsCopyCssButton
                        disabled={webObsSource === null}
                        containerClassName="flex w-full"
                        buttonClassName="flex-1 py-2"
                    />
                </div>
            )}
        </>
    );
};

export default ForkPlayerExtras;
