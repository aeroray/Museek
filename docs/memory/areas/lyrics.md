# Area: Lyrics

Memory here applies only when touched files or task scope match this area.

## MC-AREA-20261021-00000201 — Cross-platform matching needs the platform's spelling

Status: active
Scope: area:lyrics
Entry-Type: decision
Subject: MC-SUBJ-20261021-f87bc9f9
Facet: compatibility
Evidence:
- repo:src/lib/platformArtist.ts

Decision:
Ask the platform how it spells the artist and offer that name to the same scorer via `platformArtistName`, shared with Last.fm loved tracks.

Reason:
The same artist is 爱缪 on QQ and あいみょん on NetEase, so fold-based comparison scored zero.

## MC-AREA-20261021-00000202 — Karaoke uses native word timing only

Status: active
Scope: area:lyrics
Entry-Type: decision
Subject: MC-SUBJ-20261021-f87bc9f9
Facet: data-model
Evidence:
- repo:src/lib/lyric.ts

Decision:
Fill per word from validated native timestamps only. Plain line-timed LRC gets whole-line treatment; never estimate word timings.

Reason:
Estimated karaoke looked word-accurate but was invented.

## MC-AREA-20261021-00000203 — The desktop lyric is one line in a monitor-wide window

Status: active
Scope: area:lyrics
Entry-Type: decision
Subject: MC-SUBJ-20261021-f87bc9f9
Facet: interface
Evidence:
- repo:src/lib/desktopLyricsWindow.ts

Decision:
Show one centered line in a transparent monitor-wide window, shrinking the line to fit rather than letting it overflow.

Reason:
A centered flex item wider than its container overflows both edges and the native window hard-clips it, so the rounded capsule ends vanish.

## MC-AREA-20261021-00000204 — The desktop lyric fit is measured after the layer commits

Status: active
Scope: area:lyrics
Entry-Type: decision
Subject: MC-SUBJ-20261021-f87bc9f9
Facet: architecture
Evidence:
- repo:src/lib/desktopLyricsFit.ts

Decision:
Measure from `onLayerMounted`, fired by a layout effect depending on `layers`, not from a parent keyed on the displayed index.

Reason:
React runs layout effects child-first, so the parent measures while the DOM still holds the outgoing line.

## MC-DNU-20261021-00000205 — Searching online for an unmatched local file

Status: active
Scope: area:lyrics
Subject: MC-SUBJ-20261021-f87bc9f9
Facet: behavior
Evidence:
- repo:src/lib/lyrics/sources.ts

Rejected:
Searching cover, artist or lyrics online when playing an unmatched local file, or accepting a title-only lyric match. A title is not an identifier.
