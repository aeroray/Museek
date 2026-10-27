// Proves "sort by quality" ranks source scripts by their probe result.
//
// The action is offered only once every testable source has a result, and it
// must never double as an enable/disable action: ordering decides dispatch
// priority among enabled scripts, so a disabled source that works everywhere
// still belongs at the top.
//
// Drives the REAL rankSources()/allSourcesProbed() from src/lib/sources/rank.ts.
//
//   node scripts/check-source-quality-sort.mjs
import { createRequire } from "node:module"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const root = resolve(import.meta.dirname, "..")
const require = createRequire(join(root, "package.json"))

function esbuildEntry() {
  try {
    return require.resolve("esbuild/lib/main.js", { paths: [root] })
  } catch {}
  const dir = readdirSync(join(root, "node_modules", ".pnpm")).find((d) =>
    d.startsWith("esbuild@"),
  )
  if (!dir) throw new Error("esbuild not found")
  return join(root, "node_modules", ".pnpm", dir, "node_modules", "esbuild", "lib", "main.js")
}

const outDir = mkdtempSync(join(tmpdir(), "museek-sort-"))
const outFile = join(outDir, "rank.mjs")

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
}

let failures = 0
const check = (name, cond) => {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    console.log(`  FAIL ${name}`)
    failures++
  }
}

const esbuild = await import(pathToFileURL(esbuildEntry()).href)
await esbuild.build({
  entryPoints: [join(root, "src/lib/sources/rank.ts")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  logLevel: "silent",
})

const { allSourcesProbed, rankSources, rankingChangesOrder, scoreProbe } = await import(
  pathToFileURL(outFile).href
)

// Minimal SourceScript stand-ins. `sources` drives testablePlatforms(), which
// only counts a platform that is declared AND has musicUrl in its actions.
const script = (id, platforms, extra = {}) => ({
  id,
  name: id,
  enabled: true,
  rawScript: "",
  sources: Object.fromEntries(
    platforms.map((p) => [p, { actions: ["musicUrl"], qualitys: ["128k"] }]),
  ),
  ...extra,
})

const A = script("A", ["wy", "kw", "kg"]) // 3 testable
const B = script("B", ["wy", "kw"]) // 2 testable
const C = script("C", ["wy"]) // 1 testable
const D = script("D", ["wy"]) // 1 testable, unprobed later

console.log("scoreProbe")
check(
  "counts passes and probed entries",
  JSON.stringify(scoreProbe(A, { platforms: { wy: true, kw: false, kg: true } })) ===
    JSON.stringify({ passed: 2, probed: 3, testable: 3 }),
)
check("no probe result scores null", scoreProbe(A, undefined) === null)
check("empty platform map scores null", scoreProbe(A, { platforms: {} }) === null)

console.log("\nallSourcesProbed")
const full = { A: { platforms: { wy: true, kw: true, kg: true } }, B: { platforms: { wy: true, kw: false } }, C: { platforms: { wy: true } } }
check("true when every script has a result", allSourcesProbed([A, B, C], full) === true)
check(
  "false when one script is unprobed",
  allSourcesProbed([A, B, C], { A: full.A, B: full.B }) === false,
)
check("false for an empty list", allSourcesProbed([], {}) === false)
const noPlatforms = script("N", [])
check(
  "a script with no testable platform does not block the action",
  allSourcesProbed([A, noPlatforms], { A: full.A }) === true,
)

console.log("\nrankSources — ordered by passes")
// C=1, D=2, A=0 => D, C, A
const probes1 = {
  A: { platforms: { wy: false, kw: false, kg: false } },
  C: { platforms: { wy: true } },
  D: { platforms: { wy: true, kw: true } },
}
const r1 = rankSources([A, C, D], probes1).map((s) => s.id)
check(`best first (got ${r1.join(",")})`, r1.join(",") === "D,C,A")

console.log("\nrankSources — fraction breaks a tie on passes")
// X: 2/4 = .5 ; Y: 2/2 = 1 -> Y first
const X = script("X", ["wy", "kw", "kg", "tx"])
const Y = script("Y", ["wy", "kw"])
const r2 = rankSources([X, Y], {
  X: { platforms: { wy: true, kw: true, kg: false, tx: false } },
  Y: { platforms: { wy: true, kw: true } },
}).map((s) => s.id)
check(`higher pass fraction wins (got ${r2.join(",")})`, r2.join(",") === "Y,X")

console.log("\nrankSources — unprobed sorts last, keeps its order")
const probes3 = { A: { platforms: { wy: true } } }
const r3 = rankSources([D, A, C], probes3).map((s) => s.id)
check(`scored first, unprobed after (got ${r3.join(",")})`, r3.join(",") === "A,D,C")

console.log("\nrankSources — stable for equal scores")
const E = script("E", ["wy"])
const F = script("F", ["wy"])
const r4 = rankSources([E, F], { E: { platforms: { wy: true } }, F: { platforms: { wy: true } } }).map((s) => s.id)
check(`ties keep input order (got ${r4.join(",")})`, r4.join(",") === "E,F")

console.log("\nrankSources — enabled is not a ranking input")
const disabledBest = script("BEST", ["wy", "kw", "kg"], { enabled: false })
const enabledWorst = script("WORST", ["wy"], { enabled: true })
const r5 = rankSources([enabledWorst, disabledBest], {
  BEST: { platforms: { wy: true, kw: true, kg: true } },
  WORST: { platforms: { wy: false } },
})
check(`a disabled source can rank first (got ${r5.map((s) => s.id).join(",")})`, r5[0].id === "BEST")
check("sorting does not change enabled flags", r5[0].enabled === false && r5[1].enabled === true)

console.log("\nrankSources — does not mutate its input")
const input = [A, C, D]
const snapshot = input.map((s) => s.id).join(",")
rankSources(input, probes1)
check("input array untouched", input.map((s) => s.id).join(",") === snapshot)

console.log("\nrankingChangesOrder")
check("false when already best-first", rankingChangesOrder([D, C, A], probes1) === false)
check("true when a change is needed", rankingChangesOrder([A, C, D], probes1) === true)

rmSync(outDir, { recursive: true, force: true })

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("All source quality-sort checks passed.")