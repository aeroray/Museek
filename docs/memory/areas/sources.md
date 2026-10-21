# Area: Sources

Memory here applies only when touched files or task scope match this area.

## MC-AREA-20261021-00000101 — Source scripts run in a locked sandbox

Status: active
Scope: area:sources
Entry-Type: decision
Subject: MC-SUBJ-20261021-a9a8ce03
Facet: lifecycle
Evidence:
- repo:src/lib/sources/sourceWorker.ts

Decision:
Each script runs in a Dedicated Worker with network stubs locked and nested `Worker`/`SharedWorker` banned. `lx.request` is the only network path.

Reason:
A nested worker is a fresh scope with no stubs, and a writable stub can be deleted by the script it constrains.

## MC-AREA-20261021-00000102 — Every redirect hop is re-checked

Status: active
Scope: area:sources
Entry-Type: decision
Subject: MC-SUBJ-20261021-a9a8ce03
Facet: behavior
Evidence:
- repo:src/lib/sources/sourceWorkerHost.ts

Decision:
`fetchChecked` disables automatic redirects and follows up to five hops manually, re-running `assertAllowedSourceUrl` on each.

Reason:
A public URL could otherwise 302 into loopback or a private host, since the allowlist only saw the first request.

## MC-AREA-20261021-00000103 — Dispatch only to scripts that declare the platform

Status: active
Scope: area:sources
Entry-Type: decision
Subject: MC-SUBJ-20261021-a9a8ce03
Facet: performance
Evidence:
- repo:src/lib/sourceRunner.ts

Decision:
Ask only scripts whose `sources` declares the song's platform and action, plus scripts declaring no `sources` at all. Never fall back to every enabled script.

Reason:
A script asked about a platform it does not serve resolves the id by name on its own service and answers with a different recording.

## MC-AREA-20261021-00000104 — The main window is narrowly permissioned

Status: active
Scope: area:sources
Entry-Type: decision
Subject: MC-SUBJ-20261021-a9a8ce03
Facet: compatibility
Evidence:
- repo:src-tauri/capabilities/default.json

Decision:
Ship an explicit CSP without `unsafe-inline`, fs and asset scopes limited to user directories plus known extensions, and a runtime grant for chosen paths.

Reason:
An empty CSP and a `**` fs scope let injected script reach the whole disk; the grant keeps off-drive libraries working.

## MC-DNU-20261021-00000105 — Re-running a failed Worker source in the main window

Status: active
Scope: area:sources
Subject: MC-SUBJ-20261021-a9a8ce03
Facet: interface
Evidence:
- repo:src/lib/sources/sourceWorkerHost.ts

Rejected:
Falling back to `new Function` on the main WebView when a Worker source fails, or adding a "try every source anyway" dispatch fallback. Both run untrusted script or silently play the wrong recording.
