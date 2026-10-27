// Locks in the per-song quality rules, especially the "set it back to the
// default and it becomes an ordinary song again" behaviour.
//
//   node scripts/check-song-quality.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const { nextQualityOverride, resolveTargetQuality, resumeResolveQuality } = await load(
  "src/lib/songQuality.ts",
)
const { qualityMeets } = await load("src/lib/quality.ts")

let failed = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed += 1
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name.padEnd(60)} => ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`,
  )
}

const D = "320k" // the user's default, matching the reported scenario

console.log("The reported scenario: default 320K, try FLAC, then back to 320K")
{
  // 1. User sets FLAC for this one song.
  const afterFlac = nextQualityOverride("flac", D)
  check("choosing FLAC stores an override", afterFlac, "flac")
  check("that override drives playback", resolveTargetQuality(afterFlac, D), "flac")

  // 2. User changes their mind and picks 320K again, which IS the default.
  const afterBack = nextQualityOverride("320k", D)
  check(
    "choosing the default clears the override (no longer special)",
    afterBack,
    undefined,
  )
  check(
    "the track now resolves like any other song",
    resolveTargetQuality(afterBack, D),
    D,
  )
}

console.log("\nWhy normalising at choice time matters, not at play time")
{
  // The decisive case: the default changes AFTER the track was set back.
  const stored = nextQualityOverride("320k", D) // undefined, normalised now
  const newDefault = "flac"
  check(
    "a track set back to the default follows a later default change",
    resolveTargetQuality(stored, newDefault),
    "flac",
  )
  // If we had stored "320k" instead, it would stay pinned and behave unlike
  // every other song — the exact thing the normalisation avoids.
  const ifWeHadKeptIt = "320k"
  check(
    "keeping it would have pinned the track (the behaviour we avoid)",
    resolveTargetQuality(ifWeHadKeptIt, newDefault),
    "320k",
  )
}

console.log("\nChoosing a non-default tier is a real override")
for (const q of ["128k", "flac", "flac24bit"]) {
  check(
    `${q} differs from the default and is stored`,
    nextQualityOverride(q, D),
    q,
  )
}

console.log("\nResume re-resolution")
{
  const base = { isLocal: false, upgradeSkipped: false }
  // An override must be able to move playback DOWN, which is not an "upgrade".
  check(
    "override 128k with FLAC loaded re-resolves downward",
    resumeResolveQuality({
      ...base,
      override: "128k",
      target: "128k",
      currentQuality: "flac",
      meetsTarget: true, // FLAC "meets" 128k, yet must still be replaced
    }),
    "128k",
  )
  check(
    "override satisfied by the loaded tier does nothing",
    resumeResolveQuality({
      ...base,
      override: "128k",
      target: "128k",
      currentQuality: "128k",
      meetsTarget: true,
    }),
    null,
  )
  // The default path keeps its old behaviour: better-than-asked is fine.
  check(
    "no override, already above the default: left alone",
    resumeResolveQuality({
      ...base,
      override: undefined,
      target: D,
      currentQuality: "flac",
      meetsTarget: true,
    }),
    null,
  )
  check(
    "no override, below the default: upgrades",
    resumeResolveQuality({
      ...base,
      override: undefined,
      target: D,
      currentQuality: "128k",
      meetsTarget: qualityMeets("128k", D),
    }),
    D,
  )
  check(
    "a skipped upgrade is not retried",
    resumeResolveQuality({
      ...base,
      upgradeSkipped: true,
      override: "flac",
      target: "flac",
      currentQuality: "320k",
      meetsTarget: true,
    }),
    null,
  )
  check(
    "local files are never re-resolved",
    resumeResolveQuality({
      ...base,
      isLocal: true,
      override: "flac",
      target: "flac",
      currentQuality: "320k",
      meetsTarget: true,
    }),
    null,
  )
}

console.log("\nOnly ladder tiers may be offered as a target")
{
  const { QUALITY_LADDER } = await load("src/lib/quality.ts")
  check(
    "192k is not a selectable playback tier",
    QUALITY_LADDER.includes("192k"),
    false,
  )
  check(
    "256k is not a selectable playback tier",
    QUALITY_LADDER.includes("256k"),
    false,
  )
  check(
    "the menu offers exactly the ladder",
    [...QUALITY_LADDER],
    ["flac24bit", "flac", "320k", "128k"],
  )
}

console.log(failed === 0 ? "\nAll cases pass." : `\n${failed} case(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
