// electron/aiKaraoke/karaokeEngine.cjs
// Real audio separation pipeline for AI Karaoke using Folia's bundled FFmpeg
// and native C++ MNN HTDemucs model.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { getAiModelsDir, getKaraokeOutputDir, getModelsStatus } = require('./modelRegistry.cjs');

/** Active jobs tracker: jobId -> { aborted: boolean } */
const activeJobs = new Map();

/**
 * Resolves Referer header for online audio stream endpoints
 */
const getRefererForUrl = (urlStr) => {
    try {
        const u = new URL(urlStr);
        const host = u.hostname.toLowerCase();
        if (host.includes('zingmp3') || host.includes('zadn') || host.includes('zmdcdn')) return 'https://zingmp3.vn/';
        if (host.includes('nhaccuatui') || host.includes('nct.vn')) return 'https://www.nhaccuatui.com/';
        if (host.includes('163.com') || host.includes('126.net')) return 'https://music.163.com/';
        if (host.endsWith('q' + 'q.com') || host.includes('qpic.cn')) return 'https://y.' + 'q' + 'q.com/';
        if (host.includes('ku' + 'gou.com')) return 'https://www.ku' + 'gou.com/';
        if (host.includes('ku' + 'wo.cn')) return 'https://www.ku' + 'wo.cn/';
        return `${u.protocol}//${u.host}/`;
    } catch {
        return undefined;
    }
};

/**
 * Formats seconds into LRC timestamp: mm:ss.xx
 */
const formatTimestamp = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00.00';
    const totalCentis = Math.round(Math.max(0, seconds) * 100);
    const min = Math.floor(totalCentis / 6000);
    const sec = Math.floor((totalCentis % 6000) / 100);
    const cs = totalCentis % 100;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(min)}:${pad(sec)}.${pad(cs)}`;
};

/**
 * Serializes lines and words to Enhanced LRC string.
 */
const serializeEnhancedLrc = (lines, metadata = {}) => {
    const header = [];
    if (metadata.title) header.push(`[ti:${metadata.title}]`);
    if (metadata.artist) header.push(`[ar:${metadata.artist}]`);
    if (metadata.by) header.push(`[by:${metadata.by}]`);

    const sortedLines = [...lines].sort((a, b) => a.startTime - b.startTime);
    const body = sortedLines.map((line) => {
        const lineTag = `[${formatTimestamp(line.startTime)}]`;
        if (!line.words || line.words.length === 0) {
            return `${lineTag}${line.text.trim()}`;
        }
        const sortedWords = [...line.words].sort((a, b) => a.startTime - b.startTime);
        const wordParts = sortedWords.map((w) => `<${formatTimestamp(w.startTime)}>${w.text}`);
        const lastWord = sortedWords[sortedWords.length - 1];
        const endTag = `<${formatTimestamp(lastWord.endTime || line.endTime)}>`;
        return `${lineTag}${wordParts.join(' ')} ${endTag}`.trim();
    });

    return [...header, ...body].join('\n');
};

/**
 * Serializes lines to Standard LRC string.
 */
const serializeStandardLrc = (lines, metadata = {}) => {
    const header = [];
    if (metadata.title) header.push(`[ti:${metadata.title}]`);
    if (metadata.artist) header.push(`[ar:${metadata.artist}]`);
    if (metadata.by) header.push(`[by:${metadata.by}]`);

    const sortedLines = [...lines].sort((a, b) => a.startTime - b.startTime);
    const body = sortedLines.map((line) => {
        const lineTag = `[${formatTimestamp(line.startTime)}]`;
        return `${lineTag}${line.text.trim()}`;
    });

    return [...header, ...body].join('\n');
};

/**
 * Groups word-level timestamps into musical lines.
 */
const groupWordsIntoLines = (words, maxWords = 8, maxGap = 1.2) => {
    if (!words || words.length === 0) return [];

    const lines = [];
    let currentWords = [];

    const flush = () => {
        if (currentWords.length === 0) return;
        const lineStart = currentWords[0].startTime;
        const lineEnd = currentWords[currentWords.length - 1].endTime;
        const text = currentWords.map((w) => w.text.trim()).join(' ');

        lines.push({
            startTime: lineStart,
            endTime: Math.max(lineEnd, lineStart + 0.1),
            text,
            words: currentWords.map((w) => ({
                text: w.text.trim(),
                startTime: w.startTime,
                endTime: Math.max(w.endTime, w.startTime + 0.05),
            })),
        });
        currentWords = [];
    };

    for (let i = 0; i < words.length; i += 1) {
        const cur = words[i];
        if (!cur.text.trim()) continue;

        if (currentWords.length > 0) {
            const prev = currentWords[currentWords.length - 1];
            const gap = cur.startTime - prev.endTime;
            const isPunctuation = /[.!?,\u3002\uFF0C\uFF01\uFF1F]$/.test(prev.text.trim());

            if (isPunctuation || gap >= maxGap || currentWords.length >= maxWords) {
                flush();
            }
        }
        currentWords.push(cur);
    }
    flush();
    return lines;
};

/**
 * Estimates spoken syllable weight of a token.
 * For numbers (e.g. '1234234'): counts individual digits as spoken syllables,
 * so '1234234' takes 7 syllables ("một hai ba bốn hai ba bốn") instead of 1 token duration.
 */
const estimateSyllableWeight = (token) => {
    if (!token) return 1;
    const clean = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!clean) return 1;

    // Digits: count each digit as an individual spoken syllable (e.g. 1234234 = 7 syllables)
    const digitsMatch = clean.match(/\d/g);
    if (digitsMatch) {
        const nonDigits = clean.replace(/\d/g, '').trim();
        return digitsMatch.length + (nonDigits.length > 0 ? 1 : 0);
    }

    // Vietnamese words: typical words separated by spaces are monosyllables
    const isVietnamese = /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(clean);
    if (isVietnamese) {
        return 1;
    }

    // English/Latin words: count vowel clusters
    const vowelClusters = clean.match(/[aeiouy]+/gi);
    if (vowelClusters) {
        return Math.max(1, vowelClusters.length);
    }

    return 1;
};

/**
 * Parses timestamp from line start: [mm:ss.xx] or [mm:ss]
 */
const parseLrcTimestamp = (str) => {
    const match = str.match(/^\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/);
    if (!match) return null;
    const min = parseInt(match[1], 10);
    const sec = parseFloat(match[2]);
    return min * 60 + sec;
};

/**
 * Detects vocal onset peaks (acoustic attacks) from stereo/mono Float32Array PCM.
 * Uses 20ms frames, 10ms hops, RMS energy difference (novelty) and dynamic peak picking.
 */
const detectVocalOnsets = (left, right, sampleRate = 44100) => {
    if (!left || left.length === 0) return [];
    const totalSamples = left.length;
    const hasRight = right && right.length === totalSamples;

    const frameSize = Math.round(sampleRate * 0.02); // 20ms frame
    const hopSize = Math.round(sampleRate * 0.01);   // 10ms hop
    const numFrames = Math.max(1, Math.floor((totalSamples - frameSize) / hopSize) + 1);

    const energies = new Float32Array(numFrames);
    let maxEnergy = 0.0001;

    for (let f = 0; f < numFrames; f++) {
        const offset = f * hopSize;
        let sumSq = 0;
        for (let i = 0; i < frameSize; i++) {
            const idx = offset + i;
            if (idx >= totalSamples) break;
            const l = left[idx];
            const r = hasRight ? right[idx] : l;
            const mono = (l + r) * 0.5;
            sumSq += mono * mono;
        }
        const rms = Math.sqrt(sumSq / frameSize);
        energies[f] = rms;
        if (rms > maxEnergy) maxEnergy = rms;
    }

    const minOnsetEnergy = Math.max(0.004, maxEnergy * 0.06);

    // Compute novelty (positive first difference of energy)
    const diffs = new Float32Array(numFrames);
    let maxDiff = 0.0001;
    for (let f = 1; f < numFrames; f++) {
        const d = Math.max(0, energies[f] - energies[f - 1]);
        diffs[f] = d;
        if (d > maxDiff) maxDiff = d;
    }

    const diffThreshold = Math.max(0.002, maxDiff * 0.10);
    const minHopDistance = Math.round(0.08 / (hopSize / sampleRate)); // at least 80ms between onsets

    const onsets = [];
    let lastOnsetFrame = -minHopDistance;

    for (let f = 1; f < numFrames - 1; f++) {
        const d = diffs[f];
        if (d >= diffThreshold && energies[f] >= minOnsetEnergy) {
            // Local peak in energy rise
            if (d >= diffs[f - 1] && d >= diffs[f + 1] && (f - lastOnsetFrame) >= minHopDistance) {
                const time = Math.round((f * hopSize / sampleRate) * 100) / 100;
                onsets.push({
                    time,
                    energy: Math.round(energies[f] * 1000) / 1000,
                    strength: Math.round(d * 1000) / 1000,
                });
                lastOnsetFrame = f;
            }
        }
    }

    return onsets;
};

/**
 * Analyzes separated vocal PCM (stereo or mono) to detect vocal activity segments,
 * silence/intro/interlude periods, acoustic onsets, and the true vocal onset.
 */
const detectVocalActivitySegments = (left, right, sampleRate = 44100) => {
    if (!left || left.length === 0) {
        return { segments: [], onsets: [], voicedSpans: [], firstVocalOnset: 0, lastVocalOffset: 0, totalVocalDuration: 0 };
    }

    const onsets = detectVocalOnsets(left, right, sampleRate);

    const totalSamples = left.length;
    const hasRight = right && right.length === totalSamples;
    const frameSize = Math.round(sampleRate * 0.04); // 40ms window
    const hopSize = Math.round(sampleRate * 0.02);   // 20ms hop
    const numFrames = Math.max(1, Math.floor((totalSamples - frameSize) / hopSize) + 1);

    const energies = new Float32Array(numFrames);
    let maxEnergy = 0.0001;

    for (let f = 0; f < numFrames; f++) {
        const offset = f * hopSize;
        let sumSq = 0;
        for (let i = 0; i < frameSize; i++) {
            const idx = offset + i;
            if (idx >= totalSamples) break;
            const l = left[idx];
            const r = hasRight ? right[idx] : l;
            const mono = (l + r) * 0.5;
            sumSq += mono * mono;
        }
        const rms = Math.sqrt(sumSq / frameSize);
        energies[f] = rms;
        if (rms > maxEnergy) maxEnergy = rms;
    }

    // Dynamic threshold: active singing voice in separated vocals is at least 6.5% of peak
    const energyThreshold = Math.max(0.004, maxEnergy * 0.065);

    const minActiveFrames = 4; // 80ms min active voice
    const maxGapFrames = 25;   // Merge micro pauses up to 500ms within phrase

    const rawSegments = [];
    let inSegment = false;
    let segStartFrame = 0;
    let segEndFrame = 0;
    let gapFrames = 0;
    let segEnergySum = 0;
    let segFrameCount = 0;

    for (let f = 0; f < numFrames; f++) {
        const isVoice = energies[f] >= energyThreshold;
        if (isVoice) {
            if (!inSegment) {
                inSegment = true;
                segStartFrame = f;
                segEnergySum = 0;
                segFrameCount = 0;
                gapFrames = 0;
            } else {
                gapFrames = 0;
            }
            segEndFrame = f;
            segEnergySum += energies[f];
            segFrameCount++;
        } else if (inSegment) {
            gapFrames++;
            if (gapFrames > maxGapFrames) {
                if (segFrameCount >= minActiveFrames) {
                    const sTime = Math.max(0, (segStartFrame * hopSize) / sampleRate);
                    const eTime = Math.min(totalSamples / sampleRate, ((segEndFrame * hopSize) + frameSize) / sampleRate);
                    rawSegments.push({
                        start: Math.round(sTime * 100) / 100,
                        end: Math.round(eTime * 100) / 100,
                        duration: Math.round((eTime - sTime) * 100) / 100,
                        meanEnergy: segFrameCount > 0 ? segEnergySum / segFrameCount : 0,
                    });
                }
                inSegment = false;
                gapFrames = 0;
            }
        }
    }

    if (inSegment && segFrameCount >= minActiveFrames) {
        const sTime = Math.max(0, (segStartFrame * hopSize) / sampleRate);
        const eTime = Math.min(totalSamples / sampleRate, ((segEndFrame * hopSize) + frameSize) / sampleRate);
        rawSegments.push({
            start: Math.round(sTime * 100) / 100,
            end: Math.round(eTime * 100) / 100,
            duration: Math.round((eTime - sTime) * 100) / 100,
            meanEnergy: segFrameCount > 0 ? segEnergySum / segFrameCount : 0,
        });
    }

    // Merge adjacent segments separated by short inter-word gaps (< 0.8s)
    const segments = [];
    for (const cur of rawSegments) {
        if (segments.length === 0) {
            segments.push(cur);
            continue;
        }
        const prev = segments[segments.length - 1];
        const gap = cur.start - prev.end;
        if (gap < 0.8) {
            prev.end = cur.end;
            prev.duration = Math.round((prev.end - prev.start) * 100) / 100;
            prev.meanEnergy = (prev.meanEnergy + cur.meanEnergy) / 2;
        } else {
            segments.push(cur);
        }
    }

    const firstVocalOnset = onsets.length > 0 ? onsets[0].time : (segments.length > 0 ? segments[0].start : 4.0);
    const lastVocalOffset = segments.length > 0 ? segments[segments.length - 1].end : Math.round((totalSamples / sampleRate) * 100) / 100;
    const totalVocalDuration = Math.round(segments.reduce((sum, s) => sum + s.duration, 0) * 100) / 100;

    return {
        segments,
        onsets,
        voicedSpans: rawSegments,
        firstVocalOnset,
        lastVocalOffset,
        totalVocalDuration,
    };
};


/**
 * Maps active vocal timeline position to absolute audio timestamp.
 */
const mapActiveToAbsoluteTime = (activeSec, segments, fallbackDuration = 200) => {
    if (!segments || segments.length === 0) {
        return Math.min(fallbackDuration, Math.max(0, activeSec));
    }
    let accumulated = 0;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (activeSec <= accumulated + seg.duration) {
            const offsetInSeg = Math.max(0, activeSec - accumulated);
            return Math.round((seg.start + offsetInSeg) * 100) / 100;
        }
        accumulated += seg.duration;
    }
    const last = segments[segments.length - 1];
    return Math.round((last.end + Math.max(0, activeSec - accumulated)) * 100) / 100;
};

/**
 * Aligns raw lyrics text to detected words and spans.
 * Accurately weights multi-digit numbers, avoids rushing during intro/interludes,
 * and preserves existing LRC timestamps.
 */
const alignLyricsTextToWords = (rawLyrics, detectedWords, vocalActivity) => {
    const rawLines = rawLyrics
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('[ti:') && !l.startsWith('[ar:') && !l.startsWith('[al:'));

    if (rawLines.length === 0) {
        return groupWordsIntoLines(detectedWords);
    }

    // Check if lines have embedded LRC timestamps
    const parsedLines = rawLines.map((line, idx) => {
        const lineTimestamp = parseLrcTimestamp(line);
        const cleanText = line.replace(/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/, '').trim();
        const tokens = cleanText.split(/\s+/).filter(Boolean);
        const weights = tokens.map(estimateSyllableWeight);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        return {
            idx,
            originalLine: line,
            cleanText,
            lineTimestamp,
            tokens,
            weights,
            totalWeight: Math.max(1, totalWeight),
        };
    }).filter(it => it.cleanText.length > 0 || it.lineTimestamp !== null);

    const hasTimestampTags = parsedLines.some(it => it.lineTimestamp !== null);

    // Case 1: Raw lyrics already contain line timestamps [mm:ss.xx]
    if (hasTimestampTags) {
        const result = [];
        for (let i = 0; i < parsedLines.length; i++) {
            const cur = parsedLines[i];
            let lineStart = cur.lineTimestamp !== null
                ? cur.lineTimestamp
                : (result.length > 0 ? result[result.length - 1].endTime : 0);

            // Find next line timestamp for bounding
            let nextStart = null;
            for (let j = i + 1; j < parsedLines.length; j++) {
                if (parsedLines[j].lineTimestamp !== null) {
                    nextStart = parsedLines[j].lineTimestamp;
                    break;
                }
            }

            // If vocal activity segments exist, snap line start to actual vocal onset if nearby
            let voiceStart = lineStart;
            let voiceEnd = null;

            if (vocalActivity) {
                const candidateOnsets = (vocalActivity.onsets || []).filter(
                    (o) => o.time >= lineStart - 0.4 && (nextStart === null || o.time < nextStart - 0.2)
                );

                const seg = vocalActivity.segments?.find(
                    (s) => (s.start <= lineStart + 3.5 && s.end >= lineStart) ||
                           (s.start >= lineStart && (nextStart === null || s.start < nextStart))
                );

                if (candidateOnsets.length > 0) {
                    const firstOnset = candidateOnsets[0].time;
                    if (firstOnset >= lineStart - 0.4 && firstOnset <= lineStart + 4.0) {
                        voiceStart = firstOnset;
                    }
                } else if (seg && seg.start >= lineStart - 0.5 && seg.start <= lineStart + 3.0) {
                    voiceStart = seg.start;
                }

                if (seg) {
                    voiceEnd = nextStart !== null ? Math.min(nextStart, seg.end) : seg.end;
                }
            }

            const estimatedDuration = Math.max(1.8, cur.totalWeight * 0.38);
            if (voiceEnd === null || voiceEnd <= voiceStart) {
                voiceEnd = nextStart !== null
                    ? Math.min(nextStart, voiceStart + Math.max(estimatedDuration, Math.min(estimatedDuration * 1.5, nextStart - voiceStart)))
                    : voiceStart + estimatedDuration;
            } else {
                voiceEnd = Math.min(voiceEnd, voiceStart + Math.max(estimatedDuration * 1.6, 2.5));
                if (nextStart !== null && voiceEnd > nextStart) {
                    voiceEnd = nextStart;
                }
            }

            const totalSpan = Math.max(0.5, voiceEnd - voiceStart);
            const lineOnsets = (vocalActivity?.onsets || []).filter(
                (o) => o.time >= voiceStart - 0.25 && o.time <= voiceEnd + 0.25
            );

            let lineWords = [];
            if (lineOnsets.length >= Math.max(2, Math.floor(cur.tokens.length * 0.5))) {
                let prevWordEnd = voiceStart;
                for (let tIdx = 0; tIdx < cur.tokens.length; tIdx++) {
                    const token = cur.tokens[tIdx];
                    const onsetIdx = Math.min(lineOnsets.length - 1, Math.round((tIdx / Math.max(1, cur.tokens.length - 1)) * (lineOnsets.length - 1)));
                    const onsetTime = lineOnsets[onsetIdx].time;

                    let nextTime = null;
                    if (tIdx < cur.tokens.length - 1) {
                        const nextOnsetIdx = Math.min(lineOnsets.length - 1, Math.round(((tIdx + 1) / Math.max(1, cur.tokens.length - 1)) * (lineOnsets.length - 1)));
                        if (nextOnsetIdx > onsetIdx) {
                            nextTime = lineOnsets[nextOnsetIdx].time;
                        }
                    }

                    const tokenWeight = cur.weights[tIdx];
                    const approxDur = Math.max(0.2, (tokenWeight / cur.totalWeight) * totalSpan);
                    const start = Math.max(prevWordEnd, Math.max(voiceStart, onsetTime));
                    const end = nextTime !== null && nextTime > start
                        ? Math.min(voiceEnd, nextTime)
                        : Math.min(voiceEnd, start + approxDur);
                    const safeEnd = Math.max(Math.round(end * 100) / 100, Math.round((start + 0.05) * 100) / 100);
                    prevWordEnd = safeEnd;

                    lineWords.push({
                        text: token,
                        startTime: Math.round(start * 100) / 100,
                        endTime: safeEnd,
                    });
                }
            } else {
                let currentOffset = voiceStart;
                lineWords = cur.tokens.map((token, tIdx) => {
                    const tokenWeight = cur.weights[tIdx];
                    const tokenDuration = (tokenWeight / cur.totalWeight) * totalSpan;
                    const start = currentOffset;
                    const end = start + tokenDuration;
                    currentOffset += tokenDuration;
                    return {
                        text: token,
                        startTime: Math.round(start * 100) / 100,
                        endTime: Math.max(Math.round(end * 100) / 100, Math.round((start + 0.05) * 100) / 100),
                    };
                });
            }

            result.push({
                startTime: Math.round(voiceStart * 100) / 100,
                endTime: Math.round(voiceEnd * 100) / 100,
                text: cur.cleanText,
                words: lineWords,
            });
        }
        return result;
    }


    // Case 2: Plain text lyrics + Vocal Activity Segments from HTDemucs Vocals PCM
    if (vocalActivity && vocalActivity.segments && vocalActivity.segments.length > 0) {
        const totalRawWeight = parsedLines.reduce((s, it) => s + it.totalWeight, 0);
        const totalVocalDuration = Math.max(10, vocalActivity.totalVocalDuration);
        const activeSecondsPerWeight = totalVocalDuration / Math.max(1, totalRawWeight);

        let activeCursor = 0;
        const result = [];

        for (const it of parsedLines) {
            if (it.tokens.length === 0) continue;
            const lineActiveDuration = it.totalWeight * activeSecondsPerWeight;
            const lineActiveStart = activeCursor;
            const lineActiveEnd = lineActiveStart + lineActiveDuration;
            activeCursor = lineActiveEnd;

            const absLineStart = mapActiveToAbsoluteTime(lineActiveStart, vocalActivity.segments);
            const absLineEnd = mapActiveToAbsoluteTime(lineActiveEnd, vocalActivity.segments);

            const lineOnsets = (vocalActivity?.onsets || []).filter(
                (o) => o.time >= absLineStart - 0.25 && o.time <= absLineEnd + 0.25
            );

            let lineWords = [];
            if (lineOnsets.length >= Math.max(2, Math.floor(it.tokens.length * 0.5))) {
                let prevWordEnd = absLineStart;
                for (let tIdx = 0; tIdx < it.tokens.length; tIdx++) {
                    const token = it.tokens[tIdx];
                    const onsetIdx = Math.min(lineOnsets.length - 1, Math.round((tIdx / Math.max(1, it.tokens.length - 1)) * (lineOnsets.length - 1)));
                    const onsetTime = lineOnsets[onsetIdx].time;

                    let nextTime = null;
                    if (tIdx < it.tokens.length - 1) {
                        const nextOnsetIdx = Math.min(lineOnsets.length - 1, Math.round(((tIdx + 1) / Math.max(1, it.tokens.length - 1)) * (lineOnsets.length - 1)));
                        if (nextOnsetIdx > onsetIdx) {
                            nextTime = lineOnsets[nextOnsetIdx].time;
                        }
                    }

                    const tokenDur = (it.weights[tIdx] / it.totalWeight) * (absLineEnd - absLineStart);
                    const start = Math.max(prevWordEnd, Math.max(absLineStart, onsetTime));
                    const end = nextTime !== null && nextTime > start
                        ? Math.min(absLineEnd, nextTime)
                        : Math.min(absLineEnd, start + tokenDur);
                    const safeEnd = Math.max(Math.round(end * 100) / 100, Math.round((start + 0.05) * 100) / 100);
                    prevWordEnd = safeEnd;

                    lineWords.push({
                        text: token,
                        startTime: Math.round(start * 100) / 100,
                        endTime: safeEnd,
                    });
                }
            } else {
                let tokenActiveCursor = lineActiveStart;
                lineWords = it.tokens.map((token, tIdx) => {
                    const tokenActiveDur = (it.weights[tIdx] / it.totalWeight) * lineActiveDuration;
                    const tActiveStart = tokenActiveCursor;
                    const tActiveEnd = tActiveStart + tokenActiveDur;
                    tokenActiveCursor = tActiveEnd;

                    const start = mapActiveToAbsoluteTime(tActiveStart, vocalActivity.segments);
                    const end = mapActiveToAbsoluteTime(tActiveEnd, vocalActivity.segments);
                    return {
                        text: token,
                        startTime: start,
                        endTime: Math.max(end, Math.round((start + 0.05) * 100) / 100),
                    };
                });
            }


            result.push({
                startTime: absLineStart,
                endTime: Math.max(absLineEnd, Math.round((absLineStart + 0.1) * 100) / 100),
                text: it.cleanText,
                words: lineWords,
            });

        }
        return result;
    }

    // Case 3: Plain text without timestamps and no vocal activity - use detectedWords if present
    if (!detectedWords || detectedWords.length === 0) {
        let runningTime = 0;
        return parsedLines.map((it) => {
            const lineDuration = Math.max(2.5, it.totalWeight * 0.4);
            const lineStart = runningTime;
            const lineEnd = lineStart + lineDuration;
            runningTime = lineEnd + 0.5;

            let currentOffset = lineStart;
            const lineWords = it.tokens.map((token, tIdx) => {
                const tokenDuration = (it.weights[tIdx] / it.totalWeight) * lineDuration;
                const start = currentOffset;
                const end = start + tokenDuration;
                currentOffset += tokenDuration;
                return {
                    text: token,
                    startTime: Math.round(start * 100) / 100,
                    endTime: Math.max(Math.round(end * 100) / 100, Math.round((start + 0.05) * 100) / 100),
                };
            });

            return {
                startTime: Math.round(lineStart * 100) / 100,
                endTime: Math.round(lineEnd * 100) / 100,
                text: it.cleanText,
                words: lineWords,
            };
        });
    }

    const totalRawWeight = parsedLines.reduce((s, it) => s + it.totalWeight, 0);
    let wordCursor = 0;
    const result = [];

    for (const it of parsedLines) {
        if (it.tokens.length === 0) continue;
        const ratio = it.totalWeight / Math.max(1, totalRawWeight);
        const count = Math.max(1, Math.round(ratio * detectedWords.length));
        const wordsForLine = detectedWords.slice(wordCursor, wordCursor + count);
        wordCursor += wordsForLine.length;

        if (wordsForLine.length === 0) {
            const lastEnd = result.length > 0 ? result[result.length - 1].endTime : 0;
            result.push({
                startTime: lastEnd,
                endTime: lastEnd + 3,
                text: it.cleanText,
                words: [],
            });
            continue;
        }

        const lineStart = wordsForLine[0].startTime;
        const lineEnd = wordsForLine[wordsForLine.length - 1].endTime;
        const totalSpan = Math.max(0.5, lineEnd - lineStart);

        let currentOffset = lineStart;
        const lineWords = it.tokens.map((token, tIdx) => {
            const tokenWeight = it.weights[tIdx];
            const tokenDuration = (tokenWeight / it.totalWeight) * totalSpan;
            const start = currentOffset;
            const end = start + tokenDuration;
            currentOffset += tokenDuration;
            return {
                text: token,
                startTime: Math.round(start * 100) / 100,
                endTime: Math.max(Math.round(end * 100) / 100, Math.round((start + 0.05) * 100) / 100),
            };
        });

        result.push({
            startTime: Math.round(lineStart * 100) / 100,
            endTime: Math.max(Math.round(lineEnd * 100) / 100, Math.round((lineStart + 0.1) * 100) / 100),
            text: it.cleanText,
            words: lineWords,
        });
    }

    return result;
};

/**
 * Locates the bundled or system FFmpeg binary.
 */
const locateFfmpeg = () => {
    const candidates = [
        process.env.FOLIA_FFMPEG_PATH,
        process.env.FOLIA_TRANSCODE_FFMPEG_PATH,
        path.join(__dirname, '..', '..', 'build', 'ffmpeg', 'win-x64', 'ffmpeg.exe'),
        process.resourcesPath && path.join(process.resourcesPath, 'ffmpeg-audio', 'ffmpeg.exe'),
        process.resourcesPath && path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe'),
        process.resourcesPath && path.join(process.resourcesPath, 'ffmpeg-8.1.2', 'ffmpeg.exe'),
    ].filter(Boolean);

    for (const cand of candidates) {
        if (fs.existsSync(cand)) return cand;
    }
    return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
};

/**
 * Locates HTDemucs weights on disk.
 */
const locateHtdemucsModel = ({ userDataPath, appModelsDir }) => {
    const candidates = [
        appModelsDir && path.join(appModelsDir, 'htdemucs-wgsl.bin'),
        path.join(__dirname, '..', '..', 'models', 'htdemucs-wgsl.bin'),
        process.resourcesPath && path.join(process.resourcesPath, 'models', 'htdemucs-wgsl.bin'),
        path.join(getAiModelsDir(userDataPath), 'htdemucs-wgsl.bin'),
    ].filter(Boolean);

    for (const cand of candidates) {
        if (fs.existsSync(cand)) return cand;
    }
    return null;
};

/**
 * Encodes stereo Float32Array to 16-bit 44.1kHz PCM WAV.
 */
const writeWavFile = (filePath, left, right, sampleRate = 44100) => {
    const numSamples = left.length;
    const numChannels = 2;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = Buffer.alloc(totalSize);

    // RIFF chunk descriptor
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(totalSize - 8, 4);
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bytesPerSample * 8, 34);

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Interleave samples
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        const sL = Math.max(-1, Math.min(1, left[i]));
        const valL = sL < 0 ? Math.round(sL * 32768) : Math.round(sL * 32767);
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, valL)), offset);
        offset += 2;

        const sR = Math.max(-1, Math.min(1, right[i]));
        const valR = sR < 0 ? Math.round(sR * 32768) : Math.round(sR * 32767);
        buffer.writeInt16LE(Math.max(-32768, Math.min(32767, valR)), offset);
        offset += 2;
    }

    fs.writeFileSync(filePath, buffer);
};

const readPcmFromWavBuf = (wavBuf) => {
    if (!wavBuf || wavBuf.length < 44) {
        throw new Error('Tệp âm thanh trống hoặc không chứa dữ liệu audio.');
    }

    // Robust RIFF chunk parsing to locate the 'data' chunk
    let dataOffset = -1;
    let dataSize = 0;
    let offset = 12; // Start after 'RIFF' (4) + size (4) + 'WAVE' (4)

    while (offset + 8 <= wavBuf.length) {
        const chunkId = wavBuf.toString('ascii', offset, offset + 4);
        const chunkSize = wavBuf.readUInt32LE(offset + 4);
        if (chunkId === 'data') {
            dataOffset = offset + 8;
            dataSize = Math.min(chunkSize, wavBuf.length - dataOffset);
            break;
        }
        offset += 8 + chunkSize + (chunkSize % 2);
    }

    // Fallback if data chunk not found through iteration
    if (dataOffset === -1 || dataOffset >= wavBuf.length) {
        dataOffset = 44;
        dataSize = wavBuf.length - dataOffset;
    }

    const numSamples = Math.floor(dataSize / 4);
    if (numSamples <= 0) {
        throw new Error('Không có mẫu âm thanh PCM hợp lệ trong tệp audio.');
    }

    const left = new Float32Array(numSamples);
    const right = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        left[i] = wavBuf.readInt16LE(dataOffset + i * 4) / 32768.0;
        right[i] = wavBuf.readInt16LE(dataOffset + i * 4 + 2) / 32768.0;
    }
    return { left, right, sampleRate: 44100 };
};

/**
 * Decodes input audio into stereo Float32Array PCM at 44.1kHz using FFmpeg.
 */
const decodeAudioToPcm = async ({ audioPath, audioSrc, ffmpegBin, songId, songTitle, artist, userDataPath, activeJob, onProgress }) => {
    let targetPath = null;

    // 1. Direct path from audioPath
    if (audioPath && typeof audioPath === 'string' && fs.existsSync(audioPath)) {
        targetPath = audioPath;
    }

    // 2. Check file:// URL in audioSrc
    if (!targetPath && audioSrc && typeof audioSrc === 'string' && audioSrc.startsWith('file://')) {
        try {
            const rawUrl = audioSrc.replace(/^file:\/\/\/?/, '');
            const decoded = decodeURIComponent(rawUrl);
            const normalized = process.platform === 'win32' && !/^[a-zA-Z]:/.test(decoded) ? `/${decoded}` : decoded;
            if (fs.existsSync(normalized)) {
                targetPath = normalized;
            }
        } catch {}
    }

    // 3. Check electron-store config.json in userDataPath (contains downloadedSongs index & custom downloadDirectory)
    if (!targetPath && userDataPath) {
        try {
            const configPath = path.join(userDataPath, 'config.json');
            if (fs.existsSync(configPath)) {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                const dlIndex = cfg.downloadedSongs || {};
                const customDlDir = cfg.downloadDirectory || path.join(os.homedir(), 'Downloads', 'Folia');
                if (songId && dlIndex[String(songId)]?.fileName) {
                    const cand = path.join(customDlDir, dlIndex[String(songId)].fileName);
                    if (fs.existsSync(cand)) {
                        targetPath = cand;
                    }
                }
            }
        } catch {}
    }

    // 4. Check Folia Download directory by songId, songTitle or artist
    if (!targetPath && (songId || songTitle)) {
        const dlDirs = [
            path.join(os.homedir(), 'Downloads', 'Folia'),
            path.join(userDataPath, 'downloads'),
        ];
        for (const dlDir of dlDirs) {
            if (fs.existsSync(dlDir)) {
                try {
                    const files = fs.readdirSync(dlDir);
                    // 4a. Check match by songId
                    let match = songId ? files.find(f => f.includes(String(songId))) : null;
                    // 4b. Check match by sanitized songTitle
                    if (!match && songTitle) {
                        const cleanTitle = songTitle.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
                        const titleTokens = cleanTitle.split(/\s+/).filter(t => t.length > 2);
                        if (titleTokens.length > 0) {
                            match = files.find(f => {
                                const fLow = f.toLowerCase();
                                return titleTokens.every(t => fLow.includes(t));
                            });
                        }
                    }
                    if (match) {
                        targetPath = path.join(dlDir, match);
                        break;
                    }
                } catch {}
            }
        }
    }

    // 5. Check Folia Audio Cache (media-cache, cache/audio, audio-cache)
    if (!targetPath && songId && userDataPath) {
        const cacheDirs = [
            path.join(userDataPath, 'media-cache', 'audio'),
            path.join(userDataPath, 'cache', 'audio'),
            path.join(userDataPath, 'audio-cache'),
        ];
        for (const cDir of cacheDirs) {
            if (fs.existsSync(cDir)) {
                try {
                    const files = fs.readdirSync(cDir);
                    // 5a. Direct match by filename
                    let match = files.find(f => f.includes(String(songId)) && f.endsWith('.bin'));
                    // 5b. Match via .json metadata cacheKey
                    if (!match) {
                        const jsonFiles = files.filter(f => f.endsWith('.json'));
                        for (const jf of jsonFiles) {
                            try {
                                const meta = JSON.parse(fs.readFileSync(path.join(cDir, jf), 'utf8'));
                                if (meta.cacheKey && meta.cacheKey.includes(String(songId))) {
                                    const binCandidate = jf.replace(/\.json$/, '.bin');
                                    if (files.includes(binCandidate)) {
                                        match = binCandidate;
                                        break;
                                    }
                                }
                            } catch {}
                        }
                    }
                    if (match) {
                        targetPath = path.join(cDir, match);
                        break;
                    }
                } catch {}
            }
        }
    }

    // If targetPath was found: decode from local file via temp WAV
    if (targetPath) {
        const tempWavFile = path.join(os.tmpdir(), `folia-dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.wav`);
        try {
            await new Promise((resolve, reject) => {
                if (activeJob?.aborted) {
                    reject(new Error('Canceled by user'));
                    return;
                }

                const args = ['-i', targetPath, '-vn', '-c:a', 'pcm_s16le', '-ac', '2', '-ar', '44100', '-y', tempWavFile];
                const proc = spawn(ffmpegBin, args, { windowsHide: true });
                if (activeJob) {
                    activeJob.activeProc = proc;
                }

                let errOutput = '';
                proc.stderr.on('data', data => { errOutput += data.toString(); });

                proc.on('error', err => {
                    if (activeJob && activeJob.activeProc === proc) activeJob.activeProc = null;
                    reject(new Error(`FFmpeg spawn error: ${err.message}`));
                });
                proc.on('close', code => {
                    if (activeJob && activeJob.activeProc === proc) activeJob.activeProc = null;
                    if (activeJob?.aborted) {
                        reject(new Error('Canceled by user'));
                        return;
                    }
                    if (code !== 0) {
                        reject(new Error(`FFmpeg exited with code ${code}: ${errOutput.slice(-300)}`));
                        return;
                    }
                    resolve();
                });
            });

            if (!fs.existsSync(tempWavFile)) {
                throw new Error('Không tạo được tệp âm thanh giải mã WAV.');
            }
            const wavBuf = fs.readFileSync(tempWavFile);
            return readPcmFromWavBuf(wavBuf);
        } finally {
            try { if (fs.existsSync(tempWavFile)) fs.unlinkSync(tempWavFile); } catch {}
        }
    }

    // 6. If audioSrc is HTTP/HTTPS or folia scheme online stream: download & decode to temp WAV file
    if (audioSrc && typeof audioSrc === 'string' && (/^https?:\/\//i.test(audioSrc) || /^folia-[a-z0-9_-]+:\/\//i.test(audioSrc))) {
        const tempAudioFile = path.join(os.tmpdir(), `folia-stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.tmp`);
        const tempWavFile = path.join(os.tmpdir(), `folia-dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.wav`);

        try {
            if (activeJob?.aborted) {
                throw new Error('Canceled by user');
            }

            let electronNet = null;
            try {
                const electron = require('electron');
                if (electron && electron.net) {
                    electronNet = electron.net;
                }
            } catch {}

            const fetchFn = (electronNet && electronNet.fetch) ? electronNet.fetch : (typeof fetch === 'function' ? fetch : null);
            if (!fetchFn) {
                throw new Error('Không có HTTP client để tải stream nhạc');
            }

            const referer = getRefererForUrl(audioSrc);
            const reqHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                ...(referer ? { Referer: referer } : {}),
            };

            onProgress?.(6, 'Đang kết nối luồng âm thanh bài hát...', 'HTTP Stream');

            let resp = null;
            try {
                resp = await fetchFn(audioSrc, {
                    headers: reqHeaders,
                    signal: activeJob?.abortController?.signal,
                });
            } catch (fetchErr) {
                if (typeof fetch === 'function' && fetchFn !== fetch) {
                    resp = await fetch(audioSrc, {
                        headers: reqHeaders,
                        signal: activeJob?.abortController?.signal,
                    });
                } else {
                    throw fetchErr;
                }
            }

            if (!resp || !resp.ok) {
                throw new Error(`Lỗi tải stream âm thanh HTTP ${resp?.status || 'Unknown'}: ${resp?.statusText || ''}`);
            }

            if (activeJob?.aborted) {
                throw new Error('Canceled by user');
            }

            const contentLength = Number(resp.headers.get('content-length')) || 0;
            let downloadedBytes = 0;
            const fileStream = fs.createWriteStream(tempAudioFile);

            if (resp.body && typeof resp.body.getReader === 'function') {
                const reader = resp.body.getReader();
                while (true) {
                    if (activeJob?.aborted) {
                        try { reader.cancel(); } catch {}
                        fileStream.destroy();
                        throw new Error('Canceled by user');
                    }
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        downloadedBytes += value.length;
                        fileStream.write(Buffer.from(value));
                        if (contentLength > 0) {
                            const pct = Math.min(14, Math.round(6 + (downloadedBytes / contentLength) * 8));
                            onProgress?.(pct, 'Đang tải dữ liệu bài hát...', `${Math.round(downloadedBytes / 1024)} KB / ${Math.round(contentLength / 1024)} KB`);
                        } else {
                            onProgress?.(8, 'Đang tải dữ liệu bài hát...', `${Math.round(downloadedBytes / 1024)} KB`);
                        }
                    }
                }
                await new Promise((res, rej) => {
                    fileStream.end(err => err ? rej(err) : res());
                });
            } else if (resp.arrayBuffer) {
                const arrayBuffer = await resp.arrayBuffer();
                fs.writeFileSync(tempAudioFile, Buffer.from(arrayBuffer));
            }

            if (activeJob?.aborted) {
                throw new Error('Canceled by user');
            }

            onProgress?.(15, 'Đang giải mã âm thanh chuẩn PCM 44.1kHz...', 'FFmpeg Native');

            // Now decode tempAudioFile -> tempWavFile
            await new Promise((resolve, reject) => {
                const args = ['-i', tempAudioFile, '-vn', '-c:a', 'pcm_s16le', '-ac', '2', '-ar', '44100', '-y', tempWavFile];
                const proc = spawn(ffmpegBin, args, { windowsHide: true });
                if (activeJob) {
                    activeJob.activeProc = proc;
                }
                let errOutput = '';
                proc.stderr.on('data', data => { errOutput += data.toString(); });
                proc.on('error', err => {
                    if (activeJob && activeJob.activeProc === proc) activeJob.activeProc = null;
                    reject(new Error(`FFmpeg spawn error: ${err.message}`));
                });
                proc.on('close', code => {
                    if (activeJob && activeJob.activeProc === proc) activeJob.activeProc = null;
                    if (activeJob?.aborted) {
                        reject(new Error('Canceled by user'));
                        return;
                    }
                    if (code !== 0) {
                        reject(new Error(`FFmpeg stream decode error (${code}): ${errOutput.slice(-300)}`));
                        return;
                    }
                    resolve();
                });
            });

            if (!fs.existsSync(tempWavFile)) {
                throw new Error('Không tạo được tệp âm thanh giải mã WAV.');
            }

            const wavBuf = fs.readFileSync(tempWavFile);
            return readPcmFromWavBuf(wavBuf);
        } finally {
            try { if (fs.existsSync(tempAudioFile)) fs.unlinkSync(tempAudioFile); } catch {}
            try { if (fs.existsSync(tempWavFile)) fs.unlinkSync(tempWavFile); } catch {}
        }
    }

    throw new Error('Không tìm thấy nguồn âm thanh bài hát để giải mã. Hãy bấm phát bài hát này một vài giây trên Folia hoặc tải bài hát về máy rồi bấm Thử lại.');
};

/**
 * Main execution pipeline for AI Karaoke.
 */
const runKaraokePipeline = async ({
    jobId,
    audioPath,
    audioSrc,
    songId,
    songTitle,
    artist,
    duration = 200,
    rawLyrics = '',
    mssModel = 'htdemucs_mnn',
    asrModel = 'whisper_turbo',
    alignmentMode = 'align_existing',
    devicePreference = 'gpu',
    userDataPath,
    appModelsDir,
    onProgress,
    onWebGpuSeparate,
}) => {
    const abortController = new AbortController();
    const jobRecord = { aborted: false, activeProc: null, abortController };
    activeJobs.set(jobId, jobRecord);
    const startTime = Date.now();

    const report = (stage, progress, message, detail) => {
        if (stage !== 'idle' && stage !== 'error' && activeJobs.get(jobId)?.aborted) {
            throw new Error('Canceled by user');
        }
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        onProgress?.({ jobId, stage, progress, message, detail, elapsedSeconds: elapsed });
    };

    try {
        // Step 1: Model validation & loading
        const isTurbo = devicePreference === 'gpu';
        const cpuCount = (os.cpus() || []).length;
        // In Turbo mode: allocate up to 8 threads on performance cores for maximum speed
        // In Balanced mode: allocate 4 threads to keep PC cool & smooth
        const optimalThreads = isTurbo
            ? Math.max(4, Math.min(8, cpuCount > 4 ? cpuCount - 2 : cpuCount || 4))
            : Math.max(2, Math.min(4, Math.floor(cpuCount / 2) || 2));
        const deviceLabel = isTurbo
            ? `C++ MNN AVX2 Turbo (${optimalThreads} luồng P-Cores)`
            : `C++ MNN AVX2 Tiết kiệm (${optimalThreads} luồng)`;

        report('checking_models', 5, 'Kiểm tra cấu hình mô hình AI...', `MSS: ${mssModel} · ${isTurbo ? 'WebGPU / C++ MNN' : deviceLabel}`);
        const ffmpegBin = locateFfmpeg();

        let htdemucsPath = null;
        if (mssModel === 'htdemucs_mnn') {
            htdemucsPath = locateHtdemucsModel({ userDataPath, appModelsDir });
            if (!htdemucsPath || !fs.existsSync(htdemucsPath)) {
                throw new Error(`Không tìm thấy file model HTDemucs (htdemucs-wgsl.bin) tại ${htdemucsPath || 'models/'}.`);
            }
        } else {
            const modelsStatus = getModelsStatus(userDataPath, appModelsDir);
            const mssInfo = modelsStatus.find((m) => m.id === mssModel);
            if (!mssInfo || !mssInfo.isDownloaded) {
                throw new Error(`Model tách nhạc ${mssModel} chưa được tải về máy. Vui lòng vào Cài đặt để tải model trước.`);
            }
            htdemucsPath = locateHtdemucsModel({ userDataPath, appModelsDir });
            if (!htdemucsPath || !fs.existsSync(htdemucsPath)) {
                throw new Error(`Chưa có runtime cho model ${mssModel}. Vui lòng chọn HTDemucs v4 (Folia Native).`);
            }
        }

        const outputDir = path.join(getKaraokeOutputDir(userDataPath), songId || 'default');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const vocalsPath = path.join(outputDir, 'vocals.wav');
        const instrumentalPath = path.join(outputDir, 'instrumental.wav');

        // Step 2: Decode audio via FFmpeg
        report('separating_audio', 12, 'Đang giải mã dữ liệu âm thanh bài hát...', 'FFmpeg PCM 44.1kHz');
        let audioPcm = null;
        try {
            audioPcm = await decodeAudioToPcm({
                audioPath,
                audioSrc,
                ffmpegBin,
                songId,
                songTitle,
                artist,
                userDataPath,
                activeJob: jobRecord,
                onProgress: (pct, msg, detail) => {
                    report('separating_audio', pct, msg, detail);
                },
            });
        } catch (decodeErr) {
            if (jobRecord.aborted || decodeErr.message === 'Canceled by user' || String(decodeErr).includes('Canceled')) {
                try {
                    onProgress?.({ jobId, stage: 'idle', progress: 0, message: 'Tiến trình đã được hủy bởi người dùng.', detail: 'Canceled', elapsedSeconds: 0 });
                } catch {}
                return { canceled: true };
            }
            throw new Error(`Không thể giải mã âm thanh: ${decodeErr.message}`);
        }

        // Step 3: Music Source Separation with HTDemucs (WebGPU with CPU fallback)
        const { left, right } = audioPcm;
        const totalSamples = left.length;

        let separated = null;

        if (devicePreference === 'gpu' && typeof onWebGpuSeparate === 'function') {
            try {
                report('separating_audio', 20, 'Đang tách giọng hát và beat qua WebGPU (Card màn hình)...', 'WebGPU Shaders');
                const gpuResult = await onWebGpuSeparate({
                    left,
                    right,
                    signal: abortController.signal,
                    onChunkProgress: (curChunk, totalChunks, deviceLabel) => {
                        if (activeJobs.get(jobId)?.aborted) {
                            throw new Error('Canceled by user');
                        }
                        const pct = Math.round(20 + (curChunk / totalChunks) * 48);
                        const label = deviceLabel ? `WebGPU [${deviceLabel}]` : 'WebGPU Card màn hình';
                        report('separating_audio', pct, `Đang tách tần số âm thanh qua ${label}...`, `Đoạn ${curChunk}/${totalChunks} (${pct}%)`);
                    },
                });
                if (gpuResult && gpuResult.vocals) {
                    separated = gpuResult;
                }
            } catch (gpuErr) {
                if (activeJobs.get(jobId)?.aborted || String(gpuErr).includes('Canceled')) {
                    throw gpuErr;
                }
                console.warn('[aiKaraoke] WebGPU separation failed, falling back to C++ MNN CPU:', gpuErr.message);
                separated = null;
            }
        }

        if (!separated) {
            report('separating_audio', 20, `Đang tách giọng hát (Vocals) và beat qua ${deviceLabel}...`, '0%');
            const mnn = require('../analysis/mnn.cjs');
            const htdemucs = require('../analysis/htdemucs.cjs');
            try {
                if (typeof mnn.preferFastCores === 'function') {
                    mnn.preferFastCores();
                }
            } catch {}
            let model = null;
            try {
                model = mnn.loadHtdemucs(htdemucsPath, { threads: optimalThreads });
                separated = await htdemucs.separate(model, left, right, (curChunk, totalChunks) => {
                    if (activeJobs.get(jobId)?.aborted) {
                        throw new Error('Canceled by user');
                    }
                    const pct = Math.round(20 + (curChunk / totalChunks) * 48);
                    report('separating_audio', pct, `Đang tách tần số âm thanh (${deviceLabel})...`, `Đoạn ${curChunk}/${totalChunks} (${pct}%)`);
                });
            } finally {
                if (model) {
                    try { model.release(); } catch {}
                }
            }
        }



        report('separating_audio', 70, 'Đang ghi file âm thanh Beat Karaoke và Vocals chuẩn WAV PCM...', 'Ghi đĩa');
        const vocals = separated.vocals;
        const instLeft = new Float32Array(totalSamples);
        const instRight = new Float32Array(totalSamples);
        for (let i = 0; i < totalSamples; i++) {
            instLeft[i] = left[i] - vocals.left[i];
            instRight[i] = right[i] - vocals.right[i];
        }

        writeWavFile(vocalsPath, vocals.left, vocals.right, 44100);
        writeWavFile(instrumentalPath, instLeft, instRight, 44100);

        // Step 4: Analyze vocal waveform energy envelope & Voice Activity Detection (VAD)
        report('aligning_words', 74, 'Phân tích sóng âm tần số giọng hát (Vocal Envelope VAD)...', 'VAD Analysis');
        const vocalActivity = detectVocalActivitySegments(vocals.left, vocals.right, 44100);

        // Step 5: Word-level Alignment using vocal segments & syllable weighting
        let lines = [];
        const cleanRaw = (rawLyrics || '').trim();

        if (cleanRaw) {
            report('aligning_words', 78, 'Căn chỉnh lời bài hát theo từng từ (Word-level Alignment)...', `${vocalActivity.segments.length} đoạn giọng hát`);
            lines = alignLyricsTextToWords(cleanRaw, null, vocalActivity);
        } else {
            report('formatting_lrc', 85, 'Đã hoàn tất tạo bản Beat Karaoke và Giọng hát...', 'Beat ready');
            lines = [];
        }

        // Step 5: Formatting and output files
        report('formatting_lrc', 92, 'Tạo file lời bài hát chuẩn Enhanced LRC & Standard LRC...', 'Serializing LRC');
        const metadata = { title: songTitle, artist, by: 'Folia AI Karaoke' };
        const lrcText = serializeStandardLrc(lines, metadata);
        const enhancedLrcText = cleanRaw ? serializeEnhancedLrc(lines, metadata) : lrcText;

        const lrcFilePath = path.join(outputDir, `${songId || 'lyrics'}.lrc`);
        const enhancedLrcFilePath = path.join(outputDir, `${songId || 'lyrics'}.karaoke.lrc`);

        fs.writeFileSync(lrcFilePath, lrcText, 'utf8');
        fs.writeFileSync(enhancedLrcFilePath, enhancedLrcText, 'utf8');

        // Step 6: Save metadata info.json
        const info = {
            songId,
            songTitle,
            artist,
            vocalsPath,
            instrumentalPath,
            lrcPath: lrcFilePath,
            enhancedLrcPath: enhancedLrcFilePath,
            lrcText,
            enhancedLrcText,
            lines,
            duration: Math.round(totalSamples / 44100),
            mssModelUsed: mssModel,
            asrModelUsed: asrModel,
            alignmentMode,
            deviceUsed: devicePreference,
            generatedAt: Date.now(),
        };
        fs.writeFileSync(path.join(outputDir, 'info.json'), JSON.stringify(info, null, 2), 'utf8');

        report('completed', 100, 'Đã tách xong Beat Karaoke và tạo file lời thành công!', 'Saved to disk');
        return info;
    } catch (err) {
        if (activeJobs.get(jobId)?.aborted || err.message === 'Canceled by user' || String(err).includes('Canceled')) {
            try {
                onProgress?.({ jobId, stage: 'idle', progress: 0, message: 'Tiến trình đã được hủy bởi người dùng.', detail: 'Canceled', elapsedSeconds: 0 });
            } catch {}
            return { canceled: true };
        }
        try {
            report('error', 0, `Lỗi xử lý Karaoke: ${err.message}`, String(err));
        } catch {}
        throw err;
    } finally {
        activeJobs.delete(jobId);
    }
};

/**
 * Cancels a running karaoke job.
 */
const cancelKaraokeJob = (jobId) => {
    const job = activeJobs.get(jobId);
    if (job) {
        job.aborted = true;
        if (job.abortController) {
            try { job.abortController.abort(); } catch {}
        }
        if (job.activeProc) {
            try { job.activeProc.kill('SIGKILL'); } catch {}
            job.activeProc = null;
        }
        return { canceled: true };
    }
    return { canceled: false };
};

module.exports = {
    runKaraokePipeline,
    cancelKaraokeJob,
    formatTimestamp,
    serializeStandardLrc,
    serializeEnhancedLrc,
    groupWordsIntoLines,
    alignLyricsTextToWords,
    estimateSyllableWeight,
    detectVocalActivitySegments,
    detectVocalOnsets,
    writeWavFile,
    locateFfmpeg,
    locateHtdemucsModel,
    decodeAudioToPcm,
};
