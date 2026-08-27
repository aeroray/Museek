# Confirmed Decisions

## 2026-08-27 - Fill local cover on play

Decision:
Playing a local file fills missing cover, NetEase id, and catalog title in the background after tags. Filename lock still hides the catalog title. Import still does not network unless Match on import is on.

Reason:
Artwork and cross-platform lyric search need catalog identity; waiting for Match online left empty covers and `Artist - Title` filenames unmatched.

## 2026-08-27 - Native karaoke only; prefer word-by-word sources

Decision:
Karaoke fill uses platform-native word timestamps only. Plain LRC keeps the default whole-line treatment. On play, local sidecar or embedded lyrics win; otherwise search wy/kw/kg/tx/mg and stop at the first word-by-word hit. Online songs try their own platform first, then the others for word-by-word, else keep that platform’s plain lyric.

Reason:
Estimated karaoke looked like word-by-word but was not. Users want real YRC/QRC/KRC or a normal line lyric, and a word-timed source when playing.

## 2026-08-26 - Local import pipeline

Superseded in part 2026-08-27: play may fill missing cover, NetEase id, and catalog title. Import still has no network; the filename checkbox is title lock only.

Decision:
Import enqueues by path with `nameMode: filename`. Background `readLocalTags` fills cover, duration, lyrics, artist, and album with no network. The filename checkbox only changes the displayed title. Match online / Match on import store the catalog title (`catalogName`) and fill gaps; unchecking shows ID3 or that catalog title.

Reason:
Mixing tags and NetEase in one refresh made a checkbox or play look like matching, and locking the title used to discard the catalog name.

## 2026-08-24 - Windows window show on the UI thread

Decision:
Never call main-window show/hide/focus from a background thread on Windows. Marshal through `run_on_main_thread`, and restore the window on taskbar focus if it is hidden or minimized.

Reason:
Tao window APIs are event-loop-bound. A delayed worker-thread `show()` can hitch dragging and crash a few seconds after launch while the process and taskbar toolbar stay alive.

## 2026-08-23 - Dual in-app and global shortcuts

Decision:
Each playback action has two optional bindings that both fire: a simple in-app key (main window) and an OS-global hotkey (Ctrl/⌘, Alt, or F1–F12). In-app defaults are single keys (Space, arrows, P/N, M, L, D, K, U) that do not collide with each other or with global combos. Empty unsets a slot. Do not register in-app keys with the OS.

Reason:
Users want a short key in the player and a separate system hotkey when minimized, without toggling a single binding’s scope.

## 2026-08-22 - Source import is file-only

Decision:
Source management imports lx-music-compatible scripts from local `.js` files only (picker and drag-drop). URL import UI and `importScriptFromUrl` are removed. Origin badges still show historical link imports.

Reason:
Link import is no longer supported; files are the only inspectable import path.

## 2026-08-21 - Song comments on the lyrics page

Decision:
Read-only song comments for wy/kw/kg/tx/mg via each platform's public comment API (not source scripts). Toggle from the lyrics-page right toolbar. Lyrics-only and comments are exclusive: solo shows only lyrics; opening comments turns solo off. Cover hides in either mode. Keep the comment dock at 22rem. Local files stay empty.

Reason:
Users asked to read comments for the playing song without leaving the lyrics view or covering the spinning cover.

## 2026-08-21 - Desktop lyrics two-line and custom color

Decision:
Optional two-line desktop lyrics: translation when present, otherwise the next sung line, smaller than the current line. Optional `#rrggbb` color in synced settings; null follows `--primary`. Use the OS color picker, not a bundled color-picker kit.

Reason:
Users want upcoming/translated context on the overlay, and a color that stays readable on their wallpaper independent of the app theme.

## macOS Dock tile playback progress

Decision:
Reuse the existing throttled native media timeline and Tauri/Tao's built-in macOS Dock progress implementation. Send a 0-100 progress value through `set_progress_bar`, preserve the bar while paused, and hide it when there is no valid duration or playback reaches the end.

Reason:
Tao already owns a custom `NSProgressIndicator` subclass that draws and refreshes the Dock tile correctly. Reusing it avoids a second AppKit view hierarchy and keeps the progress clock aligned with the existing media controls.

## macOS Overlay traffic-light ownership

Decision:
Omit `trafficLightPosition` from Tauri's macOS window config when using the fixed-position traffic-light module. The module owns the button coordinates and wake refresh; Tao must not remeasure the live close-to-miniaturize gap from `drawRect:`.

Reason:
After display sleep, AppKit can restore only part of the title-bar button row. Tao's live-gap calculation can then spread the wrong spacing across all three buttons and override the fixed placement.

## 2026-08-17 - Device-local UI fonts, system default

Decision:
Default the app and desktop lyrics to the OS UI font stack. Let users pick installed families; desktop lyrics follows the app font unless overridden. Store choices in device-local fonts.json. Do not bundle webfonts or sync family names.

Reason:
Bundled Noto Serif SC added ~4.5 MB, and font names are not portable across Windows and macOS.

## 2026-08-17 - Publish SMTC playback timeline

Decision:
Keep native souvlaki SMTC as the only media-session owner, and publish duration plus throttled audio-clock position (not lyric offset) so other local lyrics apps can follow Museek.

Reason:
GSMTC consumers need EndTime and Position; a metadata-only card cannot sync lyrics.

## 2026-08-17 - Per-song lyric timeline offset in local cache

Superseded 2026-08-27: delay/advance controls are gone. The lyrics page lists each platform’s lyrics (word-by-word badge vs plain) so the user can switch instead of nudging time.

Decision:
Store lyric delay/advance as a per-song cache file (0.5s steps, ±10s). Apply it on the lyric clock only. Do not sync it; clearing the media cache drops it.

Reason:
Some LRC/YRC timings drift from the audio; a local nudge is enough, and it should die with that song's cache.

## 2026-08-17 - Show live shortcut hints on matching controls

Decision:
Hover tooltips on playback controls read the current synced shortcut map (formatted via `formatShortcut`). Do not hardcode accelerators in button titles.

Reason:
Users forget global hotkeys; the binding can change in Settings → Shortcuts.

## 2026-08-17 - Reapply macOS traffic lights after sleep

Decision:
Pin Overlay traffic-light spacing to 20pt and reapply the configured inset on display wake, scale-factor change, focus, resize, and shadow refresh. Do not measure spacing from live button frames.

Reason:
After sleep AppKit can reset only some buttons; Tao/Wry then re-inset from an inflated gap, so the lights walk right.

## 2026-08-16 - Register every playback shortcut as a global hotkey

Decision:
Superseded 2026-08-23: each action has a separate in-app key and an OS-global hotkey. Store accelerators as `CommandOrControl` (Win Ctrl ↔ Mac ⌘). Global still allows only Ctrl/⌘, Alt/⌥, Shift, plus F1–F12; reject Win/Super. Defaults stay Ctrl/⌘+Shift globally, plus simple single-key in-app bindings. Wheel font-size stays window-local.

Reason:
Minimized Museek cannot see WebView keydown; global registration keeps transport available, and a platform-neutral accelerator avoids per-OS copies in sync.

## 2026-08-16 - Treat audio cache as a floor, not a ceiling

Decision:
If the disk cache is below the preferred play quality, try current sources for higher tiers once. On miss, play the cached file and skip retries until the enabled source list changes. Do not add a per-song cache-clear control.

Reason:
A fallback 128k cache was blocking upgrades after the user switched sources; the retry must stay invisible.

## 2026-08-16 - Customizable startup page in synced settings

Decision:
Keep `startupPage` in `settings.json` (default search). Redirect `/` only after settings hydrate. Include it in config sync; it is not device-local.

Reason:
A hardcoded index navigate to `/search` races settings load and cannot honor a user or synced choice.

## 2026-08-16 - Sandbox source scripts in Workers with a URL policy

Decision:
Run each imported lx source in a Dedicated Worker. `lx.request` is the only network path; the main thread allows http(s) only and denies private nets plus gambling/miner-like hosts. Do not fall back to main-window execution.

Reason:
Workers keep scripts off the UI and Tauri file APIs; the host filter blocks junk requests like niuma666bet.buzz without enumerating music CDNs.

## 2026-08-15 - Restore the play queue without blocking startup

Decision:
Persist the play queue, current song, play mode, and position in device-local `playbackSession.json`. On launch, restore that UI immediately; attach a cached or local file and seek only when it is already on disk. If there is no cache, keep audio position at 0 and fetch audio only when the user presses play. Reload lyrics in the background (disk cache first, then network) so the restored song has lyrics without waiting for play.

Reason:
Users want to resume quickly, but resolving a remote audio URL on startup would delay the first frame. Lyrics are small and still needed for the top bar and lyrics page.

## 2026-08-08 - Delegate playback to imported source scripts

Decision:
Museek obtains playback data from user-imported lx-music-compatible source scripts rather than bundling music sources.
Reason:
This preserves the app's aggregator role and keeps source ownership with the user.

## 2026-08-08 - Keep platform entry points thin

Decision:
Platform-specific agent files point to `docs/memory/manifest.md` and `brief.md` instead of copying project memory.
Reason:
A single routing authority keeps every agent aligned and context small.

## 2026-08-08 - Keep desktop lyrics on a separate render-only window

Decision:
The desktop lyrics feature uses a static hidden Tauri `lyrics` window with a lightweight React entry. The main window remains the owner of audio, Zustand state, and the playback timeline, and sends lyric snapshots through Tauri events.
Reason:
Tauri windows do not share JavaScript state, and reloading the full player App would duplicate playback, shortcuts, media controls, and close handling.

## 2026-08-08 - Keep desktop lyrics lock mode recoverable

Decision:
Desktop lyrics can be locked so the window cannot be dragged or respond to pointer effects. Ctrl/⌘ + Shift + L remains the quick lock/unlock path while the window is visible. Opening uses interactive mode by default, or locked mode when the auto-lock setting is enabled. Window geometry stays device-local.
Reason:
Users can choose a completely non-interactive overlay while retaining a deliberate keyboard recovery path.

## 2026-08-08 - Keep desktop lyrics visually unobtrusive

Decision:
The desktop lyrics window is transparent at rest and shows a compact rounded surface on hover while interactive. It displays only themed lyric text; close, font-size, and lock controls fade in on hover or focus while interactive, while locked mode has no pointer effects. The main player owns visibility and closing.
Reason:
Desktop lyrics should sit over the user's workspace without becoming another framed panel, while locked mode must remain intentionally non-interactive.

## 2026-08-08 - Keep desktop lyric as a single readable active line

Decision:
Display only the active lyric line in the desktop lyrics window. Use AMLL's word-level presentation for progressive karaoke highlighting instead of showing a second context line.
Reason:
The desktop overlay is intentionally compact, and the user prefers one focused line. AMLL owns the text animation while Museek keeps the line selection and playback clock authoritative.

## 2026-08-08 - Synchronize desktop lyric lines from the main window

Decision:
Treat main-window snapshots as the source of truth for the active lyric line and render stable text in the visible lyrics window without a local playback clock.
Reason:
The lyrics window only needs line changes now, so an independent animation clock would add work without improving readability.

## 2026-08-08 - Scale desktop lyrics window with font size

Decision:
Use 720x160 as the 1.0 font-scale baseline, start new users at 1.15x, and resize the whole lyrics window with font changes within 612x136 and 1800x400 bounds. Keep the minimum scale at 0.85x and the maximum at 2.5x.
Reason:
The text and its transparent window must grow together so larger lyrics remain readable without overflowing.

## 2026-08-08 - Place first desktop lyrics window above the system dock

Decision:
When no desktop lyrics geometry has been saved, place the window at the bottom center of the active monitor work area with a 24px safety gap. Restore saved geometry unchanged.
Reason:
The initial position should be easy to discover without covering the macOS Dock or Windows taskbar, while user positioning remains persistent.

## 2026-08-09 - Keep desktop lyric contrast independent from the desktop background

Decision:
Keep the active lyric fill tied to the selected theme color and use a transparent QQ Music-style floating layout: a slightly smaller following line, a thin near-black text edge, and a short shadow. Keep the rounded surface only for the transient controls toolbar while the lyrics themselves remain unframed.
Reason:
Desktop lyrics sit above arbitrary desktop content, so the text needs a restrained border instead of a bright halo. The transparent text-first treatment preserves the familiar desktop-player look without making the window opaque at rest.

## 2026-08-09 - Separate the desktop lyric stage from its interaction surface

Decision:
Keep the desktop lyric window as a transparent two-line stage with a sans-serif system font, a stronger active-line hierarchy, and a centered toolbar that appears only during interactive hover or focus. Derive the lyric edge from the active foreground token, reducing it in dark mode instead of hardcoding a black outline.
Reason:
The previous treatment made the lyrics read like a small serif title with a fixed sticker-like border, while the controls competed as an unrelated corner card. A theme-aware edge preserves readability over changing desktop content without reintroducing a bright halo, and the centered transient toolbar keeps controls discoverable without becoming part of the resting lyric composition.

## 2026-08-09 - Persist desktop lyric alignment locally

Decision:
Add left, center, and right alignment controls to the desktop lyrics toolbar. Apply the selected alignment to the active and following lyric lines together, default to centered text, and persist the choice in the lyrics window's local storage without adding it to the main-window event protocol.
Reason:
Alignment is a presentation preference owned by the render-only lyrics window. Keeping it local avoids expanding the playback snapshot contract while allowing the user's preferred layout to survive closing and reopening desktop lyrics.

## 2026-08-09 - Keep global shortcuts aligned with disabled controls

Decision:
Global playback shortcuts must use the same availability conditions as their UI controls: transport actions respect idle/loading state, seeking respects idle/loading/error and current-song state, desktop lyrics respects current-song or visible-window state, and mini-player respects a non-empty queue. The lock recovery shortcut remains available while the desktop lyrics window is visible, including locked mode.
Reason:
A disabled control establishes that the corresponding action is unavailable, so a global key path should not bypass that contract. The lock shortcut is intentionally different because locked mode hides the toolbar and needs a keyboard recovery path.

## 2026-08-09 - Let desktop lyric content use the scaled window width

Decision:
Initialize a new desktop lyrics window from the current font scale, scale its persisted window dimensions when the font changes, and let the lyric content column use the full available width instead of capping it at 960px.
Reason:
Larger lyric text needs a proportionally wider reading area. A fixed content cap could ellipsize otherwise valid lines even after the transparent window had grown.

## 2026-08-09 - Require a current song to enter mini-player mode

Decision:
The main mini-player button, the `P` shortcut, and the mini-player entry functions are available only when `currentSong` exists. A non-empty queue alone is not sufficient.
Reason:
Sequential playback can clear `currentSong` while retaining the queue after the final track ends. The mini player should be disabled whenever there is no active playback content instead of opening an empty bar.

## 2026-08-09 - Use AMLL React for desktop lyrics rendering

Decision:
Replace the hand-authored two-line desktop lyric renderer with `@applemusic-like-lyrics/react` `LyricPlayer` and its `@applemusic-like-lyrics/core/style.css`. Pass only the active Museek lyric line, split line-timed LRC text into timed words or characters across its line interval, preserve the existing Tauri window controls and alignment toolbar, and stream the audio clock only while the desktop lyrics window is visible.
Reason:
AMLL supplies the Apple Music-like lyric layout, spring movement, blur, scale, and timed word rendering that the local renderer was recreating incompletely. Museek's current lyric contract exposes line timestamps, so the desktop adapter estimates word timing from each line's interval while keeping lyric sources and event ownership unchanged.
License:
The AMLL packages are published under AGPL-3.0-only. Museek currently remains private, but any future distribution of a build containing this dependency must account for the dependency's license obligations.

## 2026-08-09 - Theme desktop karaoke and make lyric width adjustable

Decision:
Render the active desktop lyric line with the selected theme's primary color for the sung portion, keep the unsung AMLL background text in the foreground color, and provide narrower/wider toolbar controls that resize the native lyrics window around its center and persist the width locally.
Reason:
The desktop overlay should visibly follow Museek's selected accent theme, while long or short lyric lines need a user-controlled reading width independent of the lyric content.

## 2026-08-09 - Replace AMLL desktop lyrics with a resilient masked cover heading

Decision:
Remove AMLL from the desktop lyrics renderer. Show the single active lyric line through a local `MaskedHeading` component that clips a blurred, oversized cover image into the text and falls back to the selected primary theme color when the cover is missing or fails to load. Keep the separate Tauri window, local width/font/alignment controls, and main-window playback ownership unchanged.
Reason:
The AMLL presentation did not match the desired visual language. A cover-filled heading gives the desktop overlay a stronger music-specific identity while the explicit text fallback prevents the mask from making lyrics disappear.

## 2026-08-09 - Make desktop lyrics span the active monitor

Decision:
The desktop lyrics window uses the full active monitor work-area width and cannot be manually resized. Remove the width controls and ignore legacy saved width values; font scaling changes the window height only.

Reason:
Lyrics should have enough horizontal room by default so users do not need to tune a width setting or encounter truncation on long lines.

## 2026-08-09 - Preserve intrinsic width for long desktop lyrics

Decision:
Desktop lyric lines use their intrinsic single-line width and may overflow the visible screen rather than wrapping or being constrained to the monitor width.

Reason:
The user prefers seeing the complete lyric line and accepts screen overflow over truncation or automatic line wrapping.

## 2026-08-09 - Keep desktop lyrics centered

Decision:
Desktop lyrics always use centered alignment. Remove the left, center, and right alignment controls, local alignment state, and alignment persistence from the lyrics window.

Reason:
The desktop overlay should present one stable centered lyric line rather than expose an alignment setting that is no longer needed.

## 2026-08-09 - Size the desktop lyrics window to its content (superseded)

Decision:
The native desktop lyrics window starts from a small bootstrap size and then resizes to the measured intrinsic width of the active lyric line. It no longer forces the window to span the monitor or clamps its horizontal position to the screen.

Reason:
Fixed monitor-width geometry caused long lyric lines to be clipped at the window edge. Content-sized native geometry lets each complete line display without introducing a lyric width setting.

## 2026-08-09 - Measure desktop lyric width off-layout (superseded)

Decision:
Compute the desktop lyrics window width from canvas/DOM text metrics plus shell padding, not from the laid-out heading shell width. Keep the capsule content optically centered with flex alignment, line-height 1, and a slight upward text nudge.

Reason:
Layout-based width collapses to the current window when the line is longer, so resize freezes mid-line. Independent measurement always grows the window to the full lyric.

## 2026-08-09 - Resize desktop lyrics width with font scale (superseded)

Decision:
When the desktop lyric font changes, measure the active line at the target font size before rendering and resize the native window's width and height together. Keep the post-render measurement as a correction for loaded-font metrics.

Reason:
The former height-only resize left the enlarged line inside the old narrow window until a separate effect ran, allowing the maximum font size to be clipped during the transition.

## 2026-08-09 - Use the full active monitor width

Decision:
Set the desktop lyrics native window width to the selected monitor's physical screen width and align it to that monitor's left edge. Lyric changes and font scaling never resize the window width.

Reason:
A monitor-wide transparent surface removes content-measurement races and guarantees that a normal long lyric is not clipped by a narrow native window.

## 2026-08-09 - Permit desktop lyrics native geometry updates

Decision:
The `lyrics` Tauri capability must allow monitor lookup plus `set-size`, `set-position`, and the native geometry read APIs used by desktop lyrics. Do not rely on the generic default capability for these window mutations.

Reason:
Without explicit permissions, the geometry calls failed silently inside best-effort handlers, leaving the bootstrap `720px` width even though the frontend computed the monitor width correctly.

## 2026-08-09 - Integrate desktop lyrics controls into the capsule (superseded)

Decision:
Render the desktop lyrics toolbar inside the lyric capsule, let the capsule provide the shared background and shadow, and reserve larger internal padding for the controls and lyric. Reveal the surface and controls only when the capsule itself is hovered or focused.

Reason:
The previous window-level toolbar looked like a separate floating card above the lyric. A single interactive surface makes the controls feel attached to the lyric while preserving the transparent resting overlay.

## 2026-08-09 - Use an upward desktop lyrics notch

Decision:
Keep the toolbar as a child of a centered desktop lyrics group and place it in normal layout flow immediately before the lyric capsule. Its bottom long edge must meet the capsule's top long edge; do not use a negative top offset or a downward toolbar shadow. Reserve the toolbar's fixed height in the native window geometry and migrate previously saved heights once.

Reason:
The intended composition resembles a macOS notch: controls live in a small raised island attached to the main lyric capsule, rather than inside its text area or as a separate window-level toolbar. A negative offset exceeded the native window bounds and clipped the toolbar at the top.

## 2026-08-09 - Activate desktop lyrics surface from the lyric only

Decision:
Use the rendered lyric heading as the pointer-entry trigger for the desktop lyrics capsule. Keep the active state while the pointer remains inside the heading group so the pointer can move from the lyric to the toolbar; do not use the full monitor-wide window or the padded capsule as the initial hover target. Scale capsule padding from the default font scale, and apply stronger backdrop blur only to the active surface.

Reason:
The native lyrics window intentionally spans the monitor, so a group-level hover treated transparent empty space as a lyric hover. The lyric root is the narrow, real hit area while the group-level leave event preserves usable toolbar navigation.

## 2026-08-09 - Allow desktop lyrics to move beyond vertical work-area edges (superseded)

Decision:
Keep the initial desktop lyrics placement near the bottom of the active work area when no geometry is saved, but do not clamp a saved or moved y coordinate to the monitor work area. Persist the native position exactly as moved.

Reason:
Users may intentionally place desktop lyrics partially below the screen. Reapplying a work-area clamp during moved, resized, or cleanup callbacks made the window jump back unexpectedly.

## 2026-08-09 - Reduce default desktop lyrics capsule padding (superseded)

Decision:
Use `28px 32px 24px` as the default top, horizontal, and bottom lyric capsule padding, then scale all three values proportionally with the selected lyric font scale.

Reason:
The earlier `34px 40px 30px` baseline left too much empty space at the default size while still requiring proportional spacing at larger sizes.

## 2026-08-09 - Keep desktop lyrics inside vertical work-area bounds

Decision:
Clamp the desktop lyrics window's y coordinate to the exact active monitor work-area edges during startup restoration, moved/resized persistence, font resizing, and cleanup. Keep the initial placement near the bottom, but never persist a position above or below the usable vertical bounds. When a window center is already outside every monitor, use the nearest monitor rather than the first monitor in the list.

Reason:
A saved position outside the screen makes the lyrics window difficult or impossible to recover. Exact edges avoid an unnecessary visual jump, and nearest-monitor recovery preserves the user's display when the saved or moved rectangle is temporarily off-screen.

## 2026-08-09 - Use a smaller desktop lyrics capsule baseline

Decision:
Use `10px 14px 8px` as the default top, horizontal, and bottom padding, then scale all three values proportionally with the lyric font scale.

Reason:
The previous `20px 24px 16px` baseline still left too much empty space around the default lyric.

## 2026-08-09 - Animate the desktop lyrics mask

Decision:
Keep the slow cover-image drift inside the glyph mask, increase its desktop amplitude, and add a restrained animated sheen only when the cover image has loaded. Disable the sheen under `prefers-reduced-motion`.

Reason:
The previous mask technically moved but the low-amplitude, slow drift was easy to perceive as static. A single flowing highlight makes the mask visibly alive without changing lyric layout or introducing a high-frequency interaction animation.

## 2026-08-09 - Make the desktop lyrics capsule glass more visible

Decision:
Keep the capsule as a local translucent CSS surface with a lower background alpha, stronger backdrop blur, and a WebKit-prefixed fallback. Do not apply a native blur effect to the monitor-wide transparent lyrics window, because that would blur the entire desktop-sized window instead of only the capsule.

Reason:
The lyrics window spans the active monitor, so a native window effect has a much larger visual scope than the interactive capsule. A lighter local surface makes the available backdrop-filter behavior visible while preserving the transparent resting overlay.

## 2026-08-09 - Clamp desktop lyrics after dragging ends

Decision:
Do not change the desktop lyrics window position from the debounced move handler while a native drag is active. After the pointer release, clamp the final rectangle to the exact work-area edge and persist it.

Reason:
Clamping while the native drag is still holding the mouse rewrites the drag anchor and makes an edge drop jump far away from the pointer. Deferring the correction preserves the drag motion and still makes an out-of-bounds saved position recoverable.

## 2026-08-09 - Make only the desktop lyrics capsule interactive

Decision:
Keep the monitor-wide transparent lyrics window in cursor-ignore mode unless the global cursor is inside the lyric capsule or its visible toolbar. Poll the physical cursor position against the rendered DOM rectangles, enable native interaction only for that hit area, and keep the whole window interactive during an active drag. On Windows, use the native primary-button state to detect the end of a system drag when WebView pointer-up delivery is unavailable.

Reason:
Tauri's cursor-event setting applies to the native window rectangle, not individual CSS elements. Dynamic native hit testing is required to let clicks pass through the transparent monitor-wide area while preserving hover controls and capsule dragging.

## 2026-08-09 - Constrain desktop lyrics during controlled drag

Decision:
Use pointer capture and explicit native position updates for desktop lyrics dragging. Calculate the next position from the pointer's screen delta, clamp only the vertical coordinate to the active monitor work area before each update, and persist the final position without a post-release correction.

Reason:
Native window dragging can move beyond the work area, and correcting that position after release rewrites the drag result as a visible rebound. Constraining each requested position keeps the window inside the vertical bounds without a second movement after the user lets go.

## 2026-08-09 - Keep desktop lyrics glass readable and still

Decision:
Use a 0.7 alpha local translucent background for both the active desktop lyrics capsule and toolbar, add a thin white text outline at 0.43 alpha above the cover-filled lyric, render the lyric at weight 800, and remove the animated sheen from the MaskedHeading treatment.

Reason:
The previous alpha made the capsule disappear against busy desktops, while the cover-filled glyphs needed a neutral edge for separation. The sheen added motion without improving lyric readability, so the cover mask should remain visually calm.

## 2026-08-09 - Clamp desktop lyrics to physical monitor edges

Decision:
Use each selected monitor's physical `position` and `size` for the desktop lyrics vertical bounds instead of its reduced work area. Keep the initial placement slightly above the bottom edge, but allow saved and dragged positions to reach the actual screen edge.

Reason:
The work area excludes system taskbars and made the lyrics stop short of the user's visible monitor boundary. Drag coordinates and native window geometry are physical pixels, so the clamp must use the same physical monitor rectangle.

## 2026-08-09 - Resize desktop lyric font with Ctrl+wheel

Decision:
When the pointer is over the lyric capsule in interactive mode, Ctrl+wheel adjusts the persisted lyric font scale in the same 0.15 steps as the toolbar buttons. Wheel up increases the size and wheel down decreases it while preventing browser zoom.

Reason:
Directly resizing over the lyric is faster than moving to the transient toolbar, while keeping the existing font limits and persistence behavior unchanged.

## 2026-08-09 - Keep desktop lyrics dragging across the taskbar

Decision:
During a desktop lyrics drag, update the pointer position from the global physical cursor API instead of relying only on WebView pointer-move events. Continue clamping the native window to the selected monitor's full physical rectangle.

Reason:
The Windows taskbar can take over pointer events when the cursor enters it, which stopped WebView-driven dragging at the work-area boundary. Global cursor polling lets the window continue toward the actual screen edge.

## 2026-08-09 - Remove desktop lyric font buttons

Decision:
Remove the transient toolbar's increase and decrease font buttons. Expose the same 0.15-step font scaling through Ctrl+wheel over the lyric capsule and list the interaction in the shortcut settings.

Reason:
Direct manipulation over the lyric is faster and keeps the small toolbar focused on window controls.

## 2026-08-09 - Use theme-color karaoke for desktop lyrics (superseded for timed sources)

Decision:
Remove the desktop lyric cover mask and render the active line as two theme-colored text layers. Keep the unsung text at reduced primary-color opacity and reveal the full primary color from left to right across the current line's time interval. Show a grab cursor over the interactive lyric capsule and a grabbing cursor during drag.

Reason:
The selected theme should remain the visual identity of the overlay, while the progressive fill communicates playback without requiring word-level timing data or a cover-image effect.

## 2026-08-09 - Clamp desktop lyrics by the visible group

Decision:
During desktop lyrics dragging and font/DPI resizing, clamp the native window position using the rendered lyric group top and bottom offsets inside the transparent window. Keep the drag monitor fixed at pointer-down and use physical cursor, monitor, and window coordinates throughout.

Reason:
The transparent native window is taller than the centered toolbar and lyric capsule. Clamping its own rectangle left a visible gap at the monitor edges, and the gap changed with font scaling. The visible group is the user-facing boundary.

## 2026-08-09 - Use and document the platform modifier for desktop lyric font scaling

Decision:
Use Ctrl+wheel on Windows and Linux, and Command+wheel on macOS, for desktop lyric font scaling. Show both equivalents as `Ctrl/⌘ + Wheel` in the shortcut settings.

Reason:
Command is the native primary modifier on macOS; using Ctrl there makes the documented gesture inconsistent with the platform's keyboard conventions.

## 2026-08-09 - Reset karaoke highlighting per lyric line (superseded by word timing)

Decision:
Give each active desktop lyric line a stable React key so its karaoke fill mounts from zero. Keep the short CSS clip-path transition only for progress updates within the same line.

Reason:
Reusing the same highlighter node across line changes animated the previous line's nearly complete fill backward before advancing the new line, which looked like a bounce.

## 2026-08-09 - Remove unused GSAP dependency

Decision:
Do not include GSAP in Museek. Desktop karaoke uses the existing audio requestAnimationFrame clock and CSS clip-path transitions, and no source module imports GSAP.

Reason:
The dependency added weight without providing behavior in the current UI.

## 2026-08-09 - Clamp desktop lyrics horizontally by the visible group

Decision:
Apply the same visible-group offset model to horizontal dragging, font resizing, DPI restoration, and saved geometry. Clamp the native window x coordinate so the rendered lyric group stays within the active monitor's physical left and right edges.

Reason:
The monitor-wide transparent window is wider than the lyric group. Clamping the native rectangle would prevent the visible group from reaching either physical side, while leaving x unconstrained allowed it to disappear off-screen.

## 2026-08-09 - Re-clamp desktop lyrics on pointer release

Decision:
Refresh the physical cursor, enqueue the final clamped drag target, then clamp the actual native position again before persisting it.

Reason:
Pointer-up can race the last cursor sample and otherwise save a position outside the visible lyric boundary.

## 2026-08-09 - Preserve available word-timed lyric data

Superseded 2026-08-27: no estimated fill from line LRC; plain lyrics use the default whole-line treatment.

Decision:
Parse inline word timings from LRC, KuWo, KRC, MRC, and external `lxlyric` data into optional `LyricLine.words`; use per-word theme-color fill when present and line-level interpolation otherwise.

Reason:
Line-only LRC cannot provide perfect karaoke timing, while discarding available word timings made supported sources visibly lag the vocal timing.

## 2026-08-09 - Prefer validated native karaoke timing

Superseded 2026-08-27: do not estimate word timings from line-timed lyrics.

Decision:
Use validated platform-native word timing first: NetEase YRC, QQ QRC, KuWo lyricx, KuGou KRC, Migu MRC, and inline `lxlyric` data. Estimate word timing only for line-timed lyrics when the next-line or song-duration interval is defensible; otherwise render stable themed text with karaoke disabled.

Reason:
Native timing follows the source's actual vocal segmentation. Conservative estimation is useful for ordinary LRC but should never present an invented word progression as authoritative when the interval is missing, ambiguous, malformed, or inconsistent with the visible lyric text.

## 2026-08-09 - Fall back to Migu's legacy search and normalize MRC word starts

Decision:
Keep the signed Migu jadeite v3 search as an opportunistic primary path, but fall back to `MIGUM2.0/v1.0/content/search_all.do` when it is rejected or unavailable. Normalize Migu MRC word timestamps from absolute milliseconds to line-relative inline offsets before shared lyric parsing.

Reason:
The current jadeite endpoint can return HTTP 403 while the legacy endpoint still returns searchable songs and native `mrcurl` resources. Migu's MRC markers use absolute word starts, whereas Museek's inline lyric contract expects offsets from the line start; converting them preserves native karaoke timing and lets invalid text coverage fall back through the existing timing policy.

## 2026-08-09 - Separate desktop lyric line motion from word timing

Decision:
Animate only newly mounted desktop lyric lines with a short opacity and transform entrance. Keep word-level karaoke clip paths immediate, and disable the line entrance when reduced motion is preferred.

Reason:
Line changes benefit from a restrained spatial transition, while smoothing high-frequency word updates would make karaoke lag behind the authoritative playback clock. Compositor-friendly opacity and transform keep the infrequent transition lightweight.

## 2026-08-09 - Make the desktop lyrics capsule user-configurable

Decision:
Keep the desktop lyrics readability capsule enabled by default, persist the preference with the regular settings, and expose it in a dedicated Lyrics settings tab alongside auto-lock behavior. Propagate changes through the existing desktop lyrics appearance event; when disabled, render the lyric shell without a background even during hover or focus.

Reason:
The capsule improves readability over varied desktop backgrounds, but text-only lyrics are a valid preference. Keeping the setting in the shared appearance snapshot updates an already-open lyrics window immediately without introducing another event channel.

## 2026-08-09 - Make desktop lyrics unlocking global

Decision:
Superseded 2026-08-16: every playback shortcut is now a user-editable global hotkey. `CommandOrControl+Shift+L` remains the default lock/unlock combo.

Reason:
Window-scoped keys stopped working once Museek was minimized.

## 2026-08-10 - Make local naming a per-track override

Decision:
Superseded 2026-08-26: the checkbox is a title lock only (no network). Keep the per-track filename checkbox; the previous global filename setting still migrates once.

Reason:
Fragments and remixes still need a way to keep the original filename after catalog matching.

## 2026-08-09 - Make local song naming explicit and reversible

Decision:
Superseded 2026-08-26: do not restore a global filename/smart setting. New imports lock the title to the basename; online fill is Match online or Match on import only.

Reason:
A global mode fought the per-track lock and mixed tag reads with NetEase.

## 2026-08-10 - Deepen runtime boundaries without changing UX

Decision:
Keep the existing player, desktop-lyrics, local-library, source-script, and font-preference behavior while moving their policy boundaries into dedicated modules. Playback time is consumed through the audio clock seam; desktop window geometry is owned by a window-management module; local enrichment is queued, rate-limited, cached, and guarded by track versions; source runners receive an explicit registry port; and lyric font storage is shared while each view retains its own scale policy.

Reason:
These changes reduce hidden coupling and create narrow validation seams without changing user-visible controls, persistence formats, source-script ownership, desktop lyrics protocol events, or the local import workflow.

## 2026-08-10 - Keep lyrics-only as a panel view mode

Decision:
Add a lyrics-only toggle inside the main lyrics panel. Hide the song metadata, cover, and transport column while letting the lyric list use the full panel width; keep the existing toolbar controls and OS fullscreen mode separate. Keep the toggle local to the panel session rather than adding a persisted setting.

Reason:
Users can focus on the lyric content without changing window geometry, playback ownership, or the existing immersive fullscreen behavior, while the visible toggle remains available to restore the normal song-focused layout.

## 2026-08-10 - Align main lyric controls with desktop lyrics

Decision:
Use Maximize/Minimize for the main lyrics immersive toggle and ScanEye for lyrics-only mode. Match the lyrics-only active treatment to the adjacent desktop lyrics control, and support the same platform modifier plus mouse-wheel font scaling over the main lyric area: Ctrl on Windows/Linux and Command on macOS, in 0.15 steps with the shared 0.85x–2.5x scale limits.

Reason:
The two lyric surfaces should share recognizable control semantics and typography behavior, while platform-native modifier keys keep the gesture consistent with the existing desktop lyrics interaction.

## 2026-08-10 - Give every lyrics toolbar action semantic hover motion

Decision:
Use the existing captions, download, and maximize icon animations for matching lyrics toolbar actions, and add restrained upward/downward motion for the font-size controls. Keep all toolbar hover animations disabled under `prefers-reduced-motion`.

Reason:
Every visible action should provide the same level of tactile feedback without introducing unrelated motion or overriding the user's reduced-motion preference.

## 2026-08-10 - Blur up lyric-page covers from the existing thumbnail

Decision:
Keep the available low-resolution song thumbnail visible immediately on the lyrics page, render it slightly enlarged and blurred while the high-resolution cover loads, and fade the sharp cover layer in after `CoverImage` finishes decoding. Keep the thumbnail as the visual fallback instead of showing the high-resolution placeholder over it.

Reason:
The player already has a usable thumbnail when the lyrics page opens. Keeping it visible avoids an empty cover during the first high-resolution request and makes the quality upgrade feel continuous rather than abrupt.

## 2026-08-10 - Invalidate stale search results when the search context changes

Decision:
Treat a search request's query, platform, and scope as one context. Increment the search generation whenever a new search, scope/platform switch, platform jump, or clear action occurs, and ignore responses from older contexts. Recreate the result scroll surface when switching between songs and collections.

Reason:
Song, playlist, and album requests can finish in a different order from the user's clicks. Invalidating older responses and separating the result surface prevents stale song rows from surviving a scope switch while keeping the active search state authoritative.

## 2026-08-10 - Keep the lyrics font gesture permanently discoverable

Decision:
Keep a small, low-contrast hint permanently at both the beginning and end of the lyric scroll content. Use friendly, conversational platform-specific Ctrl/Command plus wheel wording, keep both copies at a fixed 12px size independent of lyric scaling, and include the shortcut in the font button titles as a persistent zero-visual-cost fallback.

Reason:
The gesture needs discoverability, but a banner or centered toast would compete with lyric reading. Placing the cue at the natural start and end boundaries of the lyrics makes it available without competing with the active line or adding another control-surface annotation.

## 2026-08-10 - Keep lyric line transitions interruptible

Decision:
Keep the active lyric DOM layer mounted while it becomes the outgoing layer, render that layer visibly for one frame before fading it, create the new line separately, and derive transition keys from the visible fallback line. Use shallow transform and blur transitions shared by top-bar and desktop lyrics.

Reason:
Preserving layer identity and a guaranteed initial frame lets interrupted transitions continue from their current presentation instead of flashing or resetting to a target, while stable fallback keys avoid redundant flashes before the first timed line.

## 2026-08-10 - Keep lyric transition layers in one intrinsic track

Decision:
Stack the incoming and outgoing desktop lyric layers in the same CSS Grid track so both contribute to the capsule's intrinsic size until the outgoing layer is removed.

Reason:
An absolutely positioned outgoing layer is excluded from `max-content` sizing, which can make the desktop capsule collapse to the entering lyric and then expand during the transition.

## 2026-08-10 - Animate desktop capsule width from its live presentation

Decision:
When desktop lyric text changes, lock the capsule to its current rendered width through the crossfade, measure the next content intrinsically, and release inline width only after the width transition settles. For shorter targets, begin the width transition after a short overlap delay and clip the outgoing layer to the current capsule width; interrupted changes recapture the current width.

Reason:
Intrinsic grid sizing alone can collapse long-to-short capsules immediately, while an overflowing outgoing layer can remain visible outside the capsule during an overlapped shrink.

## 2026-08-10 - Embed download metadata best-effort

Decision:
Offer independent embedded-lyrics and embedded-cover switches, both enabled by default, snapshot them when a download is queued, and keep the audio download successful when metadata retrieval or tag writing fails.

Reason:
Metadata is useful but remote lyrics, artwork, and format tags are optional inputs; deterministic queue settings and post-write enrichment preserve usable audio without making downloads brittle.

## 2026-08-14 - Harden download cover and lyric embedding

Decision:
Tag downloads in a lofty `Cursor<Vec<u8>>` and return tagged bytes over IPC. plugin-fs writes the user file once. Keep network fetch at most 85% of the progress bar; lyrics/cover fetch overlaps the download, and tag writing occupies 86–99%.

Reason:
Rust must not open a file plugin-fs just wrote — Windows returns os error 5 even in AppData, and macOS can hit the same lock or TCC race. Showing 100% before tagging made the task look stuck.

## 2026-08-10 - Keep macOS media updates on the main thread

Decision:
Use souvlaki 0.8.3 for Now Playing artwork, dispatch macOS media-control updates through Tauri's main-thread queue, and keep the shared playback clock fed by native `timeupdate` events as a fallback to animation frames.

Reason:
Older souvlaki versions passed a raw NSURL into an asynchronous artwork task, while WebView animation frames can be throttled when the window is hidden or deprioritized. The newer dependency removes the URL lifetime hazard, main-thread dispatch protects AppKit state updates, and the media event fallback keeps lyrics advancing.

## 2026-08-10 - Cache the React playback-clock snapshot

Decision:
Treat the audio element's current time as an external-store value that changes
only when the audio event or animation-frame clock emits an update. Do not read
the continuously advancing HTMLAudioElement.currentTime directly from
useSyncExternalStore snapshots, and do not invoke a listener synchronously while
it is being subscribed.

Reason:
React 19 compares external-store snapshots during passive effects. A live media
element currentTime can change between those reads without a corresponding store
notification, so playback caused repeated forceStoreRerender calls and the
maximum update depth error that made the macOS WKWebView appear to disappear.
Caching the value at the clock boundary keeps the snapshot stable between
notifications while preserving smooth lyric and progress updates.

## 2026-08-11 - Keep top-bar karaoke on cached playback snapshots

Decision:
Keep `PlaybackKaraokeText` and `LyricTransition` enabled in the top bar. Their
React subscribers must consume the cached clock value from `AudioPlayer`, not a
fresh `HTMLAudioElement.currentTime` read.

Reason:
The macOS regression was caused by the live external-store snapshot, not by
top-bar karaoke itself. After the cached getter was restored, clicking Play was
retested on macOS and the main window remained visible while karaoke rendered.

## 2026-08-10 - Keep macOS icon artwork inside a safe margin

Decision:
Keep a 10% transparent margin on each side of the desktop icon artwork and
regenerate the Tauri PNG sizes and macOS ICNS together. Keep platform-specific
mobile and Windows icon assets independent unless their visual treatment also
needs to change.

Reason:
An opaque black canvas reaching every edge has more visual weight in the macOS
Dock than neighboring icons with inset artwork. The Tauri configuration uses
the ICNS resource for macOS, so changing only a source PNG would not reliably
update the installed application icon.

## 2026-08-10 - Keep one Windows media-session owner

Decision:
Use souvlaki's native SMTC for Windows, macOS, and Linux, and keep the native
Windows taskbar thumbnail toolbar for its separate hover buttons. Windows sets
the SMTC AppMediaId to `Museek`.

Reason:
The HTML audio element can expose a WebView2 media session, but its browser
child process does not reliably inherit the desktop app identity. Publishing
from the native window keeps the media card under Museek's AUMID and avoids a
second WebView2 session.

## 2026-08-10 - Set the Windows media app identity before window creation

Decision:
Set the process AppUserModelID to `com.museek.app` at the start of the Windows
entry point, before Tauri creates any windows or media sessions.

Reason:
Windows uses the process and window AppUserModelID to resolve the application
label shown by system media controls. The process identity and native SMTC
AppMediaId must be initialized before playback metadata is published.

## 2026-08-11 - Keep WebView2 out of Windows desktop media ownership

Decision:
On Windows Tauri, do not create an HTML audio element. Fetch and decode the
resolved audio source through Web Audio, while keeping the existing HTML audio
and `navigator.mediaSession` path for browser preview and non-Windows platforms.
Native souvlaki SMTC remains the only Windows desktop media-card owner.

Reason:
WebView2 automatically publishes a media card for an HTML audio element even
when Museek suppresses explicit JavaScript Media Session updates. Removing the
HTML media element from the Windows Tauri path eliminates the duplicate card
without weakening browser-preview playback controls or normal HTML audio behavior.

## 2026-08-11 - Use sliding three-second NetEase recognition windows

Decision:
Generate NetEase `shazam_v2` fingerprints from overlapping three-second,
8 kHz windows of the captured clip and stop after the first candidate result.
Parse both object and array forms of the service's result payload.

Reason:
NetEase's AFP endpoint accepts the short Shazam fingerprint protocol rather
than an AFP generated from the full capture duration. A sliding window keeps
the existing capture length for diagnostics while allowing a song's matching
segment to occur anywhere in the sample.

## 2026-08-11 - Keep NetEase as the sole recognition provider

Decision:
Use NetEase as Museek's only song-recognition provider. Remove the ShazamIO
adapter, comparison workflow, related UI, and its WASM dependency.

Reason:
Local testing showed the NetEase provider was faster and more accurate for
the intended recognition workflow, while the comparison path added runtime
weight and UI complexity without improving the result.

## 2026-08-11 - Match recognition controls to the search-page layout

Decision:
Present recognition as a compact search-style page with capture-mode tabs in
the upper-left, default Windows desktop capture to system audio, and show
recognition results directly below the header actions. Remove the separate
capture waveform card and captured-audio preview from the primary view.

Reason:
Capture mode is the primary input choice, so it should be available in the
page header rather than hidden in a secondary card. The result list is the
main purpose of the route and should receive the page's visual focus.

## 2026-08-12 - Use screenshot-led SaaS framing for the landing page

Decision:
Keep `docs/index.html` as a bilingual static SaaS product site with a clear
desktop-app preview, product-surface cards, a workflow explanation, and a
GitHub Releases path. Render product screenshots at their intrinsic aspect
ratios with `contain`; browser-style frames provide context but never crop the
application content.

Reason:
The landing page should communicate Museek as a desktop music product before
it communicates its visual style. Full-window captures make the actual app
inspectable, while the SaaS structure keeps the page easy to scan and makes
the source-script and no-content-distribution boundaries explicit.
