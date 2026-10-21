# Area: Lastfm

Memory here applies only when touched files or task scope match this area.

## MC-AREA-20261021-00000401 — Scrobbling is driven by the listening store

Status: active
Scope: area:lastfm
Entry-Type: decision
Subject: MC-SUBJ-20261021-f445aedf
Facet: architecture
Evidence:
- repo:src/stores/listeningStore.ts

Decision:
`reportNowPlaying` and `reportListenEnded` are called from the listening store, never from `playerStore`. `finish()` is the one place a session closes.

Reason:
The player has five `listenFinish(false)` call sites, so hooking there duplicates the logic and a skipped track never scrobbles.

## MC-AREA-20261021-00000402 — Identity quality decides what is sent

Status: active
Scope: area:lastfm
Entry-Type: decision
Subject: MC-SUBJ-20261021-f445aedf
Facet: behavior
Evidence:
- repo:src/lib/lastfm/scrobble.ts

Decision:
`scrobbleIdentity` resolves artist and title catalog-first. Never gate on "was this local file matched".

Reason:
Filename mode keeps the basename, so a matched file scrobbled as `01 - 冷冰冰`, while a well-tagged unmatched file has a good identity.

## MC-AREA-20261021-00000403 — Errors are classified, never lumped together

Status: active
Scope: area:lastfm
Entry-Type: decision
Subject: MC-SUBJ-20261021-f445aedf
Facet: compatibility
Evidence:
- repo:src/lib/lastfm/client.ts

Decision:
Errors 9 and 26 clear the session and ask to reconnect, keeping the queue; 8, 11, 16 and 29 back off. Inspect the body, since most failures arrive as HTTP 200.

Reason:
Conflating them retries forever against a dead session or discards a working one over a rate limit.

## MC-AREA-20261021-00000404 — The session and pending queue are persisted

Status: active
Scope: area:lastfm
Entry-Type: decision
Subject: MC-SUBJ-20261021-f445aedf
Facet: data-model
Evidence:
- repo:src/stores/lastfmStore.ts

Decision:
Queue scrobbles to `lastfm.json` and remove them only once settled. Never add that file to `configIO`'s `DB_FILES`.

Reason:
A scrobble records something that already happened, and keeping the file out of `DB_FILES` stops an export carrying credentials.

## MC-DNU-20261021-00000405 — Retrying an auth error, or bundling a shared secret

Status: active
Scope: area:lastfm
Subject: MC-SUBJ-20261021-f445aedf
Facet: security
Evidence:
- repo:src/lib/lastfm/api.ts

Rejected:
Retrying authentication errors, logging out over a transient one, or committing a shared API secret. The signature needs the secret client-side, so a bundled one is extractable from every install.
