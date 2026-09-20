# Do Not Use

## `inset-0` + `m-auto` + `h-fit` for centred dialogs

Do not centre `DialogContent` with `fixed inset-0 m-auto h-fit`. With both insets at 0 the height comes from `height: fit-content` alone; if that does not resolve to the content height the used value falls back to `auto` and the box **stretches to the full containing block** — a dialog as tall as the whole window (observed on macOS, fine on Windows). Use `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100%-2rem)]` with `height: auto`.

## Variable-width trailing columns in TrackRow

Do not use `max-w-*` or intrinsic width for `TrackRow`'s platform chip or `stat` column. The name column is `flex-1`, so anything after it is right-anchored and a variable width drags its left neighbours out of line between rows. Use the fixed `w-20` platform slot and the `statWidth` prop.

## Outset focus ring on Input

Do not give `Input` an outset focus ring (`focus-visible:ring-offset-2` with a non-inset ring). It overhangs 4px on every side and gets clipped by the fixed-height `overflow-hidden` toolbars that host the search boxes. Use `ring-2 ring-inset`.

## Splitting artists on / or &

Do not add `/` or `&` to the artist separators in `splitArtists`. Real names contain them (AC/DC, Simon & Garfunkel), so splitting would invent artists that do not exist. Only `、;；,，` are separators — `、` is what every platform adapter's `formatSingers` emits.

## Song cover as an artist image

Do not show a song's cover next to an artist in the 足迹 artist ranking. An artist has no artwork of its own, and a borrowed track cover changes with whichever song played last. Use the monogram.

## Pretty-printed listen log

Do not write `listenLog.json` with `writeData` (2-space JSON). Use `writeDataCompact`. The file is machine-only and holds thousands of song snapshots, where indentation roughly doubles the bytes (1.18 MB → 2.18 MB at the current cap; it reached 8.7 MB under the old 8,000-event cap).

## Adjacent-only recents dedupe

Do not dedupe "recently played" by skipping only consecutive repeats. Collapse by song id, keeping the newest play, so an interleaved repeat (A B A B …) does not fill the list with two songs.

## Motion on the window controls

Do not add `icon-button-motion`, a hover scale, or any transition to the minimize / maximize / close buttons in `WindowControls.tsx`. They are OS chrome; motion there reads as the window wobbling. Flat hover color only.

## Hardcoded durations or easings in icon motion

Do not write literal durations or easings into icon buttons (`duration-150`, `cubic-bezier(...)`, `transition: transform 150ms`). Read `--motion-fast` / `--motion-base` / `--motion-slow` and `--ease-spring-*` from `:root`, or the `SPRING_*` / `ICON_SWAP_*` presets in `src/lib/motion.ts`. Regenerate the spring curves with `node scripts/spring-easings.mjs` rather than hand-tuning a bezier. Also do not put `transform` on the same element as a `motion/react` animated `scale` — motion writes an inline transform that beats the CSS animation, so the effect silently never plays; nest instead (`IconBurst`).

## Lyrics rail particles

Do not add canvas sparks, prism streaks, or a theme-color playhead bloom on the lyrics-page progress rail. Use the player-bar ProgressSlider flush to the window bottom. Keep the thumb the same height as the track; do not lift the rail to unclip a larger thumb.

## Play-time implicit local match

Do not search cover, artist, or lyrics online when the user plays an unmatched local file. Match on import and Match online stay explicit. Sidecar `.lrc` and embedded tags may still load from disk.

## Source-script obfuscation scanning

Do not block imports based on obfuscation heuristics. Legitimate lx sources are often packed and trip `JS.Obfuscated`-style rules.

## Source script URL import

Do not add link/URL import for source scripts. Import is file-only (picker and drag-drop).

## Main-window source execution fallback

Do not re-run a failed Worker source with `new Function` on the main WebView.

## Sibling download cover temp files

Do not write `*.museek-cover.tmp` next to downloaded audio, and do not stage covers through frontend `tempDir()` + plugin-fs. Frontend remove may lack scope, and a failed temp write was reported as a tag-write failure. Send cover bytes in the embed command instead.

## MP3/FLAC-only download tag writing

Do not refuse tag embedding just because the file is not MPEG or FLAC. lx-music sources often return M4A (`ftyp`) for 320k and even "FLAC" requests; those files play, but ID3-only writing always fails.

## Lofty work files with a `.tmp` extension

Do not copy audio to `*.tmp` before `lofty::read_from_path`. Probe::open() uses only the path extension, so `.tmp` becomes "failed to parse file" even for a valid MP3. Keep the original audio extension, or call `guess_file_type()` from content.

## Tag a file plugin-fs just wrote

Do not let Rust `std::fs` open or overwrite a file that plugin-fs just wrote — AppData staging failed the same way as Downloads (Windows os error 5; macOS can hit the same lock or TCC race). Tag in a lofty memory cursor and write the user file once with plugin-fs.

## Win/Super as a shortcut modifier

Do not accept Win/Super in user shortcuts. Cross-OS sync only maps Ctrl ↔ Command; Win has no counterpart in the allowed Ctrl/Alt/Shift set.

## Measured traffic-light spacing after sleep

Do not compute macOS Overlay traffic-light gaps from live button frames. After display sleep AppKit can reset only some buttons, and a measured gap walks the cluster to the right. Use a fixed 20pt origin-to-origin spacing.

## Tauri manage() for AppKit observers

Do not store `ProtocolObject<dyn NSObjectProtocol>` in `app.manage()`. It is !Send/!Sync and fails the macOS CI. Keep wake observers alive with `mem::forget`.

## objc2 extern notification statics

Do not read `NSWorkspaceDidWakeNotification` (and similar `extern static`s) from safe Rust. rustc reports E0133. Use `ns_string!("NSWorkspaceDidWakeNotification")` with the Apple constant name.

## Lyric timeline offset controls

Do not add per-song lyric delay/advance (±0.5s) buttons or cache. Switch to another platform’s lyrics from the lyrics-page toolbar instead. Do not put offsets in settings.json.

## Synced UI font families

Do not put UI or desktop-lyrics font family names in settings.json or config sync. Windows and macOS do not share the same family names; keep them in device-local fonts.json.

## Bundled CJK webfonts for UI chrome

Do not ship Noto Serif SC (or similar CJK webfonts) as the default UI face. Follow the system font stack, and let users pick from fonts already installed on the device.

## Category filter manage submenu

Do not hide rename/delete behind a “管理分类” submenu. Put trailing pencil/trash icons on each custom category row in the All Categories dropdown.

## Estimated line-LRC karaoke

Do not invent per-word timings from line-timed lyrics. Karaoke fill is native timestamps only; plain lyrics use the default whole-line treatment.

## Auto-select on category create or rename

Do not switch the All Categories filter (or assign tracks) just because a category was created from that menu, and do not treat rename/delete icon clicks as selecting the row. Pass `openCreate(true)` only from “move to category”. Do not pass `openCreate` itself as an `onClick` handler — the click event is truthy.



