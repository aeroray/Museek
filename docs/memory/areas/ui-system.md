# Area: Ui System

Memory here applies only when touched files or task scope match this area.

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
Writes queue per filename, and the content is snapshotted when the call is made. A single failure must not block the queue.

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

## MC-DNU-20261021-00000705 — Raising the whole-file memory budget to silence the audit

Status: active
Scope: area:ui-system
Subject: MC-SUBJ-20261021-74863a9e
Facet: workflow
Evidence:
- repo:docs/memory/manifest.md

Rejected:
Raising a budget in the manifest to make `status` pass. The CLI enforces its own limits, so the file still reports over budget; scoped knowledge belongs in a routed area instead.
