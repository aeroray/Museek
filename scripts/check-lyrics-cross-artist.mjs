// Cross-platform lyrics must be found when the artist is spelled differently.
//
// Reported: every Aimyon song showed "no lyrics" on NetEase/KuGou/KuWo, so a QQ
// Music Japanese lyric could not be swapped for one with a Chinese translation.
//
// The cause is not missing data. The same artist is 爱缪 on QQ Music and あいみょん
// on NetEase/KuGou, and `matchScore` rejects a hit unless the artist scores
// >= 0.55 — but `fold()` cannot relate two spellings that share no characters,
// so EVERY hit scored exactly 0.000 and the picker returned null. The platforms
// know their own spelling, so it is asked for and offered to the same scorer.
//
// This drives the real matcher and the real resolver, so the strictness rules
// stay under test rather than being re-implemented here.
//
//   node scripts/check-lyrics-cross-artist.mjs
import { createRequire } from "node:module"
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const root = resolve(import.meta.dirname, "..")
const work = join(import.meta.dirname, "lyrics-cross-artist-check")
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

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

globalThis.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {},
}
globalThis.window = globalThis.window ?? {}

const httpStub = join(work, "http-stub.ts")
writeFileSync(httpStub, `export async function httpFetch() { throw new Error("network disabled") }\n`)

// The search layer is canned so the MATCHING rules are what is under test.
const searchStub = join(work, "search-stub.ts")
writeFileSync(
  searchStub,
  `async function search(query: string) {
  const f = (globalThis as any).__SEARCH_FN__
  return { list: f ? f(query) : [] }
}
export const searchWangyi = search
export const searchKugou = search
export const searchKuwo = search
export const searchTx = search
export const searchMigu = search
`,
)

const entry = join(work, "entry.ts")
writeFileSync(
  entry,
  `export { pickBestMatch, pickBestMatchAcrossArtists, matchScore, lyricProbeSong } from "@/lib/lyrics/matchSong"
export { platformArtistName } from "@/lib/platformArtist"
`,
)

const esbuild = require(esbuildEntry())
const outFile = join(work, "check.mjs")
await esbuild.build({
  entryPoints: [entry],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "node",
  alias: {
    "@": join(root, "src"),
    "@/lib/http": httpStub,
    "@/lib/search/wy": searchStub,
    "@/lib/search/kg": searchStub,
    "@/lib/search/kuwo": searchStub,
    "@/lib/search/tx": searchStub,
    "@/lib/search/mg": searchStub,
  },
  external: ["@tauri-apps/api/*", "@tauri-apps/plugin-*"],
  banner: {
    js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
  logLevel: "error",
})

let failed = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name.padEnd(58)} => ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`,
  )
}
const section = (s) => console.log(`\n--- ${s} ---`)

const m = await import(pathToFileURL(outFile).href)

const song = (id, name, singer, interval) => ({
  id, name, singer, source: "tx", interval, albumName: "",
  meta: { songId: id, qualitys: [], _qualitys: {} },
})

try {
  // -------------------------------------------------------------------------
  section("the reported failure: 爱缪 (QQ) vs あいみょん (NetEase)")
  {
    const qq = song("tx_1", "ハルノヒ (春日)", "爱缪", "5:26")
    const wyHit = song("wy_1", "ハルノヒ", "あいみょん", "5:26")
    const probe = m.lyricProbeSong(qq)

    check("the two spellings score zero", m.matchScore(probe, wyHit), 0)
    check("so the direct pick finds nothing", m.pickBestMatch(probe, [wyHit]), null)
    check(
      "…but the alias resolves it",
      m.pickBestMatchAcrossArtists(probe, [wyHit], ["あいみょん"])?.id,
      "wy_1",
    )
    check("no aliases means no change", m.pickBestMatchAcrossArtists(probe, [wyHit], []), null)
    check("an empty alias is ignored", m.pickBestMatchAcrossArtists(probe, [wyHit], ["  "]), null)
    // The alias must not simply be accepted as "close enough" for any artist.
    check(
      "an unrelated alias does not match",
      m.pickBestMatchAcrossArtists(probe, [wyHit], ["Some Other Band"]),
      null,
    )
  }

  // -------------------------------------------------------------------------
  section("strictness survives the alias path")
  {
    const qq = song("tx_1", "ハルノヒ (春日)", "爱缪", "5:26")
    const probe = m.lyricProbeSong(qq)

    // Right artist, WRONG song: the title gate must still reject it.
    const wrongTitle = song("wy_x", "マリーゴールド", "あいみょん", "5:08")
    check(
      "a different song by the right artist is rejected",
      m.pickBestMatchAcrossArtists(probe, [wrongTitle], ["あいみょん"]),
      null,
    )

    // Right title, wrong artist: the artist gate must still reject it. This is
    // the case that would silently play the wrong recording if the alias were
    // treated as a wildcard.
    const wrongArtist = song("wy_y", "ハルノヒ", "ナナツカゼ", "5:26")
    check(
      "the right title by a different artist is rejected",
      m.pickBestMatchAcrossArtists(probe, [wrongArtist], ["あいみょん"]),
      null,
    )

    // Same title, right artist, but a wildly different length is a different
    // recording (a live take), and the duration gate must still apply.
    const liveVersion = song("wy_z", "ハルノヒ", "あいみょん", "9:40")
    check(
      "a much longer recording is rejected on duration",
      m.pickBestMatchAcrossArtists(probe, [liveVersion], ["あいみょん"]),
      null,
    )
  }

  // -------------------------------------------------------------------------
  section("reading the platform's own spelling")
  {
    // The platform answers with several songs by ONE artist: that name is its
    // spelling of the artist.
    globalThis.__SEARCH_FN__ = () => [
      song("a", "ハルノヒ", "あいみょん", "5:26"),
      song("b", "マリーゴールド", "あいみょん", "5:08"),
      song("c", "鯉", "あいみょん", "3:49"),
    ]
    check("the majority singer is the alias", await m.platformArtistName("wy", "爱缪"), "あいみょん")

    // A single result is not evidence the platform knows the ARTIST — acting on
    // it would let the alias be any artist, whose same-titled song would then
    // pass the strict comparison.
    globalThis.__SEARCH_FN__ = () => [song("a", "あのね", "あれくん、『ユイカ』", "3:34")]
    check("one hit is not enough", await m.platformArtistName("wy", "爱缪"), "")

    // No hits at all.
    globalThis.__SEARCH_FN__ = () => []
    check("no hits yields no alias", await m.platformArtistName("wy", "爱缪"), "")

    // A blank artist never searches.
    let searched = false
    globalThis.__SEARCH_FN__ = () => { searched = true; return [] }
    check("a blank artist is not searched", await m.platformArtistName("wy", "   "), "")
    check("…and no request was made", searched, false)

    // Mixed results: the most common singer wins.
    globalThis.__SEARCH_FN__ = () => [
      song("a", "x", "あいみょん", "1:00"),
      song("b", "y", "あいみょん", "1:00"),
      song("c", "z", "Other", "1:00"),
    ]
    check("the most common singer wins", await m.platformArtistName("wy", "爱缪"), "あいみょん")
  }

  // -------------------------------------------------------------------------
  section("a name already spelled the platform's way is a no-op")
  {
    const wy = song("wy_1", "夜に駆ける", "YOASOBI", "4:21")
    const hit = song("wy_2", "夜に駆ける", "YOASOBI", "4:21")
    const probe = m.lyricProbeSong(wy)
    check("it matches directly", m.pickBestMatch(probe, [hit])?.id, "wy_2")
    check(
      "…and the alias path agrees",
      m.pickBestMatchAcrossArtists(probe, [hit], ["YOASOBI"])?.id,
      "wy_2",
    )
  }

  console.log(failed === 0 ? "\nAll cases pass." : `\n${failed} case(s) failed.`)
  process.exitCode = failed === 0 ? 0 : 1
} finally {
  rmSync(work, { recursive: true, force: true })
}
