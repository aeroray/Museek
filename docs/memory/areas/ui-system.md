# Area: Ui System

Memory here applies only when touched files or task scope match this area.

## MC-AREA-20261102-c624188b — Saturated-fill buttons border their own top edge

Status: active
Scope: area:ui-system
Entry-Type: decision
Subject: MC-SUBJ-20261021-74863a9e
Facet: behavior
Evidence:
- repo:src/components/ui/button.tsx

Decision:
`default`, `destructive` and `secondary` carry `border-y border-<fill>`. On a half-pixel y (dialog footers) the antialiased top row is then a constant opaque colour instead of the transitioning background.

Reason:
A background-only edge re-resolves mid-transition and the top of the button flickers.

## MC-AREA-20261102-dfaf0752 — Hide native bars in the app stylesheet, not via Radix's runtime style

Status: active
Scope: area:ui-system
Entry-Type: decision
Subject: MC-SUBJ-20261021-74863a9e
Facet: compatibility
Evidence:
- repo:src/index.css

Decision:
Hide native scrollbars in `src/index.css` for `[data-radix-scroll-area-viewport]` and `[data-radix-select-viewport]`; never rely on the `<style>` Radix injects at runtime.

Reason:
Tauri's build-time CSP nonce makes `'unsafe-inline'` ineffective for `style-src`, so the packaged app drops Radix's rule and paints a native bar under the custom one.

## MC-AREA-20261021-00000701 — Motion reads from shared tokens, never literals

Status: active
Scope: area:ui-system
Entry-Type: decision
Subject: MC-SUBJ-20261021-74863a9e
Facet: architecture
Evidence:
- repo:src/lib/motion.ts

Decision:
Icon motion reads `--motion-*` and `--ease-spring-*` from `:root` or the `SPRING_*` presets; reduced motion flattens every curve.

Reason:
Literal durations drift per component; one token set keeps hover, press and swap on the same scale.

## MC-AREA-20261021-00000702 — Trailing columns in TrackRow are fixed width

Status: active
Scope: area:ui-system
Entry-Type: decision
Subject: MC-SUBJ-20261021-74863a9e
Facet: interface
Evidence:
- repo:src/components/common/TrackRow.tsx

Decision:
The platform chip uses a fixed `w-20` slot and the stat column a fixed `statWidth`; never use intrinsic width there.

Reason:
The name column is `flex-1`, so a variable width pushes its left neighbours sideways and column edges stop lining up.

## MC-AREA-20261021-00000703 — Persistence is serialized per file

Status: active
Scope: area:ui-system
Entry-Type: decision
Subject: MC-SUBJ-20261021-74863a9e
Facet: data-model
Evidence:
- repo:src/lib/db.ts

Decision:
Writes queue per filename, snapshotted at call time; a single failure must not block the queue.

Reason:
Unsynchronized writes let a late stale snapshot overwrite newer data.

## MC-AREA-20261021-00000704 — Focus rings are removed only where the modality is known

Status: active
Scope: area:ui-system
Entry-Type: decision
Subject: MC-SUBJ-20261021-74863a9e
Facet: lifecycle
Evidence:
- repo:src/lib/focusModality.ts

Decision:
Drop the ring only for pointer-driven menu closes, handled in the shared `DropdownMenuContent`. Never add a global `outline: none`.

Reason:
Focus rings are the only keyboard affordance; the annoyance comes from a modality mismatch, not from rings existing.

## MC-DNU-20261021-00000705 — Silencing project checks instead of fixing them

Status: active
Scope: area:ui-system
Subject: MC-SUBJ-20261021-74863a9e
Facet: workflow
Evidence:
- repo:docs/memory/manifest.md

Rejected:
Raising a manifest budget to make `status` pass — the CLI enforces its own limits. Never offer a bulk action (reorder, clear, disable-all) on incomplete data: a partial ranking reads as an unrequested verdict, so gate it on complete results.
