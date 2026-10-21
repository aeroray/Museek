# Area: Local Library

Memory here applies only when touched files or task scope match this area.

## MC-AREA-20261021-00000301 — Never read a whole audio file into the WebView

Status: active
Scope: area:local-library
Entry-Type: decision
Subject: MC-SUBJ-20261021-07a17294
Facet: performance
Evidence:
- repo:src/lib/localMusic/tags.ts

Decision:
Duration, tags and cover come from a lofty probe on a background Rust thread; import never reads the file into the frontend.

Reason:
A CD-image FLAC copied through plugin-fs froze import and window close.

## MC-AREA-20261021-00000302 — CUE albums import as virtual clips

Status: active
Scope: area:local-library
Entry-Type: decision
Subject: MC-SUBJ-20261021-07a17294
Facet: data-model
Evidence:
- repo:src/lib/localMusic/cue.ts

Decision:
Import a CUE as N tracks sharing one audio path, with `clipStart`/`clipEnd` on `meta`.

Reason:
A CD rip is one file plus a sheet; treating it as one song breaks auto-next, match scoring and deletion.

## MC-AREA-20261021-00000303 — Import is offline; matching is an explicit action

Status: active
Scope: area:local-library
Entry-Type: decision
Subject: MC-SUBJ-20261021-07a17294
Facet: behavior
Evidence:
- repo:src/lib/localMusic/scan.ts

Decision:
Import fills tags with no network; the filename checkbox locks only the displayed title. Catalog fills happen only through Match on import or Match online.

Reason:
Mixing tags and platform data made a checkbox or a play look like matching.

## MC-AREA-20261021-00000304 — Playing a local file does not search unless matched

Status: active
Scope: area:local-library
Entry-Type: decision
Subject: MC-SUBJ-20261021-07a17294
Facet: compatibility
Evidence:
- repo:src/lib/localMusic/playback.ts

Decision:
Play never searches online unless the track already has a platform match. Unmatched playback uses the file plus sidecar and embedded lyrics only.

Reason:
Implicit play-time matching was easy to get wrong and blocked playback on file reads.

## MC-DNU-20261021-00000305 — Binding lyrics or a cover to a first search hit

Status: active
Scope: area:local-library
Subject: MC-SUBJ-20261021-07a17294
Facet: adoption-policy
Evidence:
- repo:src/lib/localMusic/catalogQuery.ts

Rejected:
Binding lyrics or a catalog entry to a stored id or the first search result. Require a tight title, a known artist or a close duration, and reject gaps over 15s.
