# Do Not Use

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



