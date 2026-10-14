import { describe, expect, it } from 'vitest';
import { cleanTitleWithRules, parseAndValidateFilterRules } from '@/utils/lyrics/titleNoiseFilter';

describe('titleNoiseFilter', () => {
    describe('parseAndValidateFilterRules', () => {
        it('parses plain text keywords', () => {
            const result = parseAndValidateFilterRules('[Remix]\nLive Session\n4K');
            expect(result.errors).toHaveLength(0);
            expect(result.validRules).toHaveLength(3);
            expect(result.validRules[0].keyword).toBe('[Remix]');
            expect(result.validRules[1].keyword).toBe('Live Session');
            expect(result.validRules[2].keyword).toBe('4K');
        });

        it('parses valid regular expressions with flags', () => {
            const result = parseAndValidateFilterRules('/\\b(vietsub|thuyetminh)\\b/i\n/\\[4k\\]/i');
            expect(result.errors).toHaveLength(0);
            expect(result.validRules).toHaveLength(2);
            expect(result.validRules[0].isRegex).toBe(true);
            expect(result.validRules[0].regex?.test('vietsub')).toBe(true);
        });

        it('detects syntax errors in invalid regex and reports line numbers', () => {
            const result = parseAndValidateFilterRules('[Remix]\n/(unclosed-group/i\nValidKeyword\n/[z-a]/');
            expect(result.validRules).toHaveLength(2);
            expect(result.errors).toHaveLength(2);
            expect(result.errors[0].lineNumber).toBe(2);
            expect(result.errors[0].raw).toBe('/(unclosed-group/i');
            expect(result.errors[1].lineNumber).toBe(4);
        });

        it('ignores comment lines starting with # and empty lines', () => {
            const result = parseAndValidateFilterRules('# This is a comment\n\nKeyword 1\n  \n# Comment 2\nKeyword 2');
            expect(result.validRules).toHaveLength(2);
            expect(result.errors).toHaveLength(0);
        });

        it('rejects dangerous nested quantifiers prone to ReDoS', () => {
            const result = parseAndValidateFilterRules('/(a+)+$/i\n/([0-9]*)*$/');
            expect(result.validRules).toHaveLength(0);
            expect(result.errors).toHaveLength(2);
            expect(result.errors[0].error).toContain('nested quantifiers');
            expect(result.errors[1].error).toContain('nested quantifiers');
        });

        it('rejects regex patterns exceeding the maximum character length', () => {
            const longPattern = '/' + 'a'.repeat(160) + '/i';
            const result = parseAndValidateFilterRules(longPattern);
            expect(result.validRules).toHaveLength(0);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].error).toContain('maximum length');
        });
    });

    describe('cleanTitleWithRules', () => {
        it('cleans default karaoke and video tags when useDefaultFilter is true', () => {
            expect(cleanTitleWithRules('See Tình (Official Music Video) [Karaoke Beat]'))
                .toBe('See Tình');
            expect(cleanTitleWithRules('Never Gonna Give You Up (Official Music Video)'))
                .toBe('Never Gonna Give You Up');
            expect(cleanTitleWithRules('Ai Đưa Em Về (Beat Chuẩn Tone Nữ) [Official MV]'))
                .toBe('Ai Đưa Em Về');
        });

        it('applies custom text keywords and custom regex', () => {
            const { validRules } = parseAndValidateFilterRules('[Live in Seoul]\n/\\b(vietsub|fancam)\\b/i');
            const cleaned = cleanTitleWithRules('Bài Ca Tình Yêu [Live in Seoul] Vietsub', {
                useDefaultFilter: true,
                customRules: validRules,
            });
            expect(cleaned).toBe('Bài Ca Tình Yêu');
        });

        it('bypasses default rules when useDefaultFilter is false', () => {
            const { validRules } = parseAndValidateFilterRules('CustomNoise');
            const cleaned = cleanTitleWithRules('Bài Hát [Karaoke] CustomNoise', {
                useDefaultFilter: false,
                customRules: validRules,
            });
            expect(cleaned).toBe('Bài Hát [Karaoke]');
        });
    });
});
