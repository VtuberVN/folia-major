import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { appDatabase } from '../../../src/services/appDatabase';
import { clearBrowserCacheByCategory, getBrowserCacheUsageByCategory, getCacheTableName, putCacheEntry, readCacheEntry } from '../../../src/services/repositories/cacheRepository';

// test/unit/cache/audioQualityCategory.test.ts
// Quality measurements clear with audio and must not inflate the cached-song counter.
beforeEach(async () => { await Promise.all(['api_cache', 'metadata_cache', 'media_cache', 'user_cache'].map(name => appDatabase.table(name).clear())); });
it('routes audio quality metadata into a reachable cache category', async () => {
    const key = 'audioQuality_online:netease:42';
    expect(getCacheTableName(key)).toBe('metadata_cache');
    await putCacheEntry(key, { bitrate: 320000 });
    const usage = await getBrowserCacheUsageByCategory();
    expect(usage.media).toBeGreaterThan(0);
    expect(usage.mediaCount).toBe(0);
    await clearBrowserCacheByCategory('media');
    expect(await readCacheEntry(key)).toBeNull();
});
