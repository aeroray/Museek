// Drives the REAL sourceStore.importBundle, because that is the risky part of
// restoring a bundle: it rebuilds the whole script list, so a mistake can
// reorder, duplicate or silently delete sources.
//
// Pins the merge contract:
//  - bundled order is restored as the dispatch priority
//  - a source already present is updated in place, not duplicated
//  - sources NOT in the bundle survive, after the restored ones
//  - a disabled bundled source comes back disabled
//
//   node scripts/check-source-bundle-store.mjs
import { createRequire } from "node:module"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
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

const outDir = mkdtempSync(join(tmpdir(), "museek-bstore-"))
const outFile = join(outDir, "store.mjs")

// The store touches localStorage and the Tauri fs bridge at import time. Give it
// inert stand-ins so it runs headless: persistence becomes a no-op, and the
// source runner is replaced below so no Worker is ever started.
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
}

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

const esbuild = await import(pathToFileURL(esbuildEntry()).href)

// Stub the Tauri-backed IO layer and the search/HTTP graph the store reaches
// transitively. `platform: "node"` keeps the CommonJS crypto deps (js-md5 via
// the lx API) resolvable; without it the bundle cannot link.
const stubDb = join(outDir, "db-stub.ts")
writeFileSync(
  stubDb,
  `export async function readData(_f, fallback) { return fallback }
export async function writeData() {}
export async function writeDataCompact() {}
`,
)
const stubSources = join(outDir, "sources-stub.ts")
writeFileSync(
  stubSources,
  `export const sourceRunner = {
  setScripts() {},
  isLoaded() { return false },
  async loadScript() { return null },
  unloadScript() {},
  async probeMusicUrl() { return false },
}
export async function loadSourceScripts() { return [] }
export function saveSourceScripts() {}
export async function loadSourceProbeResults() { return {} }
export function saveSourceProbeResults() {}
`,
)

await esbuild.build({
  entryPoints: [join(root, "src/stores/sourceStore.ts")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "node",
  mainFields: ["module", "main"],
  logLevel: "silent",
  alias: {
    "@": join(root, "src"),
    "@/lib/db": stubDb,
    // Stub only the exact persistence/runner module — aliasing the whole
    // "@/lib/sources" prefix would also capture "@/lib/sources/rank".
    "@/lib/sources/index": stubSources,
    "@/lib/sources/persist": stubSources,
    "@/lib/sourceRunner": stubSources,
  },
  external: ["@tauri-apps/api/*", "@tauri-apps/plugin-*"],
  // The bundle reaches CommonJS deps (js-md5 via the lx API); ESM output needs a
  // real `require` for those.
  banner: {
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
})

const { useSourceStore } = await import(pathToFileURL(outFile).href)

// Silence the runner: importBundle starts enabled scripts in the background.
const store = useSourceStore
store.setState({
  scripts: [],
  probeResults: {},
  isLoading: false,
  error: null,
})

const mk = (name, enabled = true, extra = {}) => ({
  name,
  version: "1",
  author: "",
  description: "",
  rawScript: `/*! @name ${name} */\n1`,
  enabled,
  ...extra,
})

console.log("importBundle — fresh install")
let r = store.getState().importBundle([mk("A"), mk("B"), mk("C")])
check(`added 3 (got ${JSON.stringify(r)})`, r.added === 3 && r.updated === 0)
check("order preserved", store.getState().scripts.map((s) => s.name).join(",") === "A,B,C")
check("all enabled counted", r.enabled === 3)

console.log("\nimportBundle — same bundle again dedupes")
const idsBefore = store.getState().scripts.map((s) => s.id).join(",")
r = store.getState().importBundle([mk("A"), mk("B"), mk("C")])
check(`updated 3, added 0 (got ${JSON.stringify(r)})`, r.updated === 3 && r.added === 0)
check("no duplicates", store.getState().scripts.length === 3)
check("ids reused", store.getState().scripts.map((s) => s.id).join(",") === idsBefore)

console.log("\nimportBundle — respects the bundled disabled flag")
r = store.getState().importBundle([mk("A", false)])
check("disabled source stays disabled", store.getState().scripts.find((s) => s.name === "A").enabled === false)
check("enabled count reflects it", r.enabled === 0)

console.log("\nimportBundle — a source outside the bundle survives")
store.setState({
  scripts: [
    ...store.getState().scripts,
    {
      id: "keep-me",
      name: "Unbundled",
      version: "9",
      author: "",
      description: "",
      rawScript: "/*! @name Unbundled */\nkeep",
      enabled: true,
    },
  ],
})
r = store.getState().importBundle([mk("X"), mk("Y")])
const names = store.getState().scripts.map((s) => s.name)
check(`bundle restored first, remainder kept (got ${names.join(",")})`, names.join(",") === "X,Y,A,B,C,Unbundled")
check("the untouched source is still present", names.includes("Unbundled"))
check("it keeps its id", store.getState().scripts.find((s) => s.name === "Unbundled").id === "keep-me")

console.log("\nimportBundle — dedupes by url even if the body changed")
store.setState({
  scripts: [
    {
      id: "url-id",
      name: "Old",
      version: "1",
      author: "",
      description: "",
      rawScript: "/*! @name Old */\nold body",
      enabled: true,
      url: "local:C:\\x\\same.js",
    },
  ],
})
r = store.getState().importBundle([
  mk("New", true, { url: "local:C:\\x\\same.js", rawScript: "/*! @name New */\nnew body" }),
])
check("matched by url, not duplicated", store.getState().scripts.filter((s) => s.url === "local:C:\\x\\same.js").length === 1)
check("body replaced", store.getState().scripts.find((s) => s.url).rawScript.includes("new body"))
check("id reused", store.getState().scripts.find((s) => s.url).id === "url-id")

console.log("\nimportBundle — url-less duplicate matches on body")
store.setState({
  scripts: [
    {
      id: "body-id",
      name: "Same",
      version: "1",
      author: "",
      description: "",
      rawScript: "/*! @name Same */\nexact",
      enabled: true,
    },
  ],
})
r = store.getState().importBundle([mk("Same", true, { rawScript: "/*! @name Same */\nexact" })])
check("matched by body, not duplicated", store.getState().scripts.length === 1)
check("counted as updated", r.updated === 1 && r.added === 0)

rmSync(outDir, { recursive: true, force: true })

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("All source-bundle store checks passed.")
