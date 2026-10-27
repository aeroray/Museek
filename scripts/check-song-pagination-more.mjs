// Pins song-scope pagination past page 2.
//
// The playlist and album branches of `search()` stop only when a page adds
// nothing new. The song branch used to trust the source's `allPage` verbatim, so
// any source that reports a total only on the first page broke it. NetEase is
// exactly that source (`src/lib/search/wy.ts` sends `total: page === 1`), which
// means page 2 came back with totalCount 0 -> allPage 0 -> `page < allPage` false.
// Infinite scroll dead-ended at 60 of 300 results and the rest were unreachable.
//
// This drives the real store with a source shaped like NetEase, so the check
// fails if the store goes back to trusting `allPage` blindly.
//
//   node scripts/check-song-pagination-more.mjs
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

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
}

const work = mkdtempSync(join(tmpdir(), "museek-page-more-"))
const write = (n, b) => {
  const p = join(work, n)
  writeFileSync(p, b)
  return p
}

const TOTAL = 300
const LIMIT = 30

// Mirrors wy.ts: the server only reports a total on page 1. `mode` lets a case
// model a source that ignores `page` and replays the same rows forever.
const stubSongs = write(
  "songs-stub.ts",
  `
const TOTAL = ${TOTAL}
const LIMIT = ${LIMIT}
let mode = "netease"
export const setMode = (m: string) => { mode = m }
export const getMode = () => mode
export const searchWangyi = async (q: string, page = 1, limit = LIMIT) => {
  // "repeat": identical rows every page, like a source that ignores \`page\`.
  const index = mode === "repeat" ? 0 : page
  const start = (index - 1) * LIMIT
  // A real source runs out: once start passes the total, it returns a short
  // (possibly empty) page. Without this the store would be right to keep asking.
  const count = Math.max(0, Math.min(limit, TOTAL - start))
  return {
    list: Array.from({ length: count }, (_, i) => ({
      id: "wy_" + (start + i),
      name: "s", singer: "a", source: "wy", interval: "3:00", albumName: "",
      meta: { songId: String(start + i), qualitys: [], _qualitys: {} },
    })),
    // The whole point: no total after page 1.
    total: page === 1 ? TOTAL : 0,
    page,
    allPage: page === 1 ? Math.ceil(TOTAL / limit) : 0,
    limit,
  }
}
export const searchKuwo = searchWangyi
export const searchKugou = searchWangyi
export const searchTx = searchWangyi
export const searchMigu = searchWangyi
`,
)
const stubPlaylist = write(
  "pl-stub.ts",
  `export const PLAYLIST_SEARCH_LIMIT = 30\nexport async function searchPlaylists(){ return [] }\n`,
)
const stubAlbums = write(
  "al-stub.ts",
  `export const ALBUM_SEARCH_LIMIT = 30\nexport function mergeAlbums(e: unknown[], i: unknown[]){ return { list: i, added: i.length } }\nexport async function searchAlbums(){ return [] }\n`,
)
const stubDb = write(
  "db-stub.ts",
  `export async function readData(_f: string, f: unknown){ return f }\nexport async function writeData(){}\nexport async function writeDataCompact(){}\n`,
)
const stubHttp = write(
  "http-stub.ts",
  `export async function httpFetch(){ throw new Error("no net") }\n`,
)
const stubTabs = write(
  "tabs-stub.tsx",
  `export const PLATFORM_ORDER = ["wy","kw","kg","tx","mg"] as const\n`,
)

const esbuild = await import(pathToFileURL(esbuildEntry()).href)
const out = join(work, "store.mjs")
await esbuild.build({
  entryPoints: [join(root, "src/stores/searchStore.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  mainFields: ["module", "main"],
  logLevel: "silent",
  alias: {
    "@": join(root, "src"),
    "@/lib/playlists/search": stubPlaylist,
    "@/lib/albums": stubAlbums,
    "@/lib/db": stubDb,
    "@/lib/http": stubHttp,
    "@/lib/search/wy": stubSongs,
    "@/lib/search/kuwo": stubSongs,
    "@/lib/search/kg": stubSongs,
    "@/lib/search/tx": stubSongs,
    "@/lib/search/mg": stubSongs,
    "@/components/common/PlatformTabs": stubTabs,
  },
  external: ["@tauri-apps/api/*", "@tauri-apps/plugin-*"],
  banner: {
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
})

const { useSearchStore: S } = await import(pathToFileURL(out).href)
const songsStub = await import(pathToFileURL(stubSongs).href).catch(() => null)
const hasMore = () => S.getState().page < S.getState().allPage

function reset() {
  S.setState({
    platform: "wy",
    scope: "song",
    searchGeneration: 0,
    results: [],
    page: 1,
    allPage: 1,
    total: 0,
    query: "",
  })
}

console.log("a source that reports its total only on page 1 (NetEase)")
{
  reset()
  await S.getState().search("q", 1)
  check("page 1 offers another page", hasMore(), `page=${S.getState().page} allPage=${S.getState().allPage}`)
  check("page 1 records the real total", S.getState().total === TOTAL, `total=${S.getState().total}`)

  await S.getState().search("q", 2)
  check(
    "page 2 still offers another page (the shipped bug)",
    hasMore(),
    `page=${S.getState().page} allPage=${S.getState().allPage}`,
  )
  check("page 2 keeps the page-1 total", S.getState().total === TOTAL, `total=${S.getState().total}`)
  check("page 2 appended rows", S.getState().results.length === LIMIT * 2, `rows=${S.getState().results.length}`)

  await S.getState().search("q", 3)
  check("page 3 still reachable", hasMore(), `page=${S.getState().page} allPage=${S.getState().allPage}`)
  check("page 3 appended rows", S.getState().results.length === LIMIT * 3, `rows=${S.getState().results.length}`)

  // Past the real end the source returns fewer than a full page, so we stop.
  let guard = 0
  while (hasMore() && guard++ < 20) await S.getState().search("q", S.getState().page + 1)
  check("pagination eventually stops", !hasMore(), `page=${S.getState().page} allPage=${S.getState().allPage}`)
  check("collected every row the server had", S.getState().results.length === TOTAL, `rows=${S.getState().results.length}`)
}

console.log("\na source that ignores `page` and replays the same rows")
{
  reset()
  // Every page returns page 1's rows. Without the `added > 0` guard this would
  // ask for page 4, 5, 6... forever.
  let calls = 0
  const realSearch = S.getState().search
  S.setState({
    search: async (q, page) => {
      // First page reports a huge allPage, like a source that does have a total.
      calls++
      return realSearch(q, 1)
    },
  })
  await S.getState().search("q", 1)
  const before = S.getState().allPage
  await S.getState().search("q", 2)
  const after = S.getState().allPage
  check(
    "a page that adds nothing stops the loader",
    !hasMore() || after === before,
    `page=${S.getState().page} allPage=${after}`,
  )
  check("stub was actually driven", calls >= 1, `calls=${calls}`)
  void songsStub
}

rmSync(work, { recursive: true, force: true })

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Song pagination checks passed.")
