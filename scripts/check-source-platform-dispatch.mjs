// Proves a song is only dispatched to source scripts that serve its platform —
// the cause of "I played 春日 by 爱缪 and heard a different singer".
//
// Two rounds of the same defect. First `getOrderedIds()` filtered enabled
// scripts only by `enabled` and "is loaded", so a `tx` song went to every
// enabled script. Then it filtered by platform but fell back to the unfiltered
// list whenever nothing matched, which re-admitted exactly the scripts the
// filter exists to exclude. In both shapes a script that cannot resolve the id
// it was given looks the track up BY NAME on its own service and answers with a
// different recording of the same title.
//
// This drives the REAL SourceRunner with stub sessions and records exactly which
// scripts receive a musicUrl request for a tx song.
//
//   node scripts/check-source-platform-dispatch.mjs
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

const outDir = mkdtempSync(join(tmpdir(), "museek-dispatch-"))
const outFile = join(outDir, "runner.mjs")

// The i18n module reads localStorage at import time to pick a language, so the
// harness needs a minimal stand-in before the bundle is loaded.
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
}
globalThis.window = globalThis.window ?? {}
// `navigator` is a getter-only global in Node 26, so it is left alone; the i18n
// module only needs localStorage.

// Stub the Tauri-backed HTTP layer and anything the bundler cannot resolve in
// plain node. The logic under test does not reach these.
const stubHttp = join(outDir, "http-stub.ts")
writeFileSync(stubHttp, `export async function httpFetch() {
  throw new Error("network disabled in this harness")
}
`)
const stubTauri = join(outDir, "tauri-stub.ts")
writeFileSync(stubTauri, `export const isTauri = false
export async function invoke() { throw new Error("tauri disabled") }
`)

const esbuild = require(esbuildEntry())
await esbuild.build({
  entryPoints: [join(root, "src", "lib", "sourceRunner.ts")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "node",
  alias: { "@": join(root, "src"), "@/lib/http": stubHttp },
  external: ["@tauri-apps/api/*", "@tauri-apps/plugin-*"],
  // The bundle reaches CommonJS deps (js-md5 via the lx API); ESM output needs a
  // real `require` for those.
  banner: {
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
  logLevel: "error",
})

const { SourceRunner } = await import(pathToFileURL(outFile).href)

// A song as it comes out of the QQ search: source "tx".
const txSong = {
  id: "tx_0033ITgi4SLLzu",
  name: "ハルノヒ",
  singer: "爱缪",
  source: "tx",
  interval: "5:26",
  albumName: "ハルノヒ",
  meta: {
    songId: "0033ITgi4SLLzu",
    strMediaMid: "001K1zlw0Bb80h",
    albumId: "0033ITgi4SLLzu",
    picUrl: null,
    qualitys: [{ type: "128k", size: "4.00MB" }],
    _qualitys: { "128k": { type: "128k", size: "4.00MB" } },
  },
}

// Scripts a user might have enabled. Only the first declares `tx`.
const scripts = [
  {
    id: "script-tx-only",
    name: "QQ-only source",
    enabled: true,
    sources: { tx: { type: "music", actions: ["musicUrl", "lyric", "pic"], qualitys: ["128k"] } },
  },
  {
    id: "script-wy-only",
    name: "NetEase-only source",
    enabled: true,
    sources: { wy: { type: "music", actions: ["musicUrl", "lyric", "pic"], qualitys: ["128k"] } },
  },
  {
    id: "script-kw-only",
    name: "KuWo-only source",
    enabled: true,
    sources: { kw: { type: "music", actions: ["musicUrl", "lyric", "pic"], qualitys: ["128k"] } },
  },
  {
    id: "script-disabled-kg",
    name: "Disabled KuGou source",
    enabled: false,
    sources: { kg: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] } },
  },
]

let failed = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name}\n        => ${JSON.stringify(actual)}${ok ? "" : `\n        expected ${JSON.stringify(expected)}`}`,
  )
}

const runner = new SourceRunner({
  getScripts: () => scripts,
  setScripts: () => {},
})

// Record every dispatch, and make each session fail so getMusicUrl walks the
// whole list (proving the full participant set, not just the first winner).
const dispatched = []
const sessions = new Map()
for (const s of scripts) {
  sessions.set(s.id, {
    invoke: async (request) => {
      dispatched.push({ scriptId: s.id, source: request.source, songmid: request.info.musicInfo.songmid })
      return null
    },
  })
}
// Reach the private map directly: the point is to observe dispatch, not to boot
// real workers.
runner.sessions = sessions

async function dispatchIds(action, payload) {
  dispatched.length = 0
  try {
    if (action === "musicUrl") await runner.getMusicUrl(payload)
    else if (action === "lyric") await runner.getLyric(payload)
    else await runner.getPic(payload)
  } catch {
    /* stubs return null, so this always rejects / returns null — expected */
  }
  return [...new Set(dispatched.map((d) => d.scriptId))]
}

const ids = await dispatchIds("musicUrl", {
  source: "tx",
  action: "musicUrl",
  info: txSong,
  type: "128k",
})

console.log("\nScripts that received a musicUrl request for a tx song:")
for (const d of dispatched) {
  console.log(`  ${d.scriptId.padEnd(20)} source=${d.source} songmid=${d.songmid}`)
}

check("the enabled tx-declaring script is asked", ids.includes("script-tx-only"), true)
check("the enabled disabled=kg script is NOT asked", ids.includes("script-disabled-kg"), false)

// THE DEFECT being fixed: scripts that declare no `tx` support at all must not
// be asked to resolve a tx song. Before the fix both were asked, and a script
// that resolves by name can answer with a different recording of the same title.
check("an enabled wy-only script is NOT asked for a tx song", ids.includes("script-wy-only"), false)
check("an enabled kw-only script is NOT asked for a tx song", ids.includes("script-kw-only"), false)

check(
  "only the platform-matching script is asked",
  ids,
  ["script-tx-only"],
)

// Every request carries source "tx" — the scripts are expected to honour it,
// which is exactly the assumption that breaks when one does not.
check(
  "all requests declare source=tx",
  [...new Set(dispatched.map((d) => d.source))],
  ["tx"],
)

// Lyric and pic must follow the same rule, or a wrong-platform script supplies
// a matching-looking lyric/cover for the wrong recording.
const lyricIds = await dispatchIds("lyric", { source: "tx", action: "lyric", info: txSong })
const picIds = await dispatchIds("pic", { source: "tx", action: "pic", info: txSong })
check("lyric is only requested from the tx script", lyricIds, ["script-tx-only"])
check("pic is only requested from the tx script", picIds, ["script-tx-only"])

// A script that declares a platform but not the requested ACTION must be skipped.
const partial = [
  {
    id: "script-tx-lyric-only",
    name: "tx lyric only",
    enabled: true,
    sources: { tx: { type: "music", actions: ["lyric"], qualitys: ["128k"] } },
  },
]
const partialRunner = new SourceRunner({ getScripts: () => partial, setScripts: () => {} })
const partialSeen = []
partialRunner.sessions = new Map([
  [
    "script-tx-lyric-only",
    {
      invoke: async (r) => {
        partialSeen.push(r.action ?? "musicUrl")
        return null
      },
    },
  ],
])
try {
  await partialRunner.getMusicUrl({ source: "tx", action: "musicUrl", info: txSong, type: "128k" })
} catch {
  /* expected */
}
check(
  "a tx script declaring only `lyric` is not asked for musicUrl",
  partialSeen.includes("musicUrl"),
  false,
)
await partialRunner.getLyric({ source: "tx", action: "lyric", info: txSong })
check(
  "…but it IS asked for lyric",
  partialSeen.includes("lyric"),
  true,
)

// Fallback: if filtering leaves nothing at all, the unfiltered list is used so a
// lone under-declaring script still plays instead of failing outright.
const lone = [
  {
    id: "script-declares-nothing",
    name: "no sources declared",
    enabled: true,
  },
]
const loneRunner = new SourceRunner({ getScripts: () => lone, setScripts: () => {} })
let loneAsked = false
loneRunner.sessions = new Map([
  [
    "script-declares-nothing",
    {
      invoke: async () => {
        loneAsked = true
        return null
      },
    },
  ],
])
try {
  await loneRunner.getMusicUrl({ source: "tx", action: "musicUrl", info: txSong, type: "128k" })
} catch {
  /* expected */
}
check("a script declaring no sources is still asked", loneAsked, true)

// THE REMAINING DEFECT, and the one the reporter still hit: a script that
// declares a DIFFERENT platform must not be asked either.
//
// An earlier version fell back to the unfiltered list when nothing matched,
// reasoning that trying is better than leaving the song unplayable. But trying
// is exactly what produces the wrong audio: the script cannot resolve a tx id,
// so it looks the name up on its own service and answers with another recording
// of the same title. Search is built in for every platform, so browsing a
// platform you have no script for is ordinary — and it must fail honestly.
const wrongOnly = [
  {
    id: "script-wy-declared",
    name: "wy only",
    enabled: true,
    sources: { wy: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] } },
  },
]
const wrongRunner = new SourceRunner({ getScripts: () => wrongOnly, setScripts: () => {} })
let wrongAsked = false
wrongRunner.sessions = new Map([
  [
    "script-wy-declared",
    {
      invoke: async () => {
        wrongAsked = true
        return null
      },
    },
  ],
])
let wrongErr = null
try {
  await wrongRunner.getMusicUrl({ source: "tx", action: "musicUrl", info: txSong, type: "128k" })
} catch (err) {
  wrongErr = err
}
check("a script declaring only another platform is NOT asked", wrongAsked, false)

// The failure must be honest. "No enabled sources" would be misleading — one IS
// enabled, it just does not serve this platform, and the fix is to import a
// script for it.
check(
  "it reports that no source serves the platform",
  /QQ/.test(String(wrongErr?.message ?? "")),
  true,
)
check(
  "it does not claim there are no enabled sources",
  String(wrongErr?.message ?? "").includes("No enabled sources"),
  false,
)

// Several mismatched scripts: still nobody is asked.
const allWrong = [
  {
    id: "script-wy-declared",
    name: "wy only",
    enabled: true,
    sources: { wy: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] } },
  },
  {
    id: "script-kg-declared",
    name: "kg only",
    enabled: true,
    sources: { kg: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] } },
  },
]
const allWrongRunner = new SourceRunner({ getScripts: () => allWrong, setScripts: () => {} })
let anyWrongAsked = false
allWrongRunner.sessions = new Map(
  allWrong.map((s) => [
    s.id,
    {
      invoke: async () => {
        anyWrongAsked = true
        return null
      },
    },
  ]),
)
try {
  await allWrongRunner.getMusicUrl({ source: "tx", action: "musicUrl", info: txSong, type: "128k" })
} catch {
  /* expected */
}
check("no mismatched script is asked when there are several", anyWrongAsked, false)

// A script that declares SOME platforms and DOES serve this one is unaffected.
const mixed = [
  {
    id: "script-wy-and-tx",
    name: "wy + tx",
    enabled: true,
    sources: {
      wy: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] },
      tx: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] },
    },
  },
  {
    id: "script-kw-only-2",
    name: "kw only",
    enabled: true,
    sources: { kw: { type: "music", actions: ["musicUrl"], qualitys: ["128k"] } },
  },
]
const mixedRunner = new SourceRunner({ getScripts: () => mixed, setScripts: () => {} })
const mixedSeen = []
mixedRunner.sessions = new Map(
  mixed.map((s) => [
    s.id,
    {
      invoke: async () => {
        mixedSeen.push(s.id)
        return null
      },
    },
  ]),
)
try {
  await mixedRunner.getMusicUrl({ source: "tx", action: "musicUrl", info: txSong, type: "128k" })
} catch {
  /* expected */
}
check("a script declaring tx among others is asked", mixedSeen.includes("script-wy-and-tx"), true)
check("its kw-only neighbour is not", mixedSeen.includes("script-kw-only-2"), false)

console.log(
  failed === 0
    ? "\nAll cases pass: a song is only dispatched to scripts that serve its platform."
    : `\n${failed} case(s) failed.`,
)
rmSync(outDir, { recursive: true, force: true })
process.exitCode = failed === 0 ? 0 : 1
