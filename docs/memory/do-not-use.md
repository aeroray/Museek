# Do Not Use / Tombstones

Tombstones are newest first.

## MC-DNU-20261021-00000001 — Letting an unmapped error string reach the user

Status: active
Scope: project
Subject: MC-SUBJ-20261021-96c635c5
Facet: interface
Evidence:
- repo:src/lib/playError.ts

Rejected:
Letting an unmapped engine or DOM error fall through to `player.failedDetail`, which renders raw English inside localized copy. Add a branch to `playError.ts` for every new error shape.

## MC-DNU-20261021-00000002 — Trusting a persisted "playing: true" after a restart

Status: active
Scope: project
Subject: MC-SUBJ-20261021-f445aedf
Facet: lifecycle
Evidence:
- repo:src/stores/listeningStore.ts

Rejected:
Keeping `playing: true` from the run that wrote a session. Force it false on read, or a restart counts as an in-progress listen while the user has pressed nothing.

## MC-DNU-20261021-00000003 — Asserting the settled value of a self-correcting loop

Status: active
Scope: project
Subject: MC-SUBJ-20261021-74863a9e
Facet: adoption-policy
Evidence:
- repo:scripts/check-infinite-scroll.mjs

Rejected:
Asserting the final DOM state of something a poll corrects within a tick. Observe transitions instead, and confirm a reverted injection still builds, or the check passes vacuously.

## MC-DNU-20261021-00000004 — Raising a memory budget to silence the audit

Status: active
Scope: project
Subject: MC-SUBJ-20261021-74863a9e
Facet: behavior
Evidence:
- repo:docs/memory/manifest.md

Rejected:
Raising a budget in the manifest to make `status` pass. The CLI enforces its own limits, so the file still reports over budget; move scoped knowledge into a routed `areas/` file instead.
