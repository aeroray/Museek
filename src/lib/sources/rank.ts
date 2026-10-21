import type { SourceScript } from "@/types/source"
import type { SourceProbeResult } from "./probe"

/**
 * Platform ids the radio probe can exercise, in the app's canonical order.
 * Mirrors `PLATFORM_ORDER` in `probe.ts`, duplicated here on purpose: importing
 * `probe.ts` for it would pull the whole search/runtime graph into this module
 * and make the ranking logic impossible to exercise outside a browser.
 */
const PROBE_PLATFORMS = ["wy", "kw", "kg", "tx", "mg"] as const

/**
 * Platforms this script declares AND can actually serve a play URL for.
 *
 * Same rule as `testablePlatforms()` in `probe.ts`: the platform must be in
 * `sources`, and when an action list is present it must include `musicUrl`.
 */
export function testablePlatformsFor(script: SourceScript): string[] {
  const declared = script.sources ? Object.keys(script.sources) : []
  return PROBE_PLATFORMS.filter((id) => {
    if (!declared.includes(id)) return false
    const info = script.sources?.[id]
    if (info?.actions?.length && !info.actions.includes("musicUrl")) return false
    return true
  })
}

/**
 * A source's quality score, derived from its probe result.
 *
 * The probe records one boolean per declared, testable platform: `true` when a
 * real play URL came back. A source that serves more platforms is more useful,
 * so the primary measure is how many passed.
 */
export type ProbeScore = {
  /** Platforms that returned a real URL. */
  passed: number
  /** Platforms that were actually probed (excludes ones with no catalog entry). */
  probed: number
  /** Platforms this source declares that could be probed at all. */
  testable: number
}

/**
 * Score one source, or `null` when it has no usable probe result.
 *
 * `null` means "unknown", not "bad": an untested source must not be quietly
 * ranked below one that was tested and failed every platform.
 */
export function scoreProbe(
  script: SourceScript,
  probe: SourceProbeResult | undefined,
): ProbeScore | null {
  if (!probe) return null
  const entries = Object.entries(probe.platforms)
  if (!entries.length) return null
  return {
    passed: entries.filter(([, ok]) => ok).length,
    probed: entries.length,
    testable: testablePlatformsFor(script).length,
  }
}

/**
 * True when every script that could be probed has a result.
 *
 * The "sort by quality" action is only offered in that state: a partial sort
 * would silently push untested sources to the bottom, which reads as a quality
 * verdict the user never asked for.
 */
export function allSourcesProbed(
  scripts: SourceScript[],
  probeResults: Record<string, SourceProbeResult | undefined>,
): boolean {
  if (!scripts.length) return false
  return scripts.every((s) => {
    // A source that declares no testable platform can never produce a result,
    // so it must not hold the action hostage.
    if (testablePlatformsFor(s).length === 0) return true
    return scoreProbe(s, probeResults[s.id]) !== null
  })
}

/**
 * Order sources best-first, keeping the existing relative order for ties.
 *
 * Ranking rules, in order:
 *  1. More platforms passing is better.
 *  2. At equal passes, a higher pass fraction is better (3/3 beats 3/5).
 *  3. Unprobed sources sort after every scored source, keeping their order.
 *  4. Everything else keeps its previous relative order.
 *
 * `enabled` is deliberately NOT a ranking input: list order decides dispatch
 * priority among enabled scripts, and re-ordering must not double as an
 * enable/disable action. A disabled source may legitimately rank first.
 */
export function rankSources(
  scripts: SourceScript[],
  probeResults: Record<string, SourceProbeResult | undefined>,
): SourceScript[] {
  const scored = scripts.map((script, index) => ({
    script,
    index,
    score: scoreProbe(script, probeResults[script.id]),
  }))

  scored.sort((a, b) => {
    if (a.score === null && b.score === null) return a.index - b.index
    if (a.score === null) return 1
    if (b.score === null) return -1

    if (b.score.passed !== a.score.passed) return b.score.passed - a.score.passed

    // Guard against a zero denominator: a probed source always has >= 1 entry.
    const fa = a.score.probed ? a.score.passed / a.score.probed : 0
    const fb = b.score.probed ? b.score.passed / b.score.probed : 0
    if (fb !== fa) return fb - fa

    return a.index - b.index
  })

  return scored.map((x) => x.script)
}

/** True when ranking would actually move something. */
export function rankingChangesOrder(
  scripts: SourceScript[],
  probeResults: Record<string, SourceProbeResult | undefined>,
): boolean {
  const ranked = rankSources(scripts, probeResults)
  return ranked.some((s, i) => s.id !== scripts[i].id)
}
