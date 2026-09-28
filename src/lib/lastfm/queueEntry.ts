/**
 * Re-export barrel used only by `scripts/check-lastfm-queue.mjs`.
 *
 * `queue.ts` imports `SCROBBLE_BATCH_MAX` rather than re-exporting it, so the
 * constant is surfaced here from its own module — that keeps a single source of
 * truth for Last.fm's batch limit instead of duplicating the number in a test.
 */
export * from "./queue";
export { SCROBBLE_BATCH_MAX } from "./scrobble";
