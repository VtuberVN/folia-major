import type { SongResult, SongUnlockServer, UnlockSongUrlResult } from '../types';
import md5 from 'blueimp-md5';

const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

function strToBytes(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return bytes;
}

function encodeBase64(bytes: number[]): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[b2 & 63] : '=';
  }
  return result;
}

function proxyUrl(target: string): string {
  return `/api/unlock-proxy?url=${encodeURIComponent(target)}`;
}

async function proxyFetch(url: string, options?: RequestInit): Promise<Response> {
  if (isElectron) {
    return fetch(url, options);
  }
  return fetch(proxyUrl(url), options);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[（(][^）)]*[）)]/g, '').trim();
}

function normalizeArtist(artist: string): string {
  return artist.toLowerCase().replace(/[&/、，,;；]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isSongMatch(resultName: string, resultArtist: string | undefined, match: { songName: string; artist: string }): boolean {
  const nr = normalizeName(resultName);
  const no = normalizeName(match.songName);
  if (!nr) return false;
  if (no && !nr.includes(no) && !no.includes(nr)) return false;
  if (resultArtist && match.artist) {
    const nra = normalizeArtist(resultArtist);
    const noa = normalizeArtist(match.artist);
    if (nra && noa && !nra.includes(noa) && !noa.includes(nra)) return false;
  }
  return true;
}

async function searchKuwo(keyword: string): Promise<any[]> {
  const url = `http://search.kuwo.cn/r.s?correct=1&vipver=1&stype=comprehensive&encoding=utf8&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=${encodeURIComponent(keyword)}`;
  const res = await proxyFetch(url);
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (data?.content?.[1]?.musicpage?.abslist) {
      return data.content[1].musicpage.abslist;
    }
  } catch {}
  return [];
}

function kwDESEncrypt(query: string): string {
  const keyStr = 'ylzsxkwm';
  const keyBytes = strToBytes(keyStr);
  const msgBytes = strToBytes(query);
  const encrypted = kwDESCrypt(msgBytes, keyBytes, 0);
  return encodeBase64(encrypted);
}

function kwDESCrypt(msg: number[], key: number[], mode: number): number[] {
  const arrayMask = Array.from({ length: 64 }, (_, i) => BigInt(1) << BigInt(i));
  arrayMask[63] = -arrayMask[63];

  const arrayIP = [57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7,56,48,40,32,24,16,8,0,58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6];
  const arrayIP_1 = [39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25,32,0,40,8,48,16,56,24];
  const arrayE = [31,0,1,2,3,4,-1,-1,3,4,5,6,7,8,-1,-1,7,8,9,10,11,12,-1,-1,11,12,13,14,15,16,-1,-1,15,16,17,18,19,20,-1,-1,19,20,21,22,23,24,-1,-1,23,24,25,26,27,28,-1,-1,27,28,29,30,31,30,-1,-1];
  const arrayP = [15,6,19,20,28,11,27,16,0,14,22,25,4,17,30,9,1,7,23,13,31,26,2,8,18,12,29,5,21,10,3,24];
  const arrayPC_1 = [56,48,40,32,24,16,8,0,57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,60,52,44,36,28,20,12,4,27,19,11,3];
  const arrayPC_2 = [13,16,10,23,0,4,-1,-1,2,27,14,5,20,9,-1,-1,22,18,11,3,25,7,-1,-1,15,6,26,19,12,1,-1,-1,40,51,30,36,46,54,-1,-1,29,39,50,44,32,47,-1,-1,43,48,38,55,33,52,-1,-1,45,41,49,35,28,31,-1,-1];
  const arrayLs = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
  const arrayLsMask = [BigInt(0), BigInt(0x100001), BigInt(0x300003)];

  const matrixNSBox = [
    [14,4,3,15,2,13,5,3,13,14,6,9,11,2,0,5,4,1,10,12,15,6,9,10,1,8,12,7,8,11,7,0,0,15,10,5,14,4,9,10,7,8,12,3,13,1,3,6,15,12,6,11,2,9,5,0,4,2,11,14,1,7,8,13],
    [15,0,9,5,6,10,12,9,8,7,2,12,3,13,5,2,1,14,7,8,11,4,0,3,14,11,13,6,4,1,10,15,3,13,12,11,15,3,6,0,4,10,1,7,8,4,11,14,13,8,0,6,2,15,9,5,7,1,10,12,14,2,5,9],
    [10,13,1,11,6,8,11,5,9,4,12,2,15,3,2,14,0,6,13,1,3,15,4,10,14,9,7,12,5,0,8,7,13,1,2,4,3,6,12,11,0,13,5,14,6,8,15,2,7,10,8,15,4,9,11,5,9,0,14,3,10,7,1,12],
    [7,10,1,15,0,12,11,5,14,9,8,3,9,7,4,8,13,6,2,1,6,11,12,2,3,0,5,14,10,13,15,4,13,3,4,9,6,10,1,12,11,0,2,5,0,13,14,2,8,15,7,4,15,1,10,7,5,6,12,11,3,8,9,14],
    [2,4,8,15,7,10,13,6,4,1,3,12,11,7,14,0,12,2,5,9,10,13,0,3,1,11,15,5,6,8,9,14,14,11,5,6,4,1,3,10,2,12,15,0,13,2,8,5,11,8,0,15,7,14,9,4,12,7,10,9,1,13,6,3],
    [12,9,0,7,9,2,14,1,10,15,3,4,6,12,5,11,1,14,13,0,2,8,7,13,15,5,4,10,8,3,11,6,10,4,6,11,7,9,0,6,4,2,13,1,9,15,3,8,15,3,1,14,12,5,11,0,2,12,14,7,5,10,8,13],
    [4,1,3,10,15,12,5,0,2,11,9,6,8,7,6,9,11,4,12,15,0,3,10,5,14,13,7,8,13,14,1,2,13,6,14,9,4,1,2,14,11,13,5,0,1,10,8,3,0,11,3,5,9,4,15,2,7,8,12,15,10,7,6,12],
    [13,7,10,0,6,9,5,15,8,4,3,10,11,14,12,5,2,11,9,6,15,12,0,3,4,1,14,13,1,2,7,8,1,2,12,15,10,4,0,3,13,14,6,9,7,8,9,6,15,1,5,12,3,10,14,5,8,7,11,0,4,13,2,11],
  ];

  function bitTransform(arr: number[], n: number, l: bigint): bigint {
    let l2 = BigInt(0);
    for (let i = 0; i < n; i++) {
      if (arr[i] < 0 || (l & arrayMask[arr[i]]) === BigInt(0)) continue;
      l2 |= arrayMask[i];
    }
    return l2;
  }

  let l = BigInt(0);
  for (let i = 0; i < 8; i++) {
    l |= BigInt(key[i]) << BigInt(i * 8);
  }

  const j = Math.floor(msg.length / 8);
  const subKeyArr = new Array(16).fill(BigInt(0));

  let l2 = bitTransform(arrayPC_1, 56, l);
  for (let i = 0; i < 16; i++) {
    l2 = (l2 & arrayLsMask[arrayLs[i]]) << BigInt(28 - arrayLs[i]) | (l2 & ~arrayLsMask[arrayLs[i]]) >> BigInt(arrayLs[i]);
    subKeyArr[i] = bitTransform(arrayPC_2, 64, l2);
  }

  if (mode === 1) {
    for (let jj = 0; jj < 8; jj++) {
      [subKeyArr[jj], subKeyArr[15 - jj]] = [subKeyArr[15 - jj], subKeyArr[jj]];
    }
  }

  const plainBlocks = new Array(j).fill(BigInt(0));
  for (let m = 0; m < j; m++) {
    for (let n = 0; n < 8; n++) {
      plainBlocks[m] |= BigInt(msg[n + m * 8]) << BigInt(n * 8);
    }
  }

  const resultBlocks = new Array(Math.floor((1 + 8 * (j + 1)) / 8)).fill(BigInt(0));

  for (let i = 0; i < j; i++) {
    resultBlocks[i] = des64(subKeyArr, plainBlocks[i]);
  }

  const extra = msg.slice(j * 8);
  let lExtra = BigInt(0);
  for (let i = 0; i < msg.length % 8; i++) {
    lExtra |= BigInt(extra[i]) << BigInt(i * 8);
  }
  if (extra.length || mode === 0) {
    resultBlocks[j] = des64(subKeyArr, lExtra);
  }

  const result: number[] = [];
  for (const block of resultBlocks) {
    for (let i = 0; i < 8; i++) {
      result.push(Number((block >> BigInt(i * 8)) & BigInt(0xFF)));
    }
  }
  return result;

  function des64(longs: bigint[], l: bigint): bigint {
    const pR = new Array(8).fill(BigInt(0));
    let out = bitTransform(arrayIP, 64, l);
    let p0 = out & BigInt(0xFFFFFFFF);
    let p1 = out >> BigInt(32);

    for (let i = 0; i < 16; i++) {
      let r = p1;
      r = bitTransform(arrayE, 64, r);
      r ^= longs[i];
      for (let jj = 0; jj < 8; jj++) {
        pR[jj] = (r >> BigInt(jj * 8)) & BigInt(0xFF);
      }
      let sOut = BigInt(0);
      for (let sbi = 7; sbi >= 0; sbi--) {
        sOut = (sOut << BigInt(4)) | BigInt(matrixNSBox[sbi][Number(pR[sbi])]);
      }
      r = bitTransform(arrayP, 32, sOut);
      const lSave = p0;
      p0 = p1;
      p1 = lSave ^ r;
    }
    [p0, p1] = [p1, p0];
    out = (p1 << BigInt(32)) | (p0 & BigInt(0xFFFFFFFF));
    out = bitTransform(arrayIP_1, 64, out);
    return out;
  }
}

export async function unlockNeteaseUrl(songId: number | string): Promise<UnlockSongUrlResult> {
  try {
    const baseUrl = 'https://music-api.gdstudio.xyz/api.php';
    const url = `${baseUrl}?types=url&id=${songId}`;
    const res = await proxyFetch(url);
    const data = await res.json();
    if (data?.url) {
      return { code: 200, url: data.url, source: 'netease' };
    }
    return { code: 404, url: null };
  } catch {
    return { code: 404, url: null };
  }
}

export async function unlockBodianUrl(keyword: string, songName: string, artist: string): Promise<UnlockSongUrlResult> {
  try {
    const list = await searchKuwo(keyword);
    let matchedId: string | null = null;
    for (const item of list) {
      const id = item?.MUSICRID?.split('_')?.pop();
      if (!id) continue;
      const itemArtist = item?.ARTIST || '';
      if (isSongMatch(item?.SONGNAME || '', itemArtist, { songName, artist })) {
        matchedId = id;
        break;
      }
    }
    if (!matchedId) return { code: 404, url: null };

    const devid = String(Math.floor(Math.random() * 100000000000));
    const path = '/api/play/music/v2/audioUrl';
    const ts = Date.now();
    const str = `http://bd-api.kuwo.cn${path}?&br=320kmp3&musicId=${matchedId}&timestamp=${ts}`;
    const filtered = str.substring(str.indexOf('?') + 1).replace(/[^a-zA-Z0-9]/g, '').split('').sort().join('');
    const dataToEncrypt = `kuwotest${filtered}${path}`;
    const sign = md5(dataToEncrypt);
    const audioUrl = `${str}&sign=${sign}`;

    const headers: Record<string, string> = {
      'user-agent': 'Dart/2.19 (dart:io)',
      'plat': 'ar',
      'channel': 'aliopen',
      'devid': devid,
      'ver': '3.9.0',
      'host': 'bd-api.kuwo.cn',
      'qimei36': '1e9970cbcdc20a031dee9f37100017e1840e',
      'X-Forwarded-For': '1.0.1.114',
    };

    const adUrl = 'http://bd-api.kuwo.cn/api/service/advert/watch?uid=-1&token=&timestamp=1724306124436&sign=15a676d66285117ad714e8c8371691da';
    try {
      await proxyFetch(adUrl, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: 5, subType: 5, musicId: 0, adToken: '' }),
      });
    } catch {}

    const res = await proxyFetch(audioUrl, { headers });
    const data = await res.json();
    if (data?.data?.audioUrl) {
      return { code: 200, url: data.data.audioUrl, source: 'bodian' };
    }
    return { code: 404, url: null };
  } catch {
    return { code: 404, url: null };
  }
}

export async function unlockKuwoUrl(keyword: string, songName: string, artist: string): Promise<UnlockSongUrlResult> {
  try {
    const list = await searchKuwo(keyword);
    let matchedId: string | null = null;
    for (const item of list) {
      const songId = item?.MUSICRID;
      if (!songId) continue;
      const itemArtist = item?.ARTIST || '';
      if (isSongMatch(item?.SONGNAME || '', itemArtist, { songName, artist })) {
        matchedId = songId.slice('MUSIC_'.length);
        break;
      }
    }
    if (!matchedId) return { code: 404, url: null };

    const pkg = 'kwplayer_ar_5.1.0.0_B_jiakong_vh.apk';
    const encrypted = kwDESEncrypt(`corp=kuwo&source=${pkg}&p2p=1&type=convert_url2&sig=0&format=mp3&rid=${matchedId}`);
    const url = `http://mobi.kuwo.cn/mobi.s?f=kuwo&q=${encodeURIComponent(encrypted)}`;
    const res = await proxyFetch(url, { headers: { 'User-Agent': 'okhttp/3.10.0' } });
    const text = await res.text();
    const match = text.match(/http[^\s$"]+/);
    if (match) {
      return { code: 200, url: match[0], source: 'kuwo' };
    }
    return { code: 404, url: null };
  } catch {
    return { code: 404, url: null };
  }
}

export async function getUnlockAudioSource(
  song: SongResult,
  servers: { key: SongUnlockServer; enabled: boolean }[]
): Promise<UnlockSongUrlResult> {
  const artistName = song.artists?.map(a => a.name).join(' & ') || '';
  const keyword = `${song.name} - ${artistName}`;
  const enabledServers = servers.filter(s => s.enabled).map(s => s.key);

  for (const server of enabledServers) {
    try {
      let result: UnlockSongUrlResult;
      switch (server) {
        case 'netease':
          result = await unlockNeteaseUrl(song.id);
          break;
        case 'bodian':
          result = await unlockBodianUrl(keyword, song.name, artistName);
          break;
        case 'kuwo':
          result = await unlockKuwoUrl(keyword, song.name, artistName);
          break;
      }
      if (result.code === 200 && result.url) {
        return result;
      }
    } catch (e) {
      console.warn(`[Unlock] Server ${server} failed:`, e);
    }
  }

  return { code: 404, url: null };
}
