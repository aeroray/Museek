# Constraints

## MC-CON-20261021-00000001 — Never bundle, host, or distribute music content

Status: active
Scope: project
Subject: MC-SUBJ-20261021-a9a8ce03
Facet: security
Evidence:
- repo:docs/memory/brief.md

Constraint:
Playback and download URLs come only from user-supplied lx-music-compatible scripts. The repository must not ship, host, proxy, or mirror audio or a bundled source script.

## MC-CON-20261021-00000002 — Keep every user-facing string bilingual

Status: active
Scope: project
Subject: MC-SUBJ-20261021-74863a9e
Facet: compatibility
Evidence:
- repo:src/lib/i18n.ts

Constraint:
All copy is localized in English and Simplified Chinese through `src/lib/i18n.ts`. A key with only one language is incomplete.

## MC-CON-20261021-00000003 — Preserve cross-platform Tauri 2 behavior

Status: active
Scope: project
Subject: MC-SUBJ-20261021-f25fea31
Facet: behavior
Evidence:
- repo:src-tauri/tauri.conf.json

Constraint:
Windows and macOS (Apple Silicon) are both first-class. A fix verified on one must not regress the other; platform-specific code belongs behind `cfg(...)` or a runtime capability check.

## MC-CON-20261021-00000004 — `docs/` is the published GitHub Pages root

Status: active
Scope: project
Subject: MC-SUBJ-20261021-74863a9e
Facet: security
Evidence:
- repo:docs/memory/brief.md

Constraint:
`docs/` is served publicly at `aeroray.github.io/Museek`, so whatever is committed there is public. It holds site assets (`index.html`, `app-icon.svg`, `screenshots/`, `gzh/`) plus memory only. Landing images live under `docs/`, never `../public/`; engineering notes belong in `src/`.

