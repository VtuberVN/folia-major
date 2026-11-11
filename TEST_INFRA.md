# E2E Test Infra: Zing MP3 Explore for Folia

## Test Philosophy
- Requirement-driven testing verifying:
  1. Explore page displays all 4 required sections (Banner, Suggestions, Mood playlists, Realtime chart).
  2. Dữ liệu lấy trực tiếp từ Zing MP3 service/provider có sẵn.
  3. Audio stream URLs (128kbps / 320kbps) và luồng phát nhạc hoạt động chính xác.
  4. Hệ thống kiểm thử tự động trong `test/unit/onlineMusic` pass 100% không có hồi quy.

## Feature Inventory & Test Coverage Matrix
| # | Feature | Source | Tier 1 (Unit) | Tier 2 (Boundaries/Errors) | Tier 3 (Cross-module) | Tier 4 (E2E / Flow) |
|---|---------|--------|:-------------:|:--------------------------:|:---------------------:|:-------------------:|
| 1 | Banner Slider / Spotlight | R1 | ✓ (Feed item check) | ✓ (Missing banner img fallback) | ✓ (Queueing from banner) | ✓ (Play from banner) |
| 2 | Trending Song Suggestions | R1 | ✓ (Song items count & meta) | ✓ (Empty/vip song items) | ✓ (Enqueue to PlaybackStore) | ✓ (Next song playback) |
| 3 | Mood & Genre Playlists | R1 | ✓ (Collection shelves) | ✓ (Network fail fallback) | ✓ (Open collection in GridView) | ✓ (Collection inspection) |
| 4 | Realtime Chart Ranking | R1 | ✓ (#zingchart ranking) | ✓ (Score/rank sort order) | ✓ (Play top 1, 2, 3) | ✓ (Full chart listen) |
| 5 | Zing Home API Client | R2 | ✓ (HMAC sig & params) | ✓ (Cookie renewal & error handling) | ✓ (Bridge IPC routing) | ✓ (Live/Mock fetch) |
| 6 | Audio Stream Resolution | R2 | ✓ (128k & 320k URLs) | ✓ (VIP -1150 error detection) | ✓ (Audio engine integration) | ✓ (Streaming audio) |

## Test Architecture
- **Unit & Integration Runner**: Vitest 4 (`npm test -- test/unit/onlineMusic/`)
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`)
- **Lint**: `npm run lint`

## Pass/Fail Verification Criteria
1. Vitest test suite `test/unit/onlineMusic/zingExplore.test.ts` passes with >= 10 assertions.
2. Vitest test suite `test/unit/onlineMusic/zingProvider.test.ts` passes all 22 existing tests.
3. TypeScript compiler exits with code 0 (`npm run typecheck`).
4. Working directory branch is `feat/zing-explore` with all commits staged/committed cleanly.
