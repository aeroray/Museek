# Area: Desktop Shell

Memory here applies only when touched files or task scope match this area.

## MC-AREA-20261021-00000601 — Tauri window calls stay on the main thread

Status: active
Scope: area:desktop-shell
Entry-Type: decision
Subject: MC-SUBJ-20261021-f25fea31
Facet: compatibility
Evidence:
- repo:src-tauri/src/lib.rs

Decision:
Never show, hide or focus the main window from a background thread on Windows; marshal through `run_on_main_thread`. Restore it on taskbar focus when hidden.

Reason:
Tao window APIs are event-loop-bound, and a worker-thread `show()` hitched dragging and crashed after launch.

## MC-AREA-20261021-00000602 — The macOS tray mark is one template image

Status: active
Scope: area:desktop-shell
Entry-Type: decision
Subject: MC-SUBJ-20261021-f25fea31
Facet: interface
Evidence:
- repo:src/lib/trayMark.ts

Decision:
Ship a single template image via `icon_as_template(true)`. Do not poll the menu-bar appearance to swap light and dark assets.

Reason:
macOS inks a template image from its alpha channel alone, so one asset covers both appearances and cannot go stale.

## MC-AREA-20261021-00000603 — One native media-session owner

Status: active
Scope: area:desktop-shell
Entry-Type: decision
Subject: MC-SUBJ-20261021-f25fea31
Facet: architecture
Evidence:
- repo:src/lib/smtc.ts

Decision:
souvlaki owns the media card on every platform, publishing duration and a throttled clock position. Set the Windows AppUserModelID before any window exists.

Reason:
A WebView2 media session does not reliably inherit the desktop app identity, producing a duplicate card.

## MC-AREA-20261021-00000604 — A disabled control disables its shortcut too

Status: active
Scope: area:desktop-shell
Entry-Type: decision
Subject: MC-SUBJ-20261021-f25fea31
Facet: security
Evidence:
- repo:src/lib/shortcutKeys.ts

Decision:
Global shortcuts share their control's availability. Disabling one keeps the binding and records the action in `disabledGlobalShortcuts`.

Reason:
A global path must not bypass a disabled control, and clearing the binding forces a re-record.

## MC-DNU-20261021-00000605 — Measuring macOS traffic lights after sleep

Status: active
Scope: area:desktop-shell
Subject: MC-SUBJ-20261021-f25fea31
Facet: lifecycle
Evidence:
- repo:src-tauri/tauri.conf.json

Rejected:
Computing Overlay traffic-light gaps from live button frames, or re-setting the macOS shadow without re-asserting the Overlay mask. After sleep AppKit resets only some buttons, and `set_decorations(true)` drops the mask asynchronously.
