# Project: Zing MP3 Explore Page Integration for Folia

## Architecture
- **Framework & Core**: React 19 + TypeScript + Electron 43 + Vite 8
- **State Management**: Zustand 5 (`useExploreFeedStore`, `usePlaybackStore`, `useAppViewStore`)
- **Styling**: Tailwind CSS v4, Lucide Icons, Framer Motion
- **Online Music Architecture**:
  - `src/services/onlineMusic/zingApi.ts`: Low-level Zing MP3 API client, HMAC-SHA512 signing, cookie/rqid session synthesis, `/api/v2/page/get/home` endpoint, stream link resolution.
  - `src/services/onlineMusic/zingExplore.ts`: Explore provider adapter implementing `OnlineExploreProvider`. Maps homepage banners, trending song suggestions, curated mood/genre playlists, and #zingchart realtime rankings into `ProviderExploreSection[]`.
  - `src/services/onlineMusic/zingProvider.ts`: Online music provider registry wiring `capabilities.explore = true`.
  - `src/components/app/home/explore/`: Reusable, provider-agnostic Explore UI (`ExploreSurface`, `ExploreSections`, `ExploreLead`, `ExploreRow`, `ExplorePlaying`, `exploreTilt`).
- **Audio Playback Flow**:
  - User clicks a track from Explore banner, suggestions, or chart &rarr; `usePlaybackQueueController.playSong()` &rarr; dispatches to `omni.getAudioSource(song, quality)` &rarr; `zingProvider.playback.getAudioSource` &rarr; Electron IPC or Web proxy bypass &rarr; 128kbps / 320kbps playback stream.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Banner Slider / Spotlight | Hero banner items with wide cover art for prominent songs, albums, and events | M1 | R1, survey |
| 2 | Trending Song Suggestions | Gợi ý bài hát theo xu hướng (New release / Trending songs) with play & queue actions | M1 | R1, survey |
| 3 | Mood & Genre Playlists | Curated playlist shelves categorized by theme/mood (Chill, Energy, V-Pop, etc.) | M1 | R1, survey |
| 4 | Realtime Chart Ranking | #zingchart / Realtime ranking section with rank badges (1..10) and peak movements | M1 | R1, survey |
| 5 | Zing MP3 Home API Client | Endpoint `/api/v2/page/get/home` integration with HMAC signing and fallback | M1 | R2, survey |
| 6 | Direct Audio Streaming | Playback of 128kbps / 320kbps streams with VIP detection and proxy headers | M2 | R2, survey |
| 7 | Explore UI Interactivity & Polish | Responsive layout, card hover tilt, audio-reactive beat badges, queue integration | M2 | R1, R2, survey |
| 8 | Unit & Integration Test Suite | Comprehensive unit tests in `test/unit/onlineMusic/` for Zing explore & playback | M3 | R3, survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Zing Home API & Feed Adapter | Implement `getZingHome()` in `zingApi.ts` and extend `zingExplore.ts` to transform 4 core sections (Banner, Suggestions, Mood playlists, Realtime chart) | none | DONE |
| M2 | Playback & UI Interaction Verification | Ensure seamless stream resolution (128k/320k), queue controller integration, and ExploreSurface rendering | M1 | DONE |
| M3 | Unit Testing & Regression Guard | Create `test/unit/onlineMusic/zingExplore.test.ts`, run full unit tests in `test/unit/onlineMusic/`, verify typecheck & lint | M2 | DONE |

## Interface Contracts
### `zingApi.ts` ↔ `zingExplore.ts`
- `getZingHome(page?: number): Promise<ZingHomeResponse>`
  - Returns raw Zing home payload containing sections: `banner`, `new-release`, `playlist`, `RTChart`.
- Fallbacks:
  - `getZingChartSongs()`: fallback for Realtime chart
  - `getZingTop100Albums()`: fallback for curated playlists
  - `getZingRadioStations()`: supplementary radio section
### `zingExplore.ts` ↔ `OnlineExploreProvider` (`src/types/onlineMusic.ts`)
- `zingExplore.getFeed(cursor?: string, listened?: UnifiedSong[]): Promise<ProviderExplorePage>`
  - Section 1: Banner / Spotlight (`wideCoverUrl`, 16:9 or 10:1 banner images)
  - Section 2: Gợi ý bài hát xu hướng (kind: `song`, subtitle, duration)
  - Section 3..N: Tuyển tập Playlist theo chủ đề (kind: `collection`, coverUrl, itemCount)
  - Section Last: #zingchart Bảng xếp hạng Realtime (kind: `song`, rank badges)

## Code Layout
- `src/services/onlineMusic/zingApi.ts` (API client & signing)
- `src/services/onlineMusic/zingExplore.ts` (Explore feed transformation)
- `src/services/onlineMusic/zingProvider.ts` (Provider registry capabilities)
- `src/components/app/home/explore/` (Explore surface components)
- `test/unit/onlineMusic/zingExplore.test.ts` (Explore unit tests)
- `test/unit/onlineMusic/zingProvider.test.ts` (Zing provider tests)
