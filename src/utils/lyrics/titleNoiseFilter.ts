// src/utils/lyrics/titleNoiseFilter.ts
// Configurable title noise filter for lyric search with custom keyword & regex support.

export interface ParsedFilterRule {
    raw: string;
    lineNumber: number;
    isRegex: boolean;
    regex: RegExp | null;
    keyword: string | null;
}

export interface RuleValidationResult {
    validRules: ParsedFilterRule[];
    errors: { lineNumber: number; raw: string; error: string }[];
}

const DEFAULT_VIDEO_NOISE_REGEX = /[\(\[（【〔〈《「『]\s*(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|official|audio|mv|lyrics?|lyric\s*video|full\s*ver(?:sion)?|hd|4k|m\/v|clip\s*officiel)\s*[\)\]）】〕〉》」』]/giu;
const DEFAULT_TRAILING_NOISE_REGEX = /\s*[-–—|/]\s*(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|mv|audio)\s*$/giu;
const DEFAULT_TRAILING_VIDEO_TAG_REGEX = /\s+(?:official\s*(?:music\s*)?video|official\s*audio|music\s*video|lyric\s*video|mv)\s*$/giu;

// Common universal music and video tag patterns (official, mv, beat, karaoke, instrumental, remix, cover)
const DEFAULT_KARAOKE_BRACKET_REGEX = /\[(?:official|mv|karaoke|beat|instrumental|audio|video|hd|4k|remix|cover)[^\]]*\]/gi;
const DEFAULT_KARAOKE_PAREN_REGEX = /\((?:official|mv|karaoke|beat|instrumental|audio|video|remix|cover)[^)]*\)/gi;
const DEFAULT_LEADING_PREFIX_REGEX = /^(?:karaoke|beat|instrumental)\s*[-–—:]\s*/gi;
const DEFAULT_TRAILING_SUFFIX_REGEX = /\s*[-–—:]\s*(?:karaoke|beat|instrumental).*$/gi;
const DEFAULT_STANDALONE_PHRASE_REGEX = /\b(?:official\s*(?:music\s*video|mv|audio|video)|music\s*video|lyrics?\s*video)\b/gi;

const MAX_REGEX_PATTERN_LENGTH = 150;
const DANGEROUS_NESTED_QUANTIFIER_REGEX = /\([^)]*(\+|\*|\{[0-9,]+\})[^)]*\)(\+|\*|\{[0-9,]+\})/;

/**
 * Parses user-provided multiline rule text into validated rules and syntax errors.
 */
export function parseAndValidateFilterRules(ruleText: string): RuleValidationResult {
    const lines = ruleText.split(/\r?\n/);
    const validRules: ParsedFilterRule[] = [];
    const errors: { lineNumber: number; raw: string; error: string }[] = [];

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        const lineNumber = index + 1;
        if (!trimmed || trimmed.startsWith('#')) {
            // Ignore empty lines and comments
            return;
        }

        // Check if line is formatted as a regular expression: /pattern/flags
        const regexMatch = trimmed.match(/^\/(.+)\/([gimsuy]*)$/);
        if (regexMatch) {
            const pattern = regexMatch[1];
            const flags = regexMatch[2];
            if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
                errors.push({
                    lineNumber,
                    raw: trimmed,
                    error: `Regular expression exceeds maximum length of ${MAX_REGEX_PATTERN_LENGTH} characters`,
                });
                return;
            }
            if (DANGEROUS_NESTED_QUANTIFIER_REGEX.test(pattern)) {
                errors.push({
                    lineNumber,
                    raw: trimmed,
                    error: 'Pattern contains dangerous nested quantifiers (ReDoS risk)',
                });
                return;
            }
            try {
                // Ensure 'g' (global) flag is present for replacement
                const safeFlags = flags.includes('g') ? flags : `${flags}g`;
                const regex = new RegExp(pattern, safeFlags);
                validRules.push({
                    raw: trimmed,
                    lineNumber,
                    isRegex: true,
                    regex,
                    keyword: null,
                });
            } catch (err) {
                errors.push({
                    lineNumber,
                    raw: trimmed,
                    error: err instanceof Error ? err.message : 'Invalid regular expression syntax',
                });
            }
        } else {
            // Plain text keyword
            validRules.push({
                raw: trimmed,
                lineNumber,
                isRegex: false,
                regex: null,
                keyword: trimmed,
            });
        }
    });

    return { validRules, errors };
}

export interface CleanTitleOptions {
    useDefaultFilter?: boolean;
    customRules?: ParsedFilterRule[];
}

/**
 * Applies default and custom rules to clean title noise for lyric searching.
 */
export function cleanTitleWithRules(
    title: string,
    options: CleanTitleOptions = {},
): string {
    if (!title || typeof title !== 'string') return '';
    // Bound input length to protect against CPU exhaustion
    let result = title.length > 300 ? title.slice(0, 300) : title;

    const useDefault = options.useDefaultFilter !== false;

    // 1. Apply default rules if enabled
    if (useDefault) {
        result = result
            .replace(DEFAULT_VIDEO_NOISE_REGEX, '')
            .replace(DEFAULT_TRAILING_NOISE_REGEX, '')
            .replace(DEFAULT_TRAILING_VIDEO_TAG_REGEX, '')
            .replace(DEFAULT_KARAOKE_BRACKET_REGEX, ' ')
            .replace(DEFAULT_KARAOKE_PAREN_REGEX, ' ')
            .replace(DEFAULT_LEADING_PREFIX_REGEX, '')
            .replace(DEFAULT_TRAILING_SUFFIX_REGEX, '')
            .replace(DEFAULT_STANDALONE_PHRASE_REGEX, ' ');
    }

    // 2. Apply custom rules
    if (options.customRules && options.customRules.length > 0) {
        for (const rule of options.customRules) {
            if (rule.isRegex && rule.regex) {
                try {
                    result = result.replace(rule.regex, ' ');
                } catch {
                    // Ignore regex runtime errors safely
                }
            } else if (rule.keyword) {
                // Escape special regex chars for keyword replacement
                const escaped = rule.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const kwRegex = new RegExp(escaped, 'gi');
                result = result.replace(kwRegex, ' ');
            }
        }
    }

    return result.replace(/\s+/g, ' ').trim();
}
