// Proves playlist search paginates: page 1 replaces, later pages append, repeats
// are dropped, and `allPage` stops growing once a page adds nothing.
//
// The platform endpoints return a bare array with no total, so "is there another
// page" can only be inferred. Getting that inference wrong in either direction is
// user-visible: too eager and "load more" becomes a button that never changes
// anything; too shy and the list dead-ends at 30 rows like the reported bug.
//
//   node scripts/check-playlist-pagination.mjs
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
  const dir = readdirSync(join(root, "node_modules", ".pnpm")).find((d) => d.startsWith("esbuild@"))
  if (!dir) throw new Error("esbuild not found")
  return join(root, "node_modules", ".pnpm", dir, "node_modules", "esbuild", "lib", "main.js")
}

const work = mkdtempSync(join(tmpdir(), "museek-plpage-"))
const outFile = join(work, "store.mjs")

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

// --- stubs -----------------------------------------------------------------
// The playlist search stub is driven through `globalThis.__plPages`, so the
// harness can decide exactly what each page returns.
const stubSearch = join(work, "search-stub.ts")
writeFileSync(
  stubSearch,
  `export const PLAYLIST_SEARCH_LIMIT = 30
export async function searchPlaylists(_source, _query, page = 1) {
  const pages = globalThis.__plPages ?? new Map()
  return pages.get(String(page)) ?? []
}
`,
)

const write = (name, body) => {
  const p = join(work, name)
  writeFileSync(p, body)
  return p
}

// Album search is out of scope for this check, but the store imports its page
// size and merge helper, so the stub must export them for the bundle to link.
const stubAlbums = write(
  "albums-stub.ts",
  `export const ALBUM_SEARCH_LIMIT = 30
export function mergeAlbums(existing, incoming) {
  const seen = new Set(existing.map((a) => a.source + ":" + a.id))
  const list = [...existing]
  let added = 0
  for (const a of incoming) {
    const k = a.source + ":" + a.id
    if (seen.has(k)) continue
    seen.add(k)
    list.push(a)
    added++
  }
  return { list, added }
}
export async function searchAlbums() { return [] }
`,
)
const stubDb = write(
  "db-stub.ts",
  `export async function readData(_f, fallback) { return fallback }
export async function writeData() {}
export async function writeDataCompact() {}
`,
)
const stubSongs = write(
  "songs-stub.ts",
  `const empty = async () => ({ list: [], total: 0, page: 1, allPage: 1 })
export const searchKuwo = empty
export const searchKugou = empty
export const searchTx = empty
export const searchWangyi = empty
export const searchMigu = empty
`,
)
const stubPlatformTabs = write(
  "platformtabs-stub.tsx",
  `export const PLATFORM_ORDER = ["wy", "kw", "kg", "tx", "mg"] as const
`,
)
// Nothing here performs network IO, but the song-search modules pull the Tauri
// HTTP bridge in transitively; stub it so the bundle links outside the app.
const stubHttp = write(
  "http-stub.ts",
  `export async function httpFetch() {
  throw new Error("network disabled in this harness")
}
`,
)

const esbuild = await import(pathToFileURL(esbuildEntry()).href)
await esbuild.build({
  entryPoints: [join(root, "src/stores/searchStore.ts")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "node",
  mainFields: ["module", "main"],
  logLevel: "silent",
  alias: {
    "@": join(root, "src"),
    "@/lib/playlists/search": stubSearch,
    "@/lib/albums": stubAlbums,
    "@/lib/db": stubDb,
    "@/lib/http": stubHttp,
    "@/lib/search/kuwo": stubSongs,
    "@/lib/search/kg": stubSongs,
    "@/lib/search/tx": stubSongs,
    "@/lib/search/wy": stubSongs,
    "@/lib/search/mg": stubSongs,
    "@/components/common/PlatformTabs": stubPlatformTabs,
  },
  external: ["@tauri-apps/api/*", "@tauri-apps/plugin-*"],
  banner: {
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
})

const { useSearchStore: S } = await import(pathToFileURL(outFile).href)

const mk = (id, source = "wy") => ({
  id: String(id),
  name: `P${id}`,
  img: null,
  playCount: "1",
  author: "a",
  source,
})
const seed = (map) => {
  globalThis.__plPages = map
}
const fullPage = (offset) => Array.from({ length: 30 }, (_, i) => mk(offset + i))

const reset = (scope = "playlist", platform = "wy") => {
  S.setState({
    platform,
    scope,
    searchGeneration: 0,
    playlistResults: [],
    results: [],
    albumResults: [],
    page: 1,
    allPage: 1,
    query: "",
  })
}

console.log("page 1 — a full page offers another")
reset()
seed(new Map([["1", fullPage(0)]]))
await S.getState().search("q", 1)
let st = S.getState()
check(`30 results (got ${st.playlistResults.length})`, st.playlistResults.length === 30)
check(`page=1 (got ${st.page})`, st.page === 1)
check(`allPage=2, so "load more" shows (got ${st.allPage})`, st.allPage === 2)

console.log("\npage 2 — appends to the existing rows")
seed(
  new Map([
    ["1", fullPage(0)],
    ["2", fullPage(100)],
  ]),
)
await S.getState().search("q", 2)
st = S.getState()
check(`60 results (got ${st.playlistResults.length})`, st.playlistResults.length === 60)
check(`page=2 (got ${st.page})`, st.page === 2)
check(`allPage=3 (got ${st.allPage})`, st.allPage === 3)
check("page 1 rows still first", st.playlistResults[0].id === "0")
check("page 2 rows appended at the end", st.playlistResults[59].id === "129")

console.log("\npage 3 — a short page ends pagination")
seed(
  new Map([
    ["1", fullPage(0)],
    ["2", fullPage(100)],
    ["3", Array.from({ length: 5 }, (_, i) => mk(200 + i))],
  ]),
)
await S.getState().search("q", 3)
st = S.getState()
check(`65 results (got ${st.playlistResults.length})`, st.playlistResults.length === 65)
check(`allPage stays at 3 (got ${st.allPage})`, st.allPage === 3)

console.log("\nrepeated rows are deduped")
reset()
seed(
  new Map([
    ["1", fullPage(0)],
    ["2", fullPage(0)],
  ]),
)
await S.getState().search("q", 1)
await S.getState().search("q", 2)
st = S.getState()
check(`still 30 rows, not 60 (got ${st.playlistResults.length})`, st.playlistResults.length === 30)
check(`allPage stops at 2 — page 2 added nothing (got ${st.allPage})`, st.allPage === 2)

console.log("\na new query replaces instead of appending")
seed(new Map([["1", [mk(900), mk(901)]]]))
await S.getState().search("different", 1)
st = S.getState()
check(`replaced with 2 (got ${st.playlistResults.length})`, st.playlistResults.length === 2)
check("old ids gone", st.playlistResults.every((p) => p.id.startsWith("90")))

console.log("\nthe same id on a different platform is not a duplicate")
reset()
seed(new Map([["1", [mk(1, "wy"), mk(1, "kw")]]]))
await S.getState().search("x", 1)
st = S.getState()
check(`both kept (got ${st.playlistResults.length})`, st.playlistResults.length === 2)

console.log("\nsong scope is untouched by the playlist change")
reset("song", "wy")
seed(new Map([["1", []], ["2", []]]))
await S.getState().search("q", 1)
st = S.getState()
check("songs still start on page 1", st.page === 1)
check("playlist results not populated by song search", st.playlistResults.length === 0)

rmSync(work, { recursive: true, force: true })

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Playlist pagination checks passed.")
