# Area: Platforms

Memory here applies only when touched files or task scope match this area.

## MC-AREA-20261021-00000501 — A platform adapter parses defensively

Status: active
Scope: area:platforms
Entry-Type: decision
Subject: MC-SUBJ-20261021-8c94f54c
Facet: behavior
Evidence:
- repo:src/lib/search/kuwo.ts

Decision:
Guard array fields with `Array.isArray` and skip individual malformed rows instead of throwing for the page. Tolerate null in decode helpers.

Reason:
One item missing an id or `MUSICRID` used to abort the whole page, so the platform looked empty rather than partially broken.

## MC-AREA-20261021-00000502 — QQ external playlists fall back to Dissinfo

Status: active
Scope: area:platforms
Entry-Type: decision
Subject: MC-SUBJ-20261021-8c94f54c
Facet: compatibility
Evidence:
- repo:src/lib/playlists/tx.ts

Decision:
Keep the plaza endpoint for plaza lists. When an external list returns a non-zero subcode or songs without songmid, fall back to `uniform_get_Dissinfo`.

Reason:
Such lists used the old endpoint's incomplete tracks, so every song failed while the bar still claimed to be playing.

## MC-AREA-20261021-00000503 — Migu falls back to its legacy search

Status: active
Scope: area:platforms
Entry-Type: decision
Subject: MC-SUBJ-20261021-8c94f54c
Facet: data-model
Evidence:
- repo:src/lib/search/mg.ts

Decision:
Try the signed jadeite search first, then fall back to the legacy `search_all.do`. Normalize MRC word timestamps to line-relative offsets.

Reason:
The jadeite endpoint can return 403 while the legacy one still returns songs; MRC uses absolute word starts.

## MC-AREA-20261021-00000504 — Recognition uses NetEase sliding three-second windows

Status: active
Scope: area:platforms
Entry-Type: decision
Subject: MC-SUBJ-20261021-8c94f54c
Facet: performance
Evidence:
- repo:src/lib/recognition/neteaseProvider.ts

Decision:
Generate `shazam_v2` fingerprints from overlapping three-second 8 kHz windows and stop at the first candidate. NetEase is the only recognition provider.

Reason:
The endpoint accepts the short fingerprint protocol, and a sliding window lets the matching segment sit anywhere in the capture.

## MC-DNU-20261021-00000505 — Adding a second recognition provider or scraping comments via scripts

Status: active
Scope: area:platforms
Subject: MC-SUBJ-20261021-8c94f54c
Facet: architecture
Evidence:
- repo:src/lib/comments/index.ts

Rejected:
Reintroducing a ShazamIO adapter or comparison workflow, or reading song comments through source scripts. Comments use each platform's public API; a second recognizer added weight without improving results.
