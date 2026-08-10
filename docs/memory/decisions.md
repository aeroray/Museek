# Confirmed Decisions

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

Decision:
Parse inline word timings from LRC, KuWo, KRC, MRC, and external `lxlyric` data into optional `LyricLine.words`; use per-word theme-color fill when present and line-level interpolation otherwise.

Reason:
Line-only LRC cannot provide perfect karaoke timing, while discarding available word timings made supported sources visibly lag the vocal timing.

## 2026-08-09 - Prefer validated native karaoke timing

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
Register `CommandOrControl+Shift+L` through the Tauri global-shortcut plugin and forward press events to the main webview, where the existing desktop lyrics interaction state is toggled. Keep the remaining playback shortcuts scoped to the Museek window to avoid taking over common system and other-app combinations.

## 2026-08-10 - Make local naming a per-track override

Decision:
Use smart recognition for new local imports by default, and store an optional `filename` naming override on each `LocalTrack`. Expose the override as a checkbox in that track's local-library options menu; clearing it restores tag-first smart recognition and online enrichment. Migrate the previous global filename setting to per-track overrides once, preserving legacy filenames.

Reason:
Most local songs benefit from automatic tag and online recognition, while fragments, covers, remixes, and other special files may have names that should remain untouched. A per-track override keeps the common path automatic without forcing a library-wide choice.

Reason:
The locked lyrics window ignores pointer and keyboard input by design, so an in-window shortcut cannot unlock it. A native global registration remains available while the lyrics window is click-through or the main window is unfocused, while limiting global scope avoids surprising conflicts for ordinary playback commands.

## 2026-08-09 - Make local song naming explicit and reversible

Decision:
Default local imports to preserve the file basename as the song title and expose a Local settings choice between filename-preserving and smart recognition modes. Filename mode still reads embedded local tags but skips online enrichment; smart mode keeps the existing tag-first and NetEase fallback behavior. Changing modes refreshes existing tracks, and the selected mode is persisted with regular settings.

Reason:
Local fragments, covers, remixes, and other non-mainstream versions often use intentionally meaningful names that online matching can erase. A conservative default protects that intent while keeping automatic recognition available for users who prefer it.

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
