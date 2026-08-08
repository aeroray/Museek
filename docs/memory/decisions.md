# Confirmed Decisions

## 2026-08-08 - Delegate playback to imported source scripts

Decision:
Museek obtains playback data from user-imported lx-music-compatible source scripts rather than bundling music sources.
Reason:
This preserves the app's aggregator role and keeps source ownership with the user.

## 2026-08-08 - Keep platform entry points thin

Decision:
Platform-specific agent files point to `docs/memory/manifest.md` and `brief.md` instead of copying project memory.
Reason:
A single routing authority keeps every agent aligned and context small.
