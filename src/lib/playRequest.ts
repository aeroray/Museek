/**
 * Decisions about a play request, kept pure so the interactions between the
 * player, the quality setting and the queue can be checked without booting a
 * browser or the stores.
 *
 * Imports are type-only on purpose: that keeps the module loadable by plain
 * node, where the `@/` alias does not resolve. Quality comparison is passed in
 * rather than recomputed here, so the ladder in `lib/quality` stays the single
 * source of truth.
 */

import type { PlayerStatus } from "@/types/player";

/**
 * Can `play()` return immediately because the requested song is already loaded?
 *
 * `force` always wins, and that escape hatch is load-bearing. A caller that
 * deliberately wants to reload the track that is already attached — to change
 * its quality — looked like a redundant request and silently did nothing.
 * Because `togglePlay` sets `playPending` before calling `play()`, and the
 * short-circuit also bails while `playPending` is set, the no-op was permanent:
 * every press re-entered the identical branch, so playback could never resume.
 */
export function isRedundantPlayRequest(opts: {
  sameSong: boolean;
  sourceReady: boolean;
  hasSource: boolean;
  status: PlayerStatus;
  force: boolean;
}): boolean {
  if (opts.force) return false;
  return (
    opts.sameSong &&
    opts.sourceReady &&
    opts.hasSource &&
    opts.status !== "error"
  );
}
