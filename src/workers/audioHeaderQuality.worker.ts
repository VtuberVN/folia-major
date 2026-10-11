import { parseWebStream, type IFormat } from 'music-metadata';
import type { AudioQualityInfo } from '../types/audioQuality';

// No persistent worker: the caller terminates this worker after one parse or cancellation.
export async function parseAudioHeaderQuality(input: { bytes: Uint8Array; mimeType?: string; totalSize?: number }): Promise<AudioQualityInfo | undefined> {
    let format: IFormat | undefined;
    let complete = false;
    try {
        // A BufferTokenizer replaces fileInfo.size with the partial buffer length.
        // A closed, in-memory web stream retains the verified complete HTTP size.
        const stream = new ReadableStream<Uint8Array>({ start(controller) {
            controller.enqueue(input.bytes); controller.close();
        } });
        // CDN MIME headers can be wrong (e.g. FLAC advertised as audio/aac).
        // Let music-metadata identify the container from actual bytes, rather than
        // forcing a parser from an unverified transport label.
        const metadata = await parseWebStream(stream, { size: input.totalSize }, {
            skipCovers: true, skipPostHeaders: true, duration: false,
            observer: event => { if (event.tag.type === 'format') format = { ...event.metadata.format }; },
        });
        format = metadata.format;
        complete = true;
    } catch {
        // A truncated tag/metadata block may follow an already decoded stream header.
    }
    if (!format) return undefined;
    const positive = (value: number | undefined) => value && Number.isFinite(value) && value > 0 ? value : undefined;
    const info: AudioQualityInfo = {
        codec: format.codec,
        sampleRate: positive(format.sampleRate),
        bitDepth: positive(format.bitsPerSample),
    };
    // music-metadata's CBR profile is based on frame headers, not the selected quality tier.
    if (format.codecProfile === 'CBR') info.bitrate = positive(format.bitrate);
    // FLAC's STREAMINFO gives duration. Only a successfully parsed full metadata chain
    // plus the complete Content-Range size lets the library subtract tag bytes correctly.
    if (complete && format.container === 'FLAC' && positive(input.totalSize) && positive(format.duration)) {
        info.bitrate = positive(format.bitrate);
    }
    if (!info.codec && !info.sampleRate && !info.bitDepth && !info.bitrate) return undefined;
    return { ...info, provenance: 'stream' };
}

if (typeof self !== 'undefined' && typeof document === 'undefined') {
    self.onmessage = event => {
        void parseAudioHeaderQuality(event.data).then(info => self.postMessage(info)).catch(() => self.postMessage(undefined));
    };
}
