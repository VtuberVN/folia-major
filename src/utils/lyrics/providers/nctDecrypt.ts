// src/utils/lyrics/providers/nctDecrypt.ts
// Decryptor for encrypted NhacCuaTui (.lrc) files using the RC4 cipher.

const DEFAULT_NCT_LYRIC_KEY = 'Lyr1cjust4nct';

function stringToBytes(str: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
        bytes.push(str.charCodeAt(i));
    }
    return bytes;
}

function hexToBytes(hex: string): number[] {
    const cleanHex = hex.trim().replace(/\s+/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
    }
    return bytes;
}

function rc4InitKey(keyBytes: number[]): number[] {
    const s: number[] = new Array(256);
    for (let i = 0; i < 256; i++) {
        s[i] = i;
    }

    let j = 0;
    let keyIndex = 0;
    for (let i = 0; i < 256; i++) {
        j = ((keyBytes[keyIndex] & 255) + (s[i] & 255) + j) & 255;
        const temp = s[i];
        s[i] = s[j];
        s[j] = temp;
        keyIndex = (keyIndex + 1) % keyBytes.length;
    }
    return s;
}

function rc4Crypt(cipherBytes: number[], key: string): number[] {
    const keyBytes = stringToBytes(key);
    const s = rc4InitKey(keyBytes);
    let i = 0;
    let j = 0;
    const plainBytes: number[] = new Array(cipherBytes.length);

    for (let idx = 0; idx < cipherBytes.length; idx++) {
        i = (i + 1) & 255;
        j = ((s[i] & 255) + j) & 255;
        const temp = s[i];
        s[i] = s[j];
        s[j] = temp;
        const t = ((s[i] & 255) + (s[j] & 255)) & 255;
        plainBytes[idx] = cipherBytes[idx] ^ s[t];
    }
    return plainBytes;
}

/**
 * Decrypts hex-encoded NhacCuaTui lyric stream using RC4.
 */
export function decryptNctLyric(hexCipher: string, key: string = DEFAULT_NCT_LYRIC_KEY): string {
    if (!hexCipher || typeof hexCipher !== 'string') return '';
    try {
        const cipherBytes = hexToBytes(hexCipher);
        const plainBytes = rc4Crypt(cipherBytes, key || DEFAULT_NCT_LYRIC_KEY);
        return new TextDecoder('utf-8').decode(new Uint8Array(plainBytes));
    } catch (err) {
        console.warn('[nctDecrypt] Failed to decrypt NCT lyric payload:', err);
        return '';
    }
}
