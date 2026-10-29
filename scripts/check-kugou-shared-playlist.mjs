// Pins the KuGou shared-collection song-list rules.
//
// Reported: opening a KuGou external playlist showed a real title with "暂无数据".
//
// Root cause: shared collections (the `collection_<uid>_<listid>_<type>` ids that
// share links and 外部歌单 resolve to) are read through
// `mobiles.kugou.com/api/v5/special/song_v2`. With `appid=1058` that endpoint
// answers, for every request and however long you wait:
//
//   {"errcode":20028,"status":0,"error":"您操作太频繁了，请稍后再试"}
//
// The code did `json.data?.info ?? []`, turning a rejected request into an empty
// song list. The collection name and cover come from a different endpoint and
// still loaded, so the UI showed the real playlist title above "暂无数据".
//
// Verified against the live endpoint with the reported link
// (https://t1.kugou.com/2rr1jf3G6V3 -> collection_3_582045388_58_0):
//   appid=1058 -> errcode 20028 on every page
//   appid=1005 -> total=1122, pages 1..4 return 300/300/300/222 songs
//
//   node scripts/check-kugou-shared-playlist.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const kg = await load("src/lib/playlists/kgSongList.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

// ---------------------------------------------------------------------------
console.log("\nthe reported failure is recognised as an error, not an empty list")
{
  // The exact envelope the live endpoint returns for appid=1058.
  const rejected = {
    errcode: 20028,
    status: 0,
    error: "您操作太频繁了，请稍后再试",
  }
  check("it is classified as an error", kg.isKgErrorEnvelope(rejected) === true)
  check(
    "its items are null, NOT an empty array",
    kg.kgSongPageItems(rejected) === null,
    `got ${JSON.stringify(kg.kgSongPageItems(rejected))}`,
  )
  check(
    "the old `data?.info ?? []` reading would have produced []",
    JSON.stringify(rejected.data?.info ?? []) === "[]",
  )
}

console.log("\na genuine empty page is still an empty list")
{
  const empty = { errcode: 0, status: 1, data: { total: 0, info: [] } }
  check("it is not an error", kg.isKgErrorEnvelope(empty) === false)
  check("its items are []", JSON.stringify(kg.kgSongPageItems(empty)) === "[]")
}

console.log("\nother error shapes")
{
  check("a null envelope is an error", kg.isKgErrorEnvelope(null) === true)
  check("undefined is an error", kg.isKgErrorEnvelope(undefined) === true)
  check(
    "errcode without status is an error",
    kg.isKgErrorEnvelope({ errcode: 1002, data: { info: [] } }) === true,
  )
  check(
    "status=0 with an error string is an error",
    kg.isKgErrorEnvelope({ status: 0, error: "参数不合法" }) === true,
  )
  check(
    "status=0 with no error string is tolerated",
    kg.isKgErrorEnvelope({ status: 0, data: { info: [] } }) === false,
  )
  check(
    "a normal success envelope is not an error",
    kg.isKgErrorEnvelope({ errcode: 0, status: 1, data: { info: [{}] } }) === false,
  )
}

// ---------------------------------------------------------------------------
console.log("\npagination covers the whole collection")
{
  // The real numbers for the reported playlist.
  const pages = kg.kgSongPageNumbers(1122, 1136, 300, 300)
  check(
    `1122 songs over 300/page needs pages ${JSON.stringify(pages)}`,
    JSON.stringify(pages) === "[2,3,4]",
    JSON.stringify(pages),
  )
  const perPage = [300, 300, 300, 222]
  check(
    "those pages plus the first cover exactly 1122 songs",
    pages.length + 1 === perPage.length &&
      perPage.reduce((a, b) => a + b, 0) === 1122,
  )

  check(
    "a single-page collection asks for no more pages",
    JSON.stringify(kg.kgSongPageNumbers(42, 42, 42, 300)) === "[]",
  )
  check(
    "exactly one full page asks for no more",
    JSON.stringify(kg.kgSongPageNumbers(300, 300, 300, 300)) === "[]",
  )
  check(
    "301 songs needs page 2",
    JSON.stringify(kg.kgSongPageNumbers(301, 301, 300, 300)) === "[2]",
  )
  check(
    "an empty collection asks for nothing",
    JSON.stringify(kg.kgSongPageNumbers(0, 0, 0, 300)) === "[]",
  )
  check(
    "a missing total falls back to the info endpoint's count",
    JSON.stringify(kg.kgSongPageNumbers(null, 600, 300, 300)) === "[2]",
  )
  check(
    "the returned total wins over a larger info count (1122 vs 1136)",
    JSON.stringify(kg.kgSongPageNumbers(1122, 1136, 300, 300)) === "[2,3,4]",
  )
  check(
    "a nonsensical pagesize asks for nothing",
    JSON.stringify(kg.kgSongPageNumbers(1000, 1000, 300, 0)) === "[]",
  )
}

console.log("\ntotal parsing")
{
  check("a numeric total is read", kg.kgSongPageTotal({ data: { total: 1122 } }) === 1122)
  check("a missing total is null", kg.kgSongPageTotal({ data: {} }) === null)
  check("a negative total is rejected", kg.kgSongPageTotal({ data: { total: -1 } }) === null)
  check(
    "a non-numeric total is rejected",
    kg.kgSongPageTotal({ data: { total: "1122" } }) === null,
  )
}

console.log("\nthe appid is the one the endpoint accepts")
{
  check(
    `appid is ${kg.KG_SONG_LIST_APPID}`,
    kg.KG_SONG_LIST_APPID === "1005",
    `got ${kg.KG_SONG_LIST_APPID}`,
  )
  check(
    "it is not the rejected 1058",
    kg.KG_SONG_LIST_APPID !== "1058",
  )
  check(
    "the page size is 300",
    kg.KG_SONG_LIST_PAGE_SIZE === 300,
    `got ${kg.KG_SONG_LIST_PAGE_SIZE}`,
  )
}

// ---------------------------------------------------------------------------
// Guard the call site, not just the helpers: `kg.ts` must actually use them.
console.log("\nthe playlist module uses these rules")
{
  const { readFileSync } = await import("node:fs")
  const { join, resolve } = await import("node:path")
  const root = resolve(import.meta.dirname, "..")
  const src = readFileSync(join(root, "src/lib/playlists/kg.ts"), "utf8")

  check(
    "kg.ts imports the shared appid constant",
    /KG_SONG_LIST_APPID/.test(src) && /from "@\/lib\/playlists\/kgSongList"/.test(src),
  )
  check(
    "kg.ts no longer hardcodes appid=1058 for song_v2",
    !/appid=1058[^`]*song_v2/.test(src) && !/song_v2[\s\S]{0,200}appid=1058/.test(src),
  )
  check(
    "kg.ts distinguishes a rejected list from an empty one",
    /kgSongPageItems\(json\) === null/.test(src),
  )
  check(
    "a rejected song list throws instead of returning no songs",
    /song list rejected/.test(src),
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("KuGou shared-playlist checks passed.")
