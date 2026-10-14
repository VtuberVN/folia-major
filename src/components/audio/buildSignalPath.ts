// src/components/audio/buildSignalPath.ts — report measured metadata separately from engine configuration.
import type { TFunction } from 'i18next';
import type { SignalSnapshot } from '../../stores/useSignalPathStore';
import type { AudioQualityInfo } from '../../types/audioQuality';
import { PlayerState } from '../../types';

export function buildSignalPath(
    state: SignalSnapshot | null,
    selected: string,
    t: TFunction,
    audioQualityInfo?: AudioQualityInfo,
    playerState?: PlayerState,
) {
    const unknown = t('signalPath.unknown', 'Not reported');
    const source = state;

    // Use measured WASAPI telemetry first; fallback to current track's audio quality metadata
    const pcmFallback = t('signalPath.pcm', 'PCM');
    const effectiveCodec = source?.sourceCodec || audioQualityInfo?.codec || (state ? pcmFallback : undefined);
    const effectiveSampleRate = source?.sourceSampleRate || audioQualityInfo?.sampleRate;
    const effectiveBits = source?.sourceBitsPerSample || audioQualityInfo?.bitDepth;
    const effectiveBitrate = source?.sourceBitrate || audioQualityInfo?.bitrate;

    const rate = effectiveSampleRate ? `${effectiveSampleRate / 1000} kHz` : unknown;
    const bits = effectiveBits ? `${effectiveBits}-bit` : '';
    const bitrate = effectiveBitrate ? `${Math.round(effectiveBitrate / 1000)} kbps` : '';

    const isWasapi = state?.backend === 'wasapi-exclusive' || selected === 'wasapi-exclusive';
    const isBitPerfect = state?.bitPerfect ?? false;

    // Brief badge label: Never show "Preparing output" forever when audio is playing or has format info
    let brief = '';
    if (state) {
        brief = [rate !== unknown ? rate : '', bits].filter(Boolean).join(' / ') || (source?.sourceCodec || t('signalPath.prepared', 'PCM'));
    } else if (audioQualityInfo && (effectiveSampleRate || effectiveBits || effectiveCodec)) {
        brief = [rate !== unknown ? rate : '', bits].filter(Boolean).join(' / ') || (effectiveCodec || t('signalPath.prepared', 'PCM'));
    } else if (playerState === PlayerState.PLAYING || playerState === PlayerState.PAUSED) {
        brief = isWasapi ? t('options.wasapiModeExclusive', 'Exclusive') : t('signalPath.sharedBrief', 'Shared');
    } else {
        brief = t('signalPath.preparing', 'Preparing output');
    }

    const sourceFormat = [effectiveCodec || pcmFallback, rate !== unknown ? rate : '', bits, bitrate].filter(Boolean).join(' · ');

    const processingText = isWasapi
        ? isBitPerfect
            ? t('signalPath.integer', 'Bit-Perfect Direct (WASAPI Exclusive)')
            : t('signalPath.compatibility', 'WASAPI Exclusive Output')
        : t('signalPath.browserProcessing', 'System Audio Mixer (Shared)');

    const inRate = effectiveSampleRate;
    const outRate = state?.sampleRate || inRate;
    const bitPerfectDirectLabel = t('signalPath.bitPerfectDirect', 'Bit-Perfect Direct');
    const conversionText = (inRate && outRate)
        ? (inRate === outRate && isWasapi)
            ? `${inRate / 1000} kHz → ${outRate / 1000} kHz (${bitPerfectDirectLabel})`
            : `${inRate / 1000} kHz → ${outRate / 1000} kHz`
        : (isWasapi ? unknown : t('signalPath.systemMixerDirect', 'System Audio Mixer Direct'));

    const outputDeviceName = state?.deviceId
        ? t('signalPath.wasapiDeviceFormat', { device: state.deviceId, defaultValue: `WASAPI Exclusive · ${state.deviceId}` })
        : isWasapi
            ? t('signalPath.wasapiDefaultDevice', 'WASAPI Exclusive (Default)')
            : t('signalPath.browser', 'Browser / System Output');

    const defaultRate = rate !== unknown ? rate : '44.1 kHz';
    const activeBits = state?.bitsPerSample || effectiveBits || 16;
    const formatValue = state?.outputFormat || t('signalPath.formatPcm', {
        bits: activeBits,
        rate: defaultRate,
        defaultValue: `PCM ${activeBits}-bit · ${defaultRate}`,
    });

    const rows = [
        {
            title: t('signalPath.source', 'Original source resolution'),
            value: sourceFormat || unknown,
        },
        {
            title: t('signalPath.processing', 'Processing'),
            value: processingText,
        },
        {
            title: t('signalPath.conversion', 'Sample-rate conversion'),
            value: conversionText,
        },
        {
            title: t('signalPath.format', 'Engine-reported format'),
            value: formatValue,
        },
        {
            title: t('signalPath.gain', 'Software volume / Gain'),
            value: isWasapi
                ? t('signalPath.bitPerfectGain', '0.0 dB (Bit-Perfect Direct)')
                : t('signalPath.systemManagedGain', 'System Managed'),
        },
        {
            title: t('signalPath.output', 'Playback engine'),
            value: outputDeviceName,
        },
    ];

    return { rows, brief };
}

