# Area: Playback

Memory here applies only when touched files or task scope match this area.

## MC-AREA-20261021-00000001 — A forced play request is never redundant

Status: active
Scope: area:playback
Entry-Type: decision
Subject: MC-SUBJ-20261021-96c635c5
Facet: behavior
Evidence:
- repo:src/lib/playRequest.ts

Decision:
`play()` takes `opts.force`, bypassing the same-song short-circuit and the same-file seek branch. Every deliberate reload must pass it.

Reason:
Without `force` the reload is dropped and playback never resumes. Keep `playPending`; it stops a double-press.

## MC-AREA-20261021-00000002 — One owner per playback failure

Status: active
Scope: area:playback
Entry-Type: decision
Subject: MC-SUBJ-20261021-96c635c5
Facet: architecture
Evidence:
- repo:src/lib/audio.ts

Decision:
The HTML element reports through `onError`; Web Audio reports only by rejecting its awaited promise. A rejected `loadPromise` is cleared so a retry re-requests.

Reason:
Reporting on both channels closed the listen session before the retry ran, logging a bogus near-zero-length play.

## MC-AREA-20261021-00000003 — A quality change touches only the audio source

Status: active
Scope: area:playback
Entry-Type: decision
Subject: MC-SUBJ-20261021-96c635c5
Facet: data-model
Evidence:
- repo:src/stores/playerStore.ts

Decision:
A quality reload keeps the cover, lyrics and duration; only quality and status change. The per-song choice is authoritative in `songQualityPrefs.json`, not on the queue item.

Reason:
Clearing them blanked the cover and snapped the seek bar to 0:00, and the queue is replaced constantly.

## MC-AREA-20261021-00000004 — The playback clock is an external store

Status: active
Scope: area:playback
Entry-Type: decision
Subject: MC-SUBJ-20261021-96c635c5
Facet: performance
Evidence:
- repo:src/lib/audio.ts

Decision:
Subscribers read a position cached at the clock boundary, published on audio events or animation frames.

Reason:
A live `currentTime` changes between React 19 snapshot reads, driving the maximum-update-depth error that blanked the macOS WebView.

## MC-AREA-20261021-00000005 — Restore the queue without blocking startup

Status: active
Scope: area:playback
Entry-Type: decision
Subject: MC-SUBJ-20261021-96c635c5
Facet: lifecycle
Evidence:
- repo:src/lib/playbackSession.ts

Decision:
Restore the queue and current song immediately; attach audio and seek only when the file is on disk. Reload lyrics in the background.

Reason:
Resolving a remote URL at startup delays the first frame.
