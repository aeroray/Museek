// Pins the "imported source scripts arrive disabled" guard.
//
// Enabled source scripts execute at startup via `sourceStore.loadFromDisk`, so
// any path that writes `sources.json` from an untrusted file is a
// code-execution path. The sync auto-import always had this guard; the manual
// "Import config" button did not, so a config file passed around on a forum ran
// attacker `rawScript` on the next launch behind a dialog that only mentioned
// overwriting settings.
//
// The guard now lives in `applyConfigAndReload`, which every import path funnels
// through. This check drives `disableUntrustedSources` directly and asserts the
// three cases that matter.
//
//   node scripts/check-import-source-safety.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const { disableUntrustedSources } = await load("src/lib/configIO.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

// configIO reads the device's current sources via db.readData, which falls back
// to localStorage outside Tauri.
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
}

const KNOWN_SCRIPT = "/* @name Known */\nfunction a(){}"
const OTHER_SCRIPT = "/* @name Evil */\nfunction b(){}"

function seedCurrent(sources) {
  mem.clear()
  mem.set("museek/sources.json", JSON.stringify(sources))
}

function configWith(sources) {
  return {
    app: "museek",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { "sources.json": sources },
    prefs: {},
  }
}

const enabledOf = (cfg) =>
  cfg.data["sources.json"].map((s) => (s && typeof s === "object" ? s.enabled : s))

console.log("a source this device has never run arrives disabled")
{
  seedCurrent([])
  const cfg = configWith([{ id: "new-src", rawScript: OTHER_SCRIPT, enabled: true }])
  await disableUntrustedSources(cfg)
  check("new id is disabled", enabledOf(cfg)[0] === false, JSON.stringify(enabledOf(cfg)))
  check("the script body is preserved (user can review it)", cfg.data["sources.json"][0].rawScript === OTHER_SCRIPT)
}

console.log("\na source whose script text changed arrives disabled")
{
  seedCurrent([{ id: "src-1", rawScript: KNOWN_SCRIPT, enabled: true }])
  const cfg = configWith([{ id: "src-1", rawScript: OTHER_SCRIPT, enabled: true }])
  await disableUntrustedSources(cfg)
  check(
    "same id with different script is disabled (the injection case)",
    enabledOf(cfg)[0] === false,
    JSON.stringify(enabledOf(cfg)),
  )
}

console.log("\na source this device already runs keeps its state")
{
  seedCurrent([{ id: "src-1", rawScript: KNOWN_SCRIPT, enabled: true }])
  const cfg = configWith([{ id: "src-1", rawScript: KNOWN_SCRIPT, enabled: true }])
  await disableUntrustedSources(cfg)
  check("unchanged trusted source stays enabled", enabledOf(cfg)[0] === true, JSON.stringify(enabledOf(cfg)))
}

console.log("\na mixed import only disables the untrusted part")
{
  seedCurrent([{ id: "src-1", rawScript: KNOWN_SCRIPT, enabled: true }])
  const cfg = configWith([
    { id: "src-1", rawScript: KNOWN_SCRIPT, enabled: true },
    { id: "src-2", rawScript: OTHER_SCRIPT, enabled: true },
    { id: "src-1", rawScript: OTHER_SCRIPT, enabled: true },
  ])
  await disableUntrustedSources(cfg)
  check(
    "trusted / new / tampered => enabled, disabled, disabled",
    JSON.stringify(enabledOf(cfg)) === "[true,false,false]",
    JSON.stringify(enabledOf(cfg)),
  )
}

console.log("\nmalformed input does not throw")
{
  seedCurrent([])
  const noSources = { app: "museek", version: 1, exportedAt: "", data: {}, prefs: {} }
  await disableUntrustedSources(noSources)
  check("absent sources.json is a no-op", true)

  const junk = configWith([null, 42, "string", { id: "x" }])
  await disableUntrustedSources(junk)
  check("non-object entries pass through untouched", junk.data["sources.json"][0] === null)
  check(
    "an entry with an id but no body is disabled",
    junk.data["sources.json"][3].enabled === false,
    JSON.stringify(junk.data["sources.json"][3]),
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Import source-safety checks passed.")
