// src/utils/legacyTagTextRepair.ts
// Old Chinese rippers wrote GBK bytes into ID3v1 tags and into ID3v2 frames that declare
// ISO-8859-1 (encoding byte 0). music-metadata decodes those bytes as Latin-1, which shows up as
// "¸ÃËÀµÄÎÂÈá" instead of "该死的温柔". This recovers the original bytes and decodes them as GBK.
//
// Real Latin-1 text must survive untouched, so the gate is strict: every non-ASCII byte has to sit
// in a pair that lies entirely in the GB2312 range 0xA1–0xFE. "Björk" fails it (0xF6 is followed by
// ASCII "r", which GBK would otherwise accept as a trail byte), and so does "Café" (a lone 0xE9).
// The cost is that rare GBK-extension characters whose trail byte is below 0x80 stay unrepaired.

const GB2312_BYTE_MIN = 0xa1;
const GB2312_BYTE_MAX = 0xfe;
const CJK_TEXT_PATTERN = /[　-〿぀-ヿ㐀-鿿豈-﫿＀-￯]/u;

let gbkDecoder: TextDecoder | null | undefined;

const getGbkDecoder = (): TextDecoder | null => {
    if (gbkDecoder === undefined) {
        try {
            gbkDecoder = new TextDecoder('gbk', { fatal: true });
        } catch {
            gbkDecoder = null;
        }
    }
    return gbkDecoder;
};

const isGb2312Byte = (code: number): boolean => code >= GB2312_BYTE_MIN && code <= GB2312_BYTE_MAX;

/** Returns the GBK reading of a Latin-1-decoded tag string, or the input when it does not qualify. */
export const repairLatin1DecodedGbkText = (text: string): string => {
    let hasHighByte = false;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code < 0x80) continue;
        if (code > 0xff) return text;
        if (!isGb2312Byte(code) || !isGb2312Byte(text.charCodeAt(index + 1))) return text;
        hasHighByte = true;
        index += 1;
    }
    if (!hasHighByte) return text;

    const decoder = getGbkDecoder();
    if (!decoder) return text;

    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
        bytes[index] = text.charCodeAt(index);
    }

    try {
        const decoded = decoder.decode(bytes);
        return CJK_TEXT_PATTERN.test(decoded) ? decoded : text;
    } catch {
        return text;
    }
};

/** Only ID3 can carry this mojibake: Vorbis comments, APE and MP4 atoms are defined as UTF-8/UTF-16. */
export const hasLegacyId3Tags = (tagTypes: readonly string[] | undefined): boolean => (
    tagTypes?.some(tagType => tagType === 'ID3v1' || tagType.startsWith('ID3v2')) ?? false
);

const WIN1252_TO_BYTE: ReadonlyMap<number, number> = new Map([
    [0x20ac, 0x80], // €
    [0x201a, 0x82], // ‚
    [0x0192, 0x83], // ƒ
    [0x201e, 0x84], // „
    [0x2026, 0x85], // …
    [0x2020, 0x86], // †
    [0x2021, 0x87], // ‡
    [0x02c6, 0x88], // ˆ
    [0x2030, 0x89], // ‰
    [0x0160, 0x8a], // Š
    [0x2039, 0x8b], // ‹
    [0x0152, 0x8c], // Œ
    [0x017d, 0x8e], // Ž
    [0x2018, 0x91], // ‘
    [0x2019, 0x92], // ’
    [0x201c, 0x93], // “
    [0x201d, 0x94], // ”
    [0x2022, 0x95], // •
    [0x2013, 0x96], // –
    [0x2014, 0x97], // —
    [0x02dc, 0x98], // ˜
    [0x2122, 0x99], // ™
    [0x0161, 0x9a], // š
    [0x203a, 0x9b], // ›
    [0x0153, 0x9c], // œ
    [0x017e, 0x9e], // ž
    [0x0178, 0x9f], // Ÿ
]);

const MOJIBAKE_CHUNK_PATTERN = /([ÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122\xA0-\xBF]{2,})/gu;

const tryDecodeUtf8Bytes = (text: string): string | null => {
    let hasHighByte = false;
    const bytes: number[] = [];
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code < 0x80) {
            bytes.push(code);
        } else if (code <= 0xff) {
            bytes.push(code);
            hasHighByte = true;
        } else if (WIN1252_TO_BYTE.has(code)) {
            bytes.push(WIN1252_TO_BYTE.get(code)!);
            hasHighByte = true;
        } else {
            return null;
        }
    }
    if (!hasHighByte) return null;
    try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
        return decoded.length < text.length ? decoded : null;
    } catch {
        return null;
    }
};

/**
 * Repairs text where UTF-8 bytes were mistakenly decoded as Windows-1252 or Latin-1 (ISO-8859-1).
 * Recovers Vietnamese, Japanese, Chinese, and European accents (e.g. "Sá»± Nghiá»‡p" -> "Sự Nghiệp").
 */
export const repairMojibakeText = (text: string): string => {
    if (!text || typeof text !== 'string') return text;
    const whole = tryDecodeUtf8Bytes(text);
    if (whole !== null) return whole;
    return text.replace(MOJIBAKE_CHUNK_PATTERN, chunk => tryDecodeUtf8Bytes(chunk) ?? chunk);
};

/** Unified tag text repair: fixes UTF-8 mojibake first, then falls back to legacy GBK repair. */
export const repairTagText = (text: string): string => {
    const mojibakeRepaired = repairMojibakeText(text);
    if (mojibakeRepaired !== text) return mojibakeRepaired;
    return repairLatin1DecodedGbkText(text);
};

