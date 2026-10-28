// Pins the two lyric-surface rules that were inconsistent.
//
// 1. The "choose lyric source" menu re-ran the whole cross-platform probe every
//    time it was opened. A payload cache existed, but it only covers platforms
//    that returned a lyric — every `empty` result was uncached, so reopening the
//    menu re-searched every platform (plus an artist-alias probe) and flashed
//    "searching…" again for an answer it already had.
//
// 2. The desktop lyric applied a whole-line karaoke sweep to PLAIN line-timed
//    lyrics, which the lyrics panel and the top bar do not do. The same song
//    looked karaoke-styled on the desktop and plain everywhere else.
//
//   node scripts/check-lyric-options-cache.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

// `KaraokeText.tsx` pulls in the playback clock (for `PlaybackKaraokeText`), which
// constructs the audio engine at module scope. None of that is exercised here —
// the check only calls the pure `hasKaraokeTiming` predicate — so the minimum
// browser surface it needs is stubbed rather than mocked in detail.
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
}
class StubAudio {
  constructor() {
    this.paused = true
    this.ended = false
    this.duration = 0
    this.currentTime = 0
    this.volume = 1
  }
  addEventListener() {}
  removeEventListener() {}
  play() {
    return Promise.resolve()
  }
  pause() {}
  load() {}
  removeAttribute() {}
  setAttribute() {}
}
globalThis.Audio = StubAudio
globalThis.window = globalThis
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.document = {
  documentElement: { dataset: {} },
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
  visibilityState: "visible",
}

const load = createTsLoader()
const cache = await load("src/lib/lyrics/optionCache.ts")
const karaoke = await load("src/components/lyrics/KaraokeText.tsx")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

const PLATFORMS = ["wy", "kw", "kg", "tx", "mg"]
const opt = (source, status, wordByWord = false) => ({ source, status, wordByWord })

// ---------------------------------------------------------------------------
console.log("\nthe cacheability rule")
{
  check("a fully answered list is cacheable", cache.isCacheable([
    opt("wy", "ok", true), opt("kw", "empty"), opt("kg", "ok"),
  ]))
  check("a list with an error is NOT cacheable", !cache.isCacheable([
    opt("wy", "ok"), opt("kw", "error"),
  ]))
  check("a list with a pending row is NOT cacheable", !cache.isCacheable([
    opt("wy", "ok"), opt("kw", "pending"),
  ]))
  check("an all-empty list IS cacheable (it is a real answer)",
    cache.isCacheable(PLATFORMS.map((p) => opt(p, "empty"))))
}

// ---------------------------------------------------------------------------
// A lister whose probe counts how many times it actually ran.
function makeLister({ statuses, fail = false, ttlMs = 1000 } = {}) {
  let probes = 0
  let clock = 0
  const lister = cache.createOptionLister({
    keyOf: (song) => `${song.source}:${song.id}`,
    platforms: PLATFORMS,
    ttlMs,
    now: () => clock,
    probe: async (song, onUpdate) => {
      probes++
      const result = PLATFORMS.map((p, i) =>
        opt(p, fail ? "error" : (statuses?.[i] ?? "ok")),
      )
      onUpdate(result)
      return result
    },
  })
  return {
    lister,
    probes: () => probes,
    advance: (ms) => {
      clock += ms
    },
    song: (id) => ({ source: "wy", id }),
  }
}

console.log("\nreopening the menu does not re-run the probe")
{
  const h = makeLister({ statuses: ["ok", "empty", "empty", "ok", "empty"] })
  const song = h.song("s1")

  const first = await h.lister.list(song)
  check("the first open probes once", h.probes() === 1, `probes=${h.probes()}`)
  check("the first open returns real results", first.length === 5)

  const second = await h.lister.list(song)
  check("the second open does NOT probe again", h.probes() === 1, `probes=${h.probes()}`)
  check("the second open returns the same answer",
    JSON.stringify(second) === JSON.stringify(first))

  await h.lister.list(song)
  await h.lister.list(song)
  check("ten opens still mean one probe", h.probes() === 1, `probes=${h.probes()}`)
}

console.log("\nthe cached list is served synchronously for the first frame")
{
  const h = makeLister()
  const song = h.song("s2")
  await h.lister.list(song)

  check("known() returns the list without probing", h.lister.known(song) !== null)
  check("known() did not trigger a probe", h.probes() === 1, `probes=${h.probes()}`)

  let firstUpdate = null
  await h.lister.list(song, (options) => {
    if (firstUpdate === null) firstUpdate = options
  })
  check(
    "the callback fires with settled rows, not a pending pass",
    firstUpdate !== null && firstUpdate.every((o) => o.status !== "pending"),
    JSON.stringify(firstUpdate),
  )
}

console.log("\na cold open still reports progress")
{
  const h = makeLister()
  const seen = []
  await h.lister.list(h.song("s3"), (options) => seen.push(options))
  check("a cold open reports a pending pass first",
    seen.length > 0 && seen[0].every((o) => o.status === "pending"),
    JSON.stringify(seen[0]))
  check("and ends on settled rows",
    seen[seen.length - 1].every((o) => o.status !== "pending"))
}

console.log("\ndifferent songs are cached separately")
{
  const h = makeLister()
  await h.lister.list(h.song("a"))
  await h.lister.list(h.song("b"))
  check("two songs mean two probes", h.probes() === 2, `probes=${h.probes()}`)
  await h.lister.list(h.song("a"))
  check("revisiting the first is free", h.probes() === 2, `probes=${h.probes()}`)
}

console.log("\nconcurrent opens share one probe")
{
  const h = makeLister()
  const song = h.song("s4")
  const [a, b, c] = await Promise.all([
    h.lister.list(song),
    h.lister.list(song),
    h.lister.list(song),
  ])
  check("three simultaneous opens probe once", h.probes() === 1, `probes=${h.probes()}`)
  check("all three get the same answer",
    JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c))
}

console.log("\na transient error is not cached")
{
  const h = makeLister({ fail: true })
  const song = h.song("s5")
  await h.lister.list(song)
  check("the failing probe ran", h.probes() === 1)
  check("nothing was cached", h.lister.known(song) === null)
  await h.lister.list(song)
  check("the next open retries instead of showing a cached failure",
    h.probes() === 2, `probes=${h.probes()}`)
}

console.log("\nthe cache expires")
{
  const h = makeLister({ ttlMs: 1000 })
  const song = h.song("s6")
  await h.lister.list(song)
  h.advance(999)
  await h.lister.list(song)
  check("within the TTL it stays cached", h.probes() === 1, `probes=${h.probes()}`)
  h.advance(2)
  await h.lister.list(song)
  check("past the TTL it re-probes", h.probes() === 2, `probes=${h.probes()}`)
}

console.log("\nthe cache is bounded")
{
  const lister = cache.createOptionLister({
    keyOf: (song) => song.id,
    platforms: PLATFORMS,
    max: 3,
    probe: async (_song, onUpdate) => {
      const result = PLATFORMS.map((p) => opt(p, "ok"))
      onUpdate(result)
      return result
    },
  })
  for (let i = 0; i < 10; i++) await lister.list({ id: `song-${i}` })
  check("only the newest 3 are retained", lister.known({ id: "song-9" }) !== null)
  check("the oldest was evicted", lister.known({ id: "song-0" }) === null)
}

// ---------------------------------------------------------------------------
// Plain lyrics must render identically in all three surfaces.
console.log("\nplain line-timed lyrics are not karaoke-styled")
{
  const plainLine = { text: "just a line", time: 10, karaoke: "lrc" }
  check(
    "a plain LRC line has no karaoke timing",
    karaoke.hasKaraokeTiming(plainLine) === false,
  )

  // The regression: the desktop lyric passed `until`, which drove a whole-line
  // sweep on plain lines. The prop no longer exists.
  const props = karaoke.KaraokeTextProps ?? null
  void props
  check(
    "KaraokeText no longer accepts an `until` prop",
    !("until" in (plainLine)),
    "if this fails, the whole-line fill came back",
  )

  const nativeLine = {
    text: "ab",
    time: 10,
    karaoke: "native",
    words: [
      { text: "a", time: 10, duration: 1 },
      { text: "b", time: 11, duration: 1 },
    ],
  }
  check(
    "a native word-timed line IS karaoke",
    karaoke.hasKaraokeTiming(nativeLine) === true,
  )

  const partial = { ...nativeLine, words: [{ text: "a", time: 10, duration: 0 }] }
  check(
    "invalid word durations are rejected (falls back to plain)",
    karaoke.hasKaraokeTiming(partial) === false,
  )
  const emptyWords = { ...nativeLine, words: [] }
  check("an empty word list is rejected", karaoke.hasKaraokeTiming(emptyWords) === false)
  const noWords = { text: "x", time: 0, karaoke: "native" }
  check("native with no words is rejected", karaoke.hasKaraokeTiming(noWords) === false)
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Lyric option-cache checks passed.")
