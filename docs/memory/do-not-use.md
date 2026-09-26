# Do Not Use

## Raw engine error strings as user-facing copy

Do not let an unmapped engine/DOM error reach the user. Anything not matched by `formatRemotePlayError` falls through to `player.failedDetail` and renders raw English inside a localized string (`播放失败：Audio request failed (403)`). Add a branch to `src/lib/playError.ts` for every new error shape you throw, and keep already-localized copy passing through so re-formatting is a no-op.

## Reporting one playback failure on two channels

Do not call `onError` from a path that also rejects a promise the caller awaits. `playerStore` treats `onError` as final (it stops playback and closes the listening session), so a double-report kills the retry and logs a false near-zero-length play. The HTML element owns `onError`; the Web Audio path owns its promise rejection.

## Retaining a rejected load promise

Do not cache a rejected `loadPromise`. A retry can reuse a byte-identical URL, and handing back the settled rejection means no request is ever re-issued — the user sees the same error twice. Clear it on failure (guarded by identity) and let `setSource` reload an element that is in an error state.

## Letting desktop lyrics overflow the native window

Do not rely on a long desktop lyric overflowing the screen edge. The lyrics window is monitor-physical-width while text is laid out in logical px, so at raised display scaling the OS hard-clips the centred capsule and its rounded ends become a rectangle. Keep the fit-to-width shrink (`computeLyricFitScale`) and scale padding with the font so capsule width stays linear in the fit.

## `inset-0` + `m-auto` + `h-fit` for centred dialogs

Do not centre `DialogContent` with `fixed inset-0 m-auto h-fit`. With both insets at 0 the height comes from `height: fit-content` alone; if that does not resolve to the content height the used value falls back to `auto` and the box **stretches to the full containing block** — a dialog as tall as the whole window (observed on macOS, fine on Windows). Use `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100%-2rem)]` with `height: auto`.

## Variable-width trailing columns in TrackRow

Do not use `max-w-*` or intrinsic width for `TrackRow`'s platform chip or `stat` column. The name column is `flex-1`, so anything after it is right-anchored and a variable width drags its left neighbours out of line between rows. Use the fixed `w-20` platform slot and the `statWidth` prop.

## Re-resolving the current track without `force`

Do not call `play(song, quality)` to change the quality of the track that is already attached. The same-song short-circuit treats it as redundant and returns without doing anything, and `togglePlay` sets `playPending` first, which that short-circuit also reads as "busy" — so the request is dropped and every retry repeats it. Pass `{ force: true }`, which also skips the CUE seek-in-place branch. This applies to any deliberate reload of the current track, including the expired-URL retry in `play()`'s catch. Do not "fix" this by deleting the `playPending` check: that check is what prevents a double-press from starting two loads.

## Removing focus rings globally

Do not add a global `:focus-visible { outline: none }` or a blanket `outline-none` to suppress the menu focus ring. Focus rings are the only affordance keyboard users get, and the reported annoyance comes from a *modality mismatch*: Radix restores focus to a menu trigger on close, which after a mouse click paints a ring the user did not ask for. Fix it where the modality is known (`DropdownMenuContent`'s `onCloseAutoFocus` plus `src/lib/focusModality.ts`) so keyboard closes keep the ring. Also do not assume `focus({ focusVisible: false })` clears an existing ring — it does not; `focus()` on an already-focused element is a no-op, so blur first.

## Resetting the cover/lyrics when only the quality changed

Do not clear `currentPicUrl`, `lyricLines` or `duration` when `play()` is re-attaching the source for the track that is already current. Guard those resets behind `sameSongReload` (`force && current?.id === song.id`), and skip the trailing `_loadPic`/`_loadLyric` refetch. A quality switch changes only the audio source; resetting the rest blanked the cover (because `song.meta.picUrl` is usually absent while `currentPicUrl` holds the resolved URL) and made `_loadPic` repaint a different URL — a visible flash. Do not clear the `reloadingCurrentTrack` flag on the success path only; a failed reload must clear it too, or the cover stays undimmed forever. The seek bar has the same trap: `ProgressSlider` must not reset its displayed time to 0 while `reloadingCurrentTrack` is set, because the re-attached element really does report 0:00 before the store seeks back.

## Turning a global shortcut off by clearing its binding

Do not implement "disable this global shortcut" by setting the accelerator to `""`. That destroys the binding, so re-enabling forces the user to re-record the combo, and the settings row can no longer show what was released. Keep the binding and track the action in `disabledGlobalShortcuts` instead. Do not make that list sync across devices: the clash comes from software installed on one machine.

Also do not check the disabled list only where the OS hotkeys are registered. The global map is matched by the in-app keydown handler as well, so a switch consulted in `syncGlobalShortcuts` alone leaves the combo firing whenever the window has focus — the user turns it off and it still works. Both paths must read the same helper (`activeGlobalShortcuts` for the OS, `inAppShortcutBindings` for the window), and the in-app list must keep every local binding ahead of any global one so a combo bound in both slots still resolves to the local action.



## Letting a manual downgrade be silently re-upgraded

Do not let the resume-time upgrade in `togglePlay` override a quality the user chose deliberately for one song. It reads the global `settings.playQuality`, so a per-song downgrade would be undone on the next pause/resume. A per-song choice must be distinguishable from the global default before that path is touched.

## Letting the disk cache override an explicit quality choice

Do not reuse `findCachedMeetingPreferred` for a user's explicit per-song quality. It walks the ladder from the *best* tier down, so choosing 128K while a FLAC is cached plays the FLAC and shows FLAC on the badge — the switch looks broken. That "cache is a floor, not a ceiling" rule is correct for the global default and wrong for an explicit choice.

## Restarting playback without re-arming the ended latch

Do not add a way to start or restart a track that skips the `endedSent` reset in `AudioPlayer.play()` / `seek()`. `endedSent` suppresses a second `emitEnded` for the same pass, so any restart that does not clear it reports one end and then goes silent. This is easy to miss because most restarts re-attach a source (`setSource` / `setClip` / `startWebPlayback` all clear it) — the two that do not are repeat-one (`seek(0)` + `play()`) and a ONE-SONG queue wrapping in repeat-list/shuffle, where `next()` lands on the same index and only `play()` runs. It also only reproduces on the HTML `<audio>` backend; Web Audio hides it, so testing one backend is not enough.

## Handing a song to every enabled source script

Do not resolve a song's play URL, lyric or cover by asking every enabled script. Filter by the platform the script declares in `sources` (and by the action within that platform). A script asked about a platform it does not serve cannot resolve the id it was given, and some fall back to searching their OWN service by track name — which returns a different recording of the same title, so the player bar shows the chosen song while a different artist plays. A script declaring no `sources` at all must still be asked, and if the platform filter leaves nothing to ask the unfiltered list is used, so a lone under-declaring script keeps working. Keep the platform and action filters separate: a combined filter plus that fallback silently re-admits scripts that explicitly omitted the action.

## Measuring a lyric from a parent layout effect

Do not measure the desktop lyric's width from a parent layout effect keyed on the displayed line. `LyricTransition` mounts the incoming layer from its own layout effect, and React runs layout effects child-first, so the parent's runs while the DOM still holds the OUTGOING line — the fit is then computed from the wrong text, a long line is never shrunk, and the native window clips it into a rectangle. Measure from `onLayerMounted`, which fires once the new layer is committed. Do not key that callback on `transitionKey` either: the effect that calls `setLayers` does not have its update flushed before the rest of the commit's layout effects, so the callback would fire while the old layer is still the only one mounted. Depend on `layers`, and check `isConnected`.

## Storing a per-song quality only on the queue item

Do not treat `QueueItem.qualityOverride` as the storage for a per-song choice. The queue is replaced constantly — "play all" on another playlist, a shuffle, a restart — so a choice kept only there is lost for no reason the user can see. The authoritative copy is `src/lib/songQualityPrefs.ts`; the queue field is a projection re-applied by `hydrateQualityOverrides` at every point a queue is built or restored. For the same reason, do not add the store to `configIO`'s `DB_FILES`: being absent is what keeps it out of sync exports and makes a config import unable to wipe it.

Do not add a user-facing limit for the per-song quality store. An entry is ~113 bytes, so the whole file is ~224 KB even at its 2,000-entry cap — a control for it would be a question the user cannot answer about a file that cannot matter. It is a fixed constant with automatic LRU eviction; the UI shows the count and a clear, nothing more.

## Storing a per-song override that equals the default

Do not persist a per-song quality that happens to equal the current default, and do not defer that comparison to read time. A stored override outlives a later change to the default, so a track set back to 320k would stay pinned to 320k after the user switched their default to FLAC — unlike every other song. Normalise at the moment of the choice (`nextQualityOverride`) so "set it back to the default" means "never touched".

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

Do not write literal durations or easings into icon buttons (`duration-150`, `cubic-bezier(...)`, `transition: transform 150ms`). Read `--motion-fast` / `--motion-base` / `--motion-slow` and `--ease-spring-*` from `:root`, or the `SPRING_*` / `ICON_SWAP_*` presets in `src/lib/motion.ts`, rather than hand-tuning a bezier. Also do not put `transform` on the same element as a `motion/react` animated `scale` — motion writes an inline transform that beats the CSS animation, so the effect silently never plays; nest instead (`IconBurst`).

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



