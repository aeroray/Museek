# Memory Changelog

Entries are newest first.

## 2026-10-21

- Removed five `docs/release-notes-v3.11.*.md` files. Every bullet was word-for-word duplicated in `src/lib/whatsNew/entries.ts` (34/34 verified), the download footer is already permanent in `release.yml`'s `releaseBody`, and `generateReleaseNotes: true` writes the body on every release. Nothing referenced them.
- Moved `docs/lastfm-api-reference.md` to `src/lib/lastfm/API-REFERENCE.md`. `docs/` is the published GitHub Pages root, so an engineering protocol reference did not belong in the public site; it sits next to the code that implements it now.
- Added the Last.fm ASCII parameter-ordering trap to `areas/lastfm.md` before deleting the source file, since it was documented nowhere else.
- Added a constraint recording that `docs/` is published rather than a scratch folder, which is the rule that keeps it clean.
- Enabled the changelog module.
- Rebuilt the memory tree for Protocol 0.8. The manifest had no canonical routing sections and no `subjects.md`, so every strict read and check failed; it is now a generated-shape manifest with a stable project id and eight enabled areas.
- Split 169 root decisions and 76 rejections into eight routed areas: `playback`, `lyrics`, `sources`, `local-library`, `lastfm`, `platforms`, `desktop-shell`, `ui-system`. Root `decisions.md` went from 27,365 to ~650 tokens and `do-not-use.md` from 8,278 to ~370.
- Dropped superseded entries rather than archiving them. The 2026-08-09 desktop-lyrics geometry churn (window sizing, padding, clamping, the AMLL experiments) is represented by the four rules that still hold.
- Merged duplicates that had accumulated as separate entries: three Last.fm "what gets sent" entries, two source-dispatch entries, three quality-cache entries, and the two macOS shadow entries now that the later one supersedes the earlier.
- Rewrote the sync and permission material against the hardened code: sync auto-import disables newly discovered sources, the main window ships a real CSP, and every redirect hop is re-checked.
- Removed a privacy finding and corrected the GitHub Pages asset rule.
- Created eight Subjects and gave each a distinct Facet so `Scope + Subject + Facet` is unique. Audit went from 86 errors to zero; only near-limit budget warnings remain.
- Recorded a working rule: the CLI enforces fixed budgets regardless of what the manifest declares, so a budget line in `manifest.md` cannot silence an over-budget file. Scoped knowledge has to move into a routed area.
