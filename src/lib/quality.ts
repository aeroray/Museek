import type { Quality, MusicInfo, MusicQuality, MusicInfoMeta } from "@/types/music"

// Quality from best to worst. Auto-downgrade walks down this ladder.
export const QUALITY_LADDER: Quality[] = ["flac24bit", "flac", "320k", "128k"]

// Short labels for compact UI (e.g. the player bar badge).
export const QUALITY_SHORT: Record<Quality, string> = {
  "128k": "128K",
  "320k": "320K",
  flac: "FLAC",
  flac24bit: "Hi-Res",
}

/**
 * The ordered list of qualities to attempt for playback, starting at the
 * preferred quality and stepping DOWN the ladder.
 *
 * We deliberately DON'T restrict this to the qualities the song's metadata
 * advertises. Some metadata under-reports what's actually playable — most
 * notably NetEase's anonymous `song/detail` caps `maxbr` for VIP/copyright
 * songs, so a playlist song looks like 128k-only even though the source script
 * can fetch lossless (which is why searching the same song plays hi-fi). The
 * adaptive caller walks this list until a source returns a URL, so genuinely
 * unavailable steps simply fall through to the next.
 */
export function qualityCandidates(preferred: Quality): Quality[] {
  const start = QUALITY_LADDER.indexOf(preferred)
  return QUALITY_LADDER.slice(start < 0 ? 0 : start)
}

function qualityIndex(q: Quality): number {
  const i = QUALITY_LADDER.indexOf(q)
  return i < 0 ? QUALITY_LADDER.length : i
}

/** True when `have` is the preferred tier or better (FLAC satisfies 320k). */
export function qualityMeets(have: Quality, preferred: Quality): boolean {
  return qualityIndex(have) <= qualityIndex(preferred)
}

/** Preferred-and-down, excluding `cached` and anything worse. Empty if nothing higher exists. */
export function qualityUpgradeCandidates(
  preferred: Quality,
  cached: Quality,
): Quality[] {
  const floor = qualityIndex(cached)
  return qualityCandidates(preferred).filter((q) => qualityIndex(q) < floor)
}

/** The highest quality a song advertises (tiers are hierarchical, so this is the
 *  ceiling). Returns null if the song lists none. */
export function bestQuality(song: MusicInfo): Quality | null {
  const available = new Set(song.meta.qualitys.map((q) => q.type))
  return QUALITY_LADDER.find((q) => available.has(q)) ?? null
}

/** Build the `_qualitys` size map used by lx-music scripts and VIP size probes. */
export function indexQualitySizes(qualitys: MusicQuality[]): MusicInfoMeta["_qualitys"] {
  const _qualitys: MusicInfoMeta["_qualitys"] = {}
  for (const q of qualitys) _qualitys[q.type] = { size: q.size }
  return _qualitys
}
