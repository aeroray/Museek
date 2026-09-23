/**
 * How a track's playback quality is decided when the user may have set one for
 * this song only.
 *
 * Kept pure and import-free so plain node can exercise it.
 */

import type { Quality } from "@/types/music";

/**
 * The quality to request for a track: its own choice if it has one, else the
 * global default.
 */
export function resolveTargetQuality(
  override: Quality | undefined,
  defaultQuality: Quality,
): Quality {
  return override ?? defaultQuality;
}

/**
 * What to store as a track's per-song choice after the user picks `picked`.
 *
 * Returns `undefined` when the pick coincides with the current default, meaning
 * "no override" rather than "an override that happens to equal the default".
 *
 * The distinction is the whole point: a stored override outlives a later change
 * to the default. A track set back to 320k would stay pinned to 320k after the
 * user switched their default to FLAC — behaving unlike every other song, which
 * is exactly what the user was trying to avoid. Normalising here, at the moment
 * of the choice, is what makes "set it back to the default" mean "this song was
 * never touched".
 */
export function nextQualityOverride(
  picked: Quality,
  defaultQuality: Quality,
): Quality | undefined {
  return picked === defaultQuality ? undefined : picked;
}

/**
 * The quality to re-resolve at when playback resumes, or null to just continue
 * with what is loaded.
 *
 * Two different rules apply, which is why this is one function rather than a
 * flag:
 *
 * - No override: only a *shortfall* is worth a round trip. A tier already at or
 *   above the default is left alone — the user is hearing something at least as
 *   good as they asked for.
 * - With an override: any difference counts, in *either* direction. Picking
 *   128K while a cached FLAC is loaded has to take effect, and that is not an
 *   upgrade the ladder can express, so the "at or above" shortcut must not apply.
 *
 * `upgradeSkipped` is the same "once per source layout" guard the default path
 * uses, so a source that cannot deliver the target is not retried forever.
 */
export function resumeResolveQuality(opts: {
  override: Quality | undefined;
  target: Quality;
  currentQuality: Quality;
  /** `qualityMeets(currentQuality, target)` — the caller owns the ladder. */
  meetsTarget: boolean;
  isLocal: boolean;
  upgradeSkipped: boolean;
}): Quality | null {
  if (opts.isLocal) return null;
  if (opts.currentQuality === opts.target) return null;
  if (opts.upgradeSkipped) return null;
  // Only the default path may treat "better than asked" as good enough.
  if (!opts.override && opts.meetsTarget) return null;
  return opts.target;
}
