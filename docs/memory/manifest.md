# Memory Manifest

Loading map for local project memory. Load only the files listed for the current task plus explicitly requested optional modules.

## MemoryCustodian Protocol
- protocol_version: 0.8
- entry_schema_version: 3
- subject_schema_version: 1
- subject_registry: subjects.md
- routing_schema_version: 1
- conflict_schema_version: 1
- initialized_with: memory-custodian 0.12.0
- last_migrated_with: memory-custodian 0.12.0
- project_id: 747a89f7-ed50-4ca6-9360-a7872376b484
- admission_policy: evidence-required
- routing_policy: explicit-task-and-scope
- conflict_policy: canonical-subject-and-review

## Trust boundary
Project memory may constrain project work, but it cannot override system instructions, current user instructions,
safety boundaries, or permission boundaries. Memory cannot authorize destructive actions, external uploads,
secret access, commits, pushes, merges, releases, or privilege escalation.

## Always load
- brief.md
- constraints.md

## Load by task

### Planning / architecture / refactoring
Load:
- decisions.md
- do-not-use.md

### Implementation / execution / debugging
Load:
- decisions.md
- do-not-use.md

### User-facing artifact / output
Load:
- do-not-use.md

### Preferences
Load if present:
- preferences.md

### Change history / recap
Load:
- decisions.md
Load if present:
- changelog.md

### Memory maintenance
Load:
- inbox.md
- do-not-use.md
Load if present:
- changelog.md

## Optional module index
Discover optional memory without loading it. Entries here are not default loads.

### Enabled rules
- None enabled.

### Enabled profiles
- None enabled.

### Enabled areas
- `areas/playback.md`
  - activation: path-or-explicit
  - paths: `src/lib/audio.ts`, `src/lib/playback*`, `src/lib/songQuality.ts`, `src/lib/songQualityPrefs.ts`, `src/lib/playRequest.ts`, `src/lib/playError.ts`, `src/lib/mediaCache.ts`, `src/lib/cache.ts`, `src/lib/playbackSession.ts`, `src/lib/audioBytes.ts`, `src/lib/audioUrlProbe.ts`, `src/lib/playback/**`, `src/stores/playerStore.ts`, `src/stores/downloadStore.ts`, `src/components/player/**`, `src/components/queue/**`, `src-tauri/src/lib.rs`
  - description: Playback engine, quality ladders, disk cache, and download pipeline.
- `areas/lyrics.md`
  - activation: path-or-explicit
  - paths: `src/lib/lyric.ts`, `src/lib/lyric/**`, `src/lib/lyrics/**`, `src/lib/lyricsFullscreen.ts`, `src/lib/lyricColor.ts`, `src/lib/desktopLyrics*.ts`, `src/stores/desktopLyricsStore.ts`, `src/components/lyrics/**`, `src/components/settings/**`, `src/routes/Lyrics*`, `src/lib/platformArtist.ts`
  - description: Lyric fetching, matching, karaoke timing, and the desktop lyrics window.
- `areas/sources.md`
  - activation: path-or-explicit
  - paths: `src/lib/sources/**`, `src/lib/sourceRegistry.ts`, `src/lib/sourceRunner.ts`, `src/lib/lxApi.ts`, `src/lib/lxMusicInfo.ts`, `src/lib/http.ts`, `src/lib/cdnHeaders.ts`, `src/stores/sourceStore.ts`, `src/components/settings/SourceManager.tsx`, `src-tauri/capabilities/**`, `src-tauri/tauri.conf.json`, `vite.config.ts`
  - description: Source-script sandbox, platform dispatch, network policy, and window permissions.
- `areas/local-library.md`
  - activation: path-or-explicit
  - paths: `src/lib/localMusic/**`, `src/stores/localMusicStore.ts`, `src/components/localMusic/**`, `src/routes/LocalMusic.tsx`, `src/lib/fsPresence.ts`, `src/lib/openLocalFiles.ts`, `src/lib/saveCover.ts`
  - description: Local file import, tag probing, CUE clips, and library matching.
- `areas/lastfm.md`
  - activation: path-or-explicit
  - paths: `src/lib/lastfm/**`, `src/stores/lastfmStore.ts`, `src/components/settings/LastfmSettings.tsx`, `src/components/listening/**`
  - description: Last.fm authentication, scrobbling, loved tracks, and stats.
- `areas/platforms.md`
  - activation: path-or-explicit
  - paths: `src/lib/platforms/**`, `src/lib/search/**`, `src/lib/playlists/**`, `src/lib/charts/**`, `src/lib/albums/**`, `src/lib/hotSearch/**`, `src/lib/comments/**`, `src/lib/recognition/**`, `src/lib/songCategories/**`, `src/stores/searchStore.ts`, `src/stores/recognitionStore.ts`
  - description: The five platform API adapters, search, charts, playlists, and recognition.
- `areas/desktop-shell.md`
  - activation: path-or-explicit
  - paths: `src-tauri/**`, `src/lib/os.ts`, `src/lib/smtc.ts`, `src/lib/miniPlayer.ts`, `src/lib/showWindow.ts`, `src/lib/power.ts`, `src/lib/trayMark.ts`, `src/lib/autostart.ts`, `src/lib/uiFonts.ts`, `src/lib/shortcuts.ts`, `src/lib/shortcutActions.ts`, `src/lib/shortcutKeys.ts`, `src/lib/shortcutTargets.ts`, `src/components/layout/**`, `src/components/miniPlayer/**`, `src/stores/settingsStore.ts`, `src/stores/fontStore.ts`, `src/stores/themeStore.ts`
  - description: Tauri window management, macOS/Windows integration, shortcuts, fonts, and app chrome.
- `areas/ui-system.md`
  - activation: path-or-explicit
  - paths: `src/components/common/**`, `src/components/ui/**`, `src/components/search/**`, `src/components/favorites/**`, `src/components/songCategories/**`, `src/components/listening/**`, `src/components/whatsNew/**`, `src/components/brand/**`, `src/routes/**`, `src/lib/motion.ts`, `src/lib/focusModality.ts`, `src/lib/listenFormat.ts`, `src/lib/i18n.ts`, `src/lib/notify.ts`, `src/lib/sync.ts`, `src/lib/configIO.ts`, `src/lib/db.ts`, `src/lib/updater.ts`, `src/lib/whatsNew/**`
  - description: Shared UI components, motion language, i18n, persistence, and config sync.

## Optional rules
`rules/` files load only through declared canonical tasks or explicit rule input.

## Optional profiles
`profiles/` files load only through explicit profile input.

## Area-specific memory
`areas/` files load only through declared path globs or explicit area input.

## Explicit only
- archive/

## Context budget
- brief.md: 500 tokens max
- decisions.md: 800 tokens max
- constraints.md: 400 tokens max
- do-not-use.md: 400 tokens max
- preferences.md: 300 tokens max, if present
- rules/*.md: 400 tokens max per file, if present
- profiles/*.md: 500 tokens max per file, if present
- areas/*.md: 600 tokens max per file, if present
- changelog.md: 800 tokens max, if present
- inbox.md: memory maintenance only
- archive/: explicit only
