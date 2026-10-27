// Proves the source bundle round-trips: export every source to one .js file,
// then import that file back through the normal source-import channel.
//
// The bundle must be a real `.js` file because source import only accepts `.js`
// (picker filter, drag-drop path filter, HTML5 drop filter). It also must not
// delimit its payload with a comment: source scripts carry their own block
// header, so the first closing delimiter inside a bundled script would truncate
// the JSON — this is the case the harness pins hardest.
//
//   node scripts/check-source-bundle.mjs
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

const outDir = mkdtempSync(join(tmpdir(), "museek-bundle-"))
const outFile = join(outDir, "bundle.mjs")

let failures = 0
const check = (name, cond) => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}`)
    failures++
  }
}

const esbuild = await import(pathToFileURL(esbuildEntry()).href)
await esbuild.build({
  entryPoints: [join(root, "src/lib/sources/bundle.ts")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  logLevel: "silent",
})

const { buildSourceBundle, parseSourceBundle, looksLikeSourceBundle, bundleFileName } =
  await import(pathToFileURL(outFile).href)

// A script body containing every delimiter that could break naive parsing:
// block-comment open/close, braces, brackets, quotes, backticks, escapes.
const nastyBody = `/*!
 * @name Nasty
 * @description has */ and { braces } and "quotes" and 'single' and \`ticks\`
 */
const x = { a: { b: [1, 2, { c: "}" }] }; // closing brace inside a string
globalThis.lx = { EVENT_NAMES: {}, request: async () => ({}) };`

// A body whose FIRST characters end the JSON string early for any parser that
// counts braces without tracking string literals. `}` immediately inside a
// string is the case a naive scanner gets wrong.
const braceInString = `/*! @name Brace */\nconst s = "}";\nconst t = { x: 1 };`

const scripts = [
  {
    id: "s1",
    name: "Alpha",
    version: "v1.2.3",
    author: "A",
    description: "first",
    rawScript: "/*! @name Alpha @version v1.2.3 */\nglobalThis.lx = {}",
    enabled: true,
    url: "local:C:\\Music\\alpha.js",
    sources: { wy: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] } },
  },
  {
    id: "s2",
    name: "Nasty",
    version: "2.0",
    author: "B",
    description: "delimiters everywhere",
    rawScript: nastyBody,
    enabled: false,
    sources: {
      wy: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] },
      kw: { type: "music", actions: ["musicUrl"], qualitys: ["320k"] },
    },
  },
  {
    id: "s3",
    name: "Brace",
    version: "3",
    author: "",
    description: "",
    rawScript: braceInString,
    enabled: true,
  },
]

console.log("buildSourceBundle")
const text = buildSourceBundle(scripts, "2026-10-21T00:00:00.000Z")
check("output is non-empty text", typeof text === "string" && text.length > 100)
check("starts with a comment header", text.startsWith("/*!"))
check("does NOT put JSON inside a comment", text.includes("= {"))
check("ends with a newline", text.endsWith("\n"))
check("looksLikeSourceBundle() is true", looksLikeSourceBundle(text) === true)
check("a plain script is not a bundle", looksLikeSourceBundle(nastyBody) === false)
check("empty string is not a bundle", looksLikeSourceBundle("") === false)

console.log("\nparseSourceBundle")
const back = parseSourceBundle(text)
check("returns one entry per script", back.length === scripts.length)
check("names preserved", back.map((s) => s.name).join(",") === "Alpha,Nasty,Brace")
check("versions preserved", back.map((s) => s.version).join(",") === "v1.2.3,2.0,3")
check("order preserved (dispatch priority)", back.map((s) => s.name).join(",") === "Alpha,Nasty,Brace")
check("enabled flags preserved", back.map((s) => s.enabled).join(",") === "true,false,true")
check("url preserved when present", back[0].url === "local:C:\\Music\\alpha.js")
check("url omitted when absent", back[2].url === undefined)
check(
  "declared sources preserved",
  JSON.stringify(back[1].sources) === JSON.stringify(scripts[1].sources),
)
check("sources omitted when absent", back[2].sources === undefined)

// The critical one: a body full of comment delimiters and braces must survive.
check("script body survives delimiters", back[1].rawScript === nastyBody)
check(
  "script body keeps its own */ header",
  back[1].rawScript.includes("*/") && back[0].rawScript.includes("*/"),
)
check(
  "brace inside a string does not end the payload",
  back[1].rawScript.includes('"}"'),
)

console.log("\nnon-bundle input")
check("plain script returns null", parseSourceBundle(nastyBody) === null)
check("empty returns null", parseSourceBundle("") === null)
check("random js returns null", parseSourceBundle("console.log(1)") === null)

console.log("\nmalformed bundles throw instead of guessing")
const brokenJson = `/*! x */\nglobalThis.__MUSEEK_SOURCES_BUNDLE__ = {not json};\n`
let threw = false
try {
  parseSourceBundle(brokenJson)
} catch {
  threw = true
}
check("invalid JSON throws", threw)

const wrongFormat = `globalThis.__MUSEEK_SOURCES_BUNDLE__ = ${JSON.stringify({
  format: "something-else",
  sources: [{ rawScript: "x" }],
})};\n`
threw = false
try {
  parseSourceBundle(wrongFormat)
} catch {
  threw = true
}
check("wrong format throws", threw)

const emptySources = `globalThis.__MUSEEK_SOURCES_BUNDLE__ = ${JSON.stringify({
  format: "museek-sources",
  version: 1,
  sources: [{ rawScript: "   " }],
})};\n`
threw = false
try {
  parseSourceBundle(emptySources)
} catch {
  threw = true
}
check("bundle with no usable script throws", threw)

console.log("\nround trip")
const roundTrip = parseSourceBundle(buildSourceBundle(scripts))
check(
  "bodies are byte-identical after a round trip",
  roundTrip.every((s, i) => s.rawScript === scripts[i].rawScript),
)

console.log("\nbundleFileName")
const name = bundleFileName(new Date("2026-10-21T12:00:00Z"))
check(`named like a source file (got ${name})`, /^museek-sources-\d{8}\.js$/.test(name))
check("ends in .js so the import channel accepts it", name.endsWith(".js"))

rmSync(outDir, { recursive: true, force: true })

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("All source-bundle checks passed.")
