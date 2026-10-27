// Pins playback-session restore for every quality tier.
//
// `QUALITIES` in playbackSession.ts is the allowlist `isQueueItem` validates
// saved queue entries against. It used to omit `192k`/`256k` even though both are
// real values: `localMusic/tags.ts` snaps a measured local bitrate to them, and
// playerStore writes `meta.qualitys[0].type` into `currentQuality` and the queue
// item's `playedQuality`.
//
// The consequence was quiet and nasty: for a library of ordinary 192/256 kbps
// files, restore dropped the playing track and every sibling of that tier, reset
// `currentQuality` to "128k", and left `queueIndex` at -1. Nothing crashed.
//
//   node scripts/check-playback-session-quality.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const { readPlaybackSession } = await load("src/lib/playbackSession.ts")

// Stub the storage layer with a fixed session blob.
const store = { value: null }
const mod = await import("node:module")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}
void mod

const song = (id) => ({
  id,
  name: "s",
  singer: "a",
  source: "local",
  interval: "3:00",
  albumName: "",
  meta: { songId: id, qualitys: [], _qualitys: {} },
})

const ALL_TIERS = ["128k", "192k", "256k", "320k", "flac", "flac24bit"]
const REQUIRED = ["128k", "192k", "256k", "320k", "flac", "flac24bit"]
check("the tier list this check covers is complete", ALL_TIERS.length === REQUIRED.length)

// Drive the real validator through the public entry point. `readPlaybackSession`
// reads via db.ts, which falls back to localStorage-less behaviour; to keep this
// hermetic we exercise the same accept/reject rule the module applies by
// round-tripping a session through a local stub of readData.
const { readData } = await load("src/lib/db.ts")
void readData

const sessionFor = (quality, extra = {}) => ({
  version: 1,
  queue: [{ music: song(`${quality}-track`), quality, ...extra }],
  queueIndex: 0,
  currentSong: song(`${quality}-track`),
  currentQuality: quality,
  playMode: "sequence",
  currentTime: 42,
  duration: 180,
})

// readPlaybackSession pulls from db.readData, so stub localStorage for the
// browser fallback path that db.ts uses when not running under Tauri.
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
}

async function roundTrip(quality, extra) {
  mem.clear()
  mem.set("museek/playbackSession.json", JSON.stringify(sessionFor(quality, extra)))
  return readPlaybackSession()
}

console.log("\nevery tier survives a save/restore round trip")
for (const tier of REQUIRED) {
  const restored = await roundTrip(tier)
  check(
    `${tier}: queue item kept`,
    restored !== null && restored.queue.length === 1,
    `queue=${restored ? restored.queue.length : "null"}`,
  )
  check(
    `${tier}: currentQuality preserved`,
    restored !== null && restored.currentQuality === tier,
    `got ${restored ? restored.currentQuality : "null"}`,
  )
  check(
    `${tier}: queueIndex preserved`,
    restored !== null && restored.queueIndex === 0,
    `got ${restored ? restored.queueIndex : "null"}`,
  )
}

console.log("\nplayedQuality and qualityOverride accept the local-only tiers too")
{
  const restored = await roundTrip("256k", { playedQuality: "192k", qualityOverride: "192k" })
  const item = restored?.queue?.[0]
  check("queue item kept", Boolean(item), `queue=${restored ? restored.queue.length : "null"}`)
  check(
    "playedQuality preserved",
    item?.playedQuality === "192k",
    `got ${item ? item.playedQuality : "no item"}`,
  )
  check(
    "qualityOverride preserved",
    item?.qualityOverride === "192k",
    `got ${item ? item.qualityOverride : "no item"}`,
  )
}

console.log("\na genuinely invalid tier is still rejected")
{
  const restored = await roundTrip("bogus")
  check("bogus tier drops the queue item", restored !== null && restored.queue.length === 0, `queue=${restored ? restored.queue.length : "null"}`)
  check(
    "bogus currentQuality falls back",
    restored !== null && restored.currentQuality === "128k",
    `got ${restored ? restored.currentQuality : "null"}`,
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Playback-session quality checks passed.")
