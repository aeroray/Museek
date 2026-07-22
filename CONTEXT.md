# Museek domain glossary

Terms used by architecture reviews and refactors. Prefer these names in code comments and module paths.

| Term | Meaning |
|------|---------|
| **Song category** | One label on a track (local or favorite song). Playlists are not categorized. |
| **Playback clock** | Authoritative currentTime stream from the audio element (coarse `timeupdate` + smooth subscribe). |
| **Source script** | User-imported lx-music–compatible script providing musicUrl / lyric / pic. |
| **Source registry** | Seam between persisted scripts and the runtime runner. |
| **Lyrics** | Load → parse LRC → active line from time → fullscreen chrome. |
| **Local library** | Device-local tracks + categories (not synced). |
| **Favorites** | Synced liked songs / playlists; song categories sync with playlists.json. |
| **Platform SDK** | Per-source (wy / kg / tx / mg / kw) search, charts, playlists, hot-search helpers. |
