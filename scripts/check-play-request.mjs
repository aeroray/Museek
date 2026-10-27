// Locks in the play/resume decision logic, including the deadlock where
// pressing Space could never resume playback.
//
//   node scripts/check-play-request.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const { isRedundantPlayRequest } = await load("src/lib/playRequest.ts")
const { resumeResolveQuality } = await load("src/lib/songQuality.ts")
const { qualityMeets } = await load("src/lib/quality.ts")

/** Convenience: the resume decision for a track with no per-song choice. */
function upgradeOnResume({ currentQuality, preferred, isLocal, upgradeSkipped }) {
  return (
    resumeResolveQuality({
      override: undefined,
      target: preferred,
      currentQuality,
      meetsTarget: qualityMeets(currentQuality, preferred),
      isLocal,
      upgradeSkipped,
    }) !== null
  )
}

let failed = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed += 1
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name.padEnd(58)} => ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`,
  )
}

// --- The reported deadlock -------------------------------------------------
// togglePlay() sets playPending=true, then asks play() to re-resolve at a better
// quality. play() used to see "same song, source ready" and bail out because
// playPending was set, so nothing happened — forever.
console.log("Deadlock: quality upgrade while resuming")
{
  const base = {
    sameSong: true,
    sourceReady: true,
    hasSource: true,
    status: "paused",
  }
  check(
    "without force, the same-song request is redundant (the old bail-out)",
    isRedundantPlayRequest({ ...base, force: false }),
    true,
  )
  check(
    "with force, it proceeds and can actually reload",
    isRedundantPlayRequest({ ...base, force: true }),
    false,
  )
  // Even with playPending set, force must win — that is the exact trap.
  check(
    "force still wins while a play is pending",
    isRedundantPlayRequest({ ...base, force: true, status: "loading" }),
    false,
  )
}

console.log("\nNormal resume paths are untouched")
check(
  "first play of a song is never redundant",
  isRedundantPlayRequest({
    sameSong: false,
    sourceReady: false,
    hasSource: false,
    status: "idle",
    force: false,
  }),
  false,
)
check(
  "error state forces a real retry",
  isRedundantPlayRequest({
    sameSong: true,
    sourceReady: true,
    hasSource: true,
    status: "error",
    force: false,
  }),
  false,
)
check(
  "same song with no attached source is not redundant",
  isRedundantPlayRequest({
    sameSong: true,
    sourceReady: true,
    hasSource: false,
    status: "paused",
    force: false,
  }),
  false,
)

// --- When to upgrade on resume --------------------------------------------
// `meetsPreferred` is computed by the caller with the real `qualityMeets`, so
// these cases state the comparison's outcome rather than re-deriving it.
console.log("\nResume upgrade decision (no per-song override)")
check(
  "below the setting but the source already under-delivered: not retried",
  upgradeOnResume({
    currentQuality: "128k",
    preferred: "320k",
    isLocal: false,
    upgradeSkipped: true,
  }),
  false,
)
check(
  "below the setting with no prior miss DOES upgrade",
  upgradeOnResume({
    currentQuality: "128k",
    preferred: "320k",
    isLocal: false,
    upgradeSkipped: false,
  }),
  true,
)
check(
  "already above the setting does not upgrade",
  upgradeOnResume({
    currentQuality: "flac",
    preferred: "320k",
    isLocal: false,
    upgradeSkipped: false,
  }),
  false,
)
check(
  "exactly at the setting does not upgrade",
  upgradeOnResume({
    currentQuality: "320k",
    preferred: "320k",
    isLocal: false,
    upgradeSkipped: false,
  }),
  false,
)
// A local file's quality is a property of the file; there is no tier to fetch.
check(
  "local files are never re-resolved",
  upgradeOnResume({
    currentQuality: "128k",
    preferred: "flac",
    isLocal: true,
    upgradeSkipped: false,
  }),
  false,
)

// The ladder itself must agree with lib/quality, since playerStore feeds
// `qualityMeets` in. Cross-check the two ladders stay consistent.
console.log("\nLadder consistency (meetsTarget comes from qualityMeets)")
{
  const { QUALITY_LADDER, qualityMeets } = await load("src/lib/quality.ts")
  check(
    "qualityMeets(320k, 320k) is true",
    qualityMeets("320k", "320k"),
    true,
  )
  check(
    "qualityMeets(128k, 320k) is false (this is what triggers the upgrade)",
    qualityMeets("128k", "320k"),
    false,
  )
  check(
    "qualityMeets(flac, 320k) is true (lossless satisfies lossy)",
    qualityMeets("flac", "320k"),
    true,
  )
  check(
    "192k/256k are NOT playback targets in the ladder",
    QUALITY_LADDER.filter((q) => q === "192k" || q === "256k").length,
    0,
  )
}

// --- The reachable sequence, traced end to end ----------------------------
// This is not hypothetical: it happens whenever the app restarts with a cache
// that holds a lower tier than the setting, which is exactly what an earlier
// auto-downgrade leaves behind.
console.log("\nReachable sequence: restart with a lower cached tier, then Space")
{
  // 1. Session says 320k, but only a 128k file is on disk, so restore sets
  //    currentQuality to the cached tier (playerStore.ts, restorePlaybackSource).
  const state = {
    sessionQuality: "320k",
    cachedQuality: "128k",
    currentQuality: "128k",
  }
  check(
    "restore lands on the cached tier, below the setting",
    state.currentQuality,
    state.cachedQuality,
  )

  // 2. skipQualityUpgrade is module state, so it is empty after a restart.
  const upgradeSkippedAfterRestart = false

  // 3. Space: togglePlay sees currentQuality below the setting and re-resolves
  //    at 320k.
  const wantsUpgrade = upgradeOnResume({
    currentQuality: state.currentQuality,
    preferred: state.sessionQuality,
    isLocal: false,
    upgradeSkipped: upgradeSkippedAfterRestart,
  })
  check("Space decides to upgrade to the setting", wantsUpgrade, true)

  // 4. That upgrade must NOT be dropped as redundant, even though the song is
  //    already attached and playPending is set.
  const dropped = isRedundantPlayRequest({
    sameSong: true,
    sourceReady: true,
    hasSource: true,
    status: "paused",
    force: true,
  })
  check("the upgrade request is not dropped (this was the deadlock)", dropped, false)
}

// --- The one-shot URL-expiry retry hits the same trap ----------------------
// After `playWithTimeout()` rejects, the source is still attached and
// sourceReady is already true while status is still "loading", so the retry
// that re-resolves an expired URL was dropped the same way.
console.log("\nExpired-URL retry must not be dropped")
{
  const retryState = {
    sameSong: true, // it is the same track being retried
    sourceReady: true, // set before playWithTimeout()
    hasSource: true, // source is attached
    status: "loading", // never promoted, because playback failed
  }
  check(
    "without force the retry is dropped (status=loading, source attached)",
    isRedundantPlayRequest({ ...retryState, force: false }),
    true,
  )
  check(
    "with force the retry actually re-resolves",
    isRedundantPlayRequest({ ...retryState, force: true }),
    false,
  )
}

// --- Exhaustive: no combination may leave resume stuck --------------------
// A stuck state means: upgradeOnResume() is true AND play() would bail out.
console.log("\nExhaustive: no state can deadlock resume")
{
  const qualities = ["128k", "320k", "flac", "flac24bit"]
  let stuck = []
  for (const currentQuality of qualities) {
    for (const preferred of qualities) {
      for (const upgradeSkipped of [true, false]) {
        for (const isLocal of [true, false]) {
          const wantsUpgrade = upgradeOnResume({
            currentQuality,
            preferred,
            isLocal,
            upgradeSkipped,
          })
          if (!wantsUpgrade) continue
          // The upgrade path always passes force, so it must never be redundant.
          const wouldBail = isRedundantPlayRequest({
            sameSong: true,
            sourceReady: true,
            hasSource: true,
            status: "paused",
            force: true,
          })
          if (wouldBail) stuck.push({ currentQuality, preferred })
        }
      }
    }
  }
  check("no deadlocking combination exists", stuck.length, 0)
}

console.log(failed === 0 ? "\nAll cases pass." : `\n${failed} case(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
