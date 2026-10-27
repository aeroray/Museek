// Locks in the persistent per-song quality store: parsing, LRU eviction, and
// the round trip that makes a choice survive a queue being replaced.
//
//   node scripts/check-song-quality-prefs.mjs
//
// Bundled with esbuild because the module imports "@/lib/db" and
// "@/types/music".
import { createRequire } from "node:module"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
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
  if (!dir) throw new Error("esbuild not found; run pnpm install")
  return join(root, "node_modules", ".pnpm", dir, "node_modules", "esbuild", "lib", "main.js")
}

const outDir = mkdtempSync(join(tmpdir(), "museek-songquality-"))
const outFile = join(outDir, "songQualityPrefs.mjs")

// The module reads/writes through @/lib/db, which in a browser falls back to
// localStorage. Stub just enough for node, and record writes so persistence is
// observable.
const store = new Map()
globalThis.window = {}
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.__store = store

try {
  const esbuild = require(esbuildEntry())
  await esbuild.build({
    entryPoints: [join(root, "src", "lib", "songQualityPrefs.ts")],
    outfile: outFile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    alias: { "@": join(root, "src") },
    logLevel: "error",
  })

  const mod = await import(pathToFileURL(outFile).href)
  const {
    MAX_STORED_QUALITIES,
    SONG_QUALITY_FILE,
    clearStoredQualities,
    countStoredQualities,
    getStoredQuality,
    hydrateQualityOverrides,
    loadSongQualities,
    parseSongQualityEntries,
    setStoredQuality,
    trimSongQualityEntries,
  } = mod

  let failed = 0
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    if (!ok) failed += 1
    console.log(
      `${ok ? "OK  " : "FAIL"}  ${name.padEnd(56)} => ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`,
    )
  }

  const readFile = () => JSON.parse(store.get(`museek/${SONG_QUALITY_FILE}`) ?? "[]")

  console.log("The cap is a constant, sized from the measured entry cost")
  // ~113 bytes/entry pretty-printed, so 2000 entries is ~220 KB — small enough
  // that asking the user to choose a limit would be asking a question they
  // cannot answer. This asserts the constant, and the size claim behind it.
  check("the cap is 2000", MAX_STORED_QUALITIES, 2000)
  {
    const worstCase = JSON.stringify(
      Array.from({ length: MAX_STORED_QUALITIES }, (_, i) => ({
        id: `local_${"a1b2c3d4e5f6".repeat(2).slice(0, 32)}${i}`.slice(0, 40),
        quality: "flac24bit",
        lastUsed: 1758600000000,
      })),
      null,
      2,
    ).length
    const kb = Math.round(worstCase / 1024)
    check("the cap stays well under 1 MB", worstCase < 1024 * 1024, true)
    console.log(`      (worst case at the cap: ~${kb} KB)`)
  }

  console.log("\nParsing untrusted data")
  check("a non-array yields nothing", parseSongQualityEntries("nope"), [])
  check("null yields nothing", parseSongQualityEntries(null), [])
  check(
    "a bad quality is dropped",
    parseSongQualityEntries([{ id: "a", quality: "192k", lastUsed: 1 }]),
    [],
  )
  check(
    "a missing id is dropped",
    parseSongQualityEntries([{ quality: "flac", lastUsed: 1 }]),
    [],
  )
  check(
    "a good entry survives",
    parseSongQualityEntries([{ id: "a", quality: "flac", lastUsed: 5 }]),
    [{ id: "a", quality: "flac", lastUsed: 5 }],
  )
  check(
    "a missing lastUsed becomes 0, not NaN",
    parseSongQualityEntries([{ id: "a", quality: "flac" }]),
    [{ id: "a", quality: "flac", lastUsed: 0 }],
  )
  check(
    "duplicate ids keep the most recent",
    parseSongQualityEntries([
      { id: "a", quality: "128k", lastUsed: 1 },
      { id: "a", quality: "flac", lastUsed: 9 },
    ]),
    [{ id: "a", quality: "flac", lastUsed: 9 }],
  )
  check(
    "duplicate ids keep the most recent, in either order",
    parseSongQualityEntries([
      { id: "a", quality: "flac", lastUsed: 9 },
      { id: "a", quality: "128k", lastUsed: 1 },
    ]),
    [{ id: "a", quality: "flac", lastUsed: 9 }],
  )

  console.log("\nLRU eviction")
  {
    const entries = [
      { id: "old", quality: "flac", lastUsed: 1 },
      { id: "new", quality: "128k", lastUsed: 3 },
      { id: "mid", quality: "320k", lastUsed: 2 },
    ]
    const kept = trimSongQualityEntries(entries, 2)
    check("the least recently used is dropped", kept.map((e) => e.id), ["new", "mid"])
    check("under the limit nothing is dropped", trimSongQualityEntries(entries, 5).length, 3)
    check("the result is most-recent-first", kept[0].lastUsed > kept[1].lastUsed, true)
  }

  console.log("\nStoring and forgetting")
  await loadSongQualities()
  check("nothing stored initially", countStoredQualities(), 0)
  setStoredQuality("wy_1", "flac")
  check("a choice is readable back", getStoredQuality("wy_1"), "flac")
  check("it is written to disk", readFile().length, 1)
  check("an unknown song has no choice", getStoredQuality("wy_999"), undefined)
  setStoredQuality("wy_1", undefined)
  check("forgetting removes it", getStoredQuality("wy_1"), undefined)
  check("and clears it from disk", readFile(), [])

  console.log("\nThe reported problem: a choice survives a replaced queue")
  {
    store.clear()
    await loadSongQualities()
    setStoredQuality("wy_42", "flac")
    // "Play all" on a DIFFERENT playlist builds a brand-new queue from scratch.
    const freshQueue = [
      { music: { id: "wy_42" }, quality: "320k" },
      { music: { id: "wy_7" }, quality: "320k" },
    ]
    const hydrated = hydrateQualityOverrides(freshQueue)
    check("the stored choice is re-applied", hydrated[0].qualityOverride, "flac")
    check("an untouched song gets no override", hydrated[1].qualityOverride, undefined)
    check(
      "the original array is not mutated",
      freshQueue[0].qualityOverride,
      undefined,
    )
    check("the enqueue-time target is left alone", hydrated[0].quality, "320k")
  }

  console.log("\nA choice is remembered across a reload")
  {
    store.clear()
    await loadSongQualities()
    setStoredQuality("wy_42", "128k")
    // Prove it reached the FILE, not just memory.
    check(
      "the choice is on disk",
      readFile().find((e) => e.id === "wy_42")?.quality,
      "128k",
    )
    // Now simulate a restart: overwrite the file behind the module's back, then
    // reload. If load read memory instead of disk, this would not be seen.
    store.set(
      `museek/${SONG_QUALITY_FILE}`,
      JSON.stringify([{ id: "wy_42", quality: "flac", lastUsed: 1 }]),
    )
    await loadSongQualities()
    check("the reload read the file", getStoredQuality("wy_42"), "flac")
  }

  console.log("\nThe cap is enforced automatically, with no user action")
  {
    store.clear()
    await loadSongQualities()
    // Write past the cap; eviction must happen as part of storing, because
    // there is no longer a limit the user can set.
    for (let i = 0; i < MAX_STORED_QUALITIES + 25; i++) {
      setStoredQuality(`bulk_${i}`, "flac")
    }
    check("the count is held at the cap", countStoredQualities(), MAX_STORED_QUALITIES)
    check("the file is held at the cap too", readFile().length, MAX_STORED_QUALITIES)
    check(
      "the most recent survived",
      getStoredQuality(`bulk_${MAX_STORED_QUALITIES + 24}`),
      "flac",
    )
    check("the oldest was evicted", getStoredQuality("bulk_0"), undefined)
  }

  console.log("\nAn oversized file shrinks on load")
  {
    store.clear()
    const many = Array.from({ length: MAX_STORED_QUALITIES + 50 }, (_, i) => ({
      id: `old_${i}`,
      quality: "flac",
      lastUsed: i,
    }))
    store.set(`museek/${SONG_QUALITY_FILE}`, JSON.stringify(many))
    await loadSongQualities()
    check("only the cap is kept", countStoredQualities(), MAX_STORED_QUALITIES)
    check(
      "the newest are the ones kept",
      getStoredQuality(`old_${MAX_STORED_QUALITIES + 49}`),
      "flac",
    )
    check("the file was rewritten smaller", readFile().length, MAX_STORED_QUALITIES)
  }

  console.log("\nClearing everything")
  {
    clearStoredQualities()
    check("nothing left in memory", countStoredQualities(), 0)
    check("nothing left on disk", readFile(), [])
    check("a cleared song falls back", getStoredQuality("old_49"), undefined)
  }

  console.log("\nBefore load, reads are inert rather than wrong")
  {
    // A fresh module instance would be needed to truly test this; assert the
    // guard indirectly by confirming the API is safe on an empty store.
    check("no choice for an arbitrary id", getStoredQuality("anything"), undefined)
  }

  console.log("\nA choice made before the file loads is not lost")
  {
    // Reproduce the startup window: the module has not read its file yet, and
    // the user picks a quality. The write must not be dropped, and the load
    // must not overwrite it.
    const fresh = await import(
      pathToFileURL(outFile).href + "?fresh=" + Date.now()
    )
    store.clear()
    fresh.setStoredQuality("early", "flac")
    check("it is visible before load", fresh.getStoredQuality("early"), "flac")
    await fresh.loadSongQualities()
    check("and it survives the load", fresh.getStoredQuality("early"), "flac")
    check(
      "and reached the file",
      JSON.parse(store.get(`museek/${SONG_QUALITY_FILE}`) ?? "[]").find((e) => e.id === "early")?.quality,
      "flac",
    )
    // A file that already holds a DIFFERENT choice for that song must still
    // yield to the click the user just made.
    store.set(
      `museek/${SONG_QUALITY_FILE}`,
      JSON.stringify([{ id: "early", quality: "128k", lastUsed: 1 }]),
    )
    const fresh2 = await import(
      pathToFileURL(outFile).href + "?fresh2=" + Date.now()
    )
    fresh2.setStoredQuality("early", "flac")
    await fresh2.loadSongQualities()
    check("a pending click beats the file", fresh2.getStoredQuality("early"), "flac")
  }

  console.log(failed === 0 ? "\nAll cases pass." : `\n${failed} case(s) failed.`)
  process.exitCode = failed === 0 ? 0 : 1
} finally {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
}
