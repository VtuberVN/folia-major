# E2E Test Suite Ready: Zing MP3 Explore for Folia

## Test Runner
- Command: `npx vitest run test/unit/onlineMusic/zing`
- Expected: all 42 tests pass with exit code 0

## Typecheck Runner
- Command: `npm run typecheck`
- Expected: `tsc --noEmit` exits with code 0

## Coverage Summary
| Tier | Count | Description |
|------|------:|-------------|
| 1. Feature Coverage | 24 | Complete section parsing (Banner, New Releases, Playlists, #zingchart) |
| 2. Boundary & Corner | 9 | Session expiration, null payloads, HTTP 500, timeouts, malformed items |
| 3. Cross-Feature | 5 | Audio routing (`omni.getAudioSource`), 128k/320k fallback, VIP refusal mapping |
| 4. Real-World Application | 4 | Canonical `zingExplore.test.ts` exercising end-to-end multi-tier feed |
| **Total** | **42** | **100% Passing in Vitest** |

## Feature Checklist
| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---------|:------:|:------:|:------:|:------:|
| Banner Slider / Spotlight | ✓ | ✓ | ✓ | ✓ |
| Trending Song Suggestions | ✓ | ✓ | ✓ | ✓ |
| Mood & Genre Playlists | ✓ | ✓ | ✓ | ✓ |
| Realtime Chart #zingchart | ✓ | ✓ | ✓ | ✓ |
| Zing Home API Client | ✓ | ✓ | ✓ | ✓ |
| Audio Stream Resolution (128k/320k) | ✓ | ✓ | ✓ | ✓ |
| VIP Error Handling | ✓ | ✓ | ✓ | ✓ |
