// src/utils/audioCacheRevision.ts
// Cache-file revisions stay attached to Blob objects without changing their serialized contents.
const revisions = new WeakMap<Blob, string>();
export const rememberAudioCacheRevision = (blob: Blob, revision: string): void => { revisions.set(blob, revision); };
export const getAudioCacheRevision = (blob: Blob): string | undefined => revisions.get(blob);
