# Decisions

Cross-cutting decisions only. Subsystem detail lives in the routed `areas/` files.

## MC-DEC-20261021-00000001 — Playback URLs come from user-imported source scripts

Status: active
Scope: project
Subject: MC-SUBJ-20261021-a9a8ce03
Facet: architecture
Evidence:
- repo:docs/memory/brief.md

Decision:
Museek obtains playback and download data from user-imported lx-music-compatible scripts rather than bundling music sources.

Reason:
This preserves the aggregator role and keeps source ownership, and legal risk, with the user.

## MC-DEC-20261021-00000002 — The desktop lyric lives on its own render-only window

Status: active
Scope: project
Subject: MC-SUBJ-20261021-f87bc9f9
Facet: lifecycle
Evidence:
- repo:src/lib/desktopLyricsProtocol.ts

Decision:
The desktop lyric is a separate hidden Tauri window with a lightweight React entry. The main window keeps audio, Zustand state and the clock, and sends lyric snapshots through events.

Reason:
Tauri windows do not share JavaScript state, and reloading the whole player there would duplicate playback and close handling.

## MC-DEC-20261021-00000003 — A release is a version bump, a whatsNew entry, then a tag

Status: active
Scope: project
Subject: MC-SUBJ-20261021-f25fea31
Facet: workflow
Evidence:
- repo:src/lib/whatsNew/entries.ts

Decision:
Bump `package.json`, add an `entries.ts` entry for that version, run the suite, commit and push, then push a lightweight tag.

Reason:
The tag triggers the release workflow, and a missing entry ships an empty dialog.

## MC-DEC-20261021-00000004 — A release stays a draft until someone with write access publishes it

Status: active
Scope: project
Subject: MC-SUBJ-20261021-f25fea31
Facet: adoption-policy
Evidence:
- repo:.github/workflows/release.yml

Decision:
Never conclude a release failed because `gh release view` reports "not found"; read the workflow log instead.

Reason:
`releaseDraft: true` hides the release from a read-only token, so a successful build looks like nothing happened.

## MC-DEC-20261021-00000005 — Device-local state never rides config sync

Status: active
Scope: project
Subject: MC-SUBJ-20261021-74863a9e
Facet: version-policy
Evidence:
- repo:src/lib/configIO.ts

Decision:
Keep listen history, per-song quality, UI fonts, disabled shortcuts and credentials out of `configIO`'s `DB_FILES`. Absence from that list is the mechanism.

Reason:
A config import must not wipe local choices, and an export must not carry credentials or font names another platform lacks.

## MC-DEC-20261021-00000006 — Sync auto-import never silently executes new code

Status: active
Scope: project
Subject: MC-SUBJ-20261021-a9a8ce03
Facet: data-model
Evidence:
- repo:src/lib/sync.ts

Decision:
Sources found by sync auto-import are written with `enabled: false`, including one whose script text changed under the same id.

Reason:
The built-in passphrase is only obfuscation, so disabling newly imported sources is what cuts the execution chain.
