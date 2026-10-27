// Pins several pure-logic fixes found in code review. Each block names the bug
// it prevents so a future reader knows why the assertion exists.
//
//   node scripts/check-domain-fixes.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const { formatAlbumDate } = await load("src/lib/albums/date.ts")
const { formatDuration, parseDurationSeconds, remoteId } = await load("src/lib/utils.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

console.log("album publish date uses a fixed timezone, not the host's")
{
  // 2024-01-01T02:00:00Z is 2024-01-01 10:00 in UTC+8 — a date the platforms mean
  // as Jan 1. A host west of UTC+8 reading it locally would get Dec 31.
  const ms = Date.UTC(2024, 0, 1, 2, 0, 0)
  check("epoch ms renders as the published calendar date", formatAlbumDate(ms) === "2024-01-01", formatAlbumDate(ms))

  // 2024-01-01T20:00:00Z is 2024-01-02 04:00 in UTC+8 — platforms mean Jan 2.
  const later = Date.UTC(2024, 0, 1, 20, 0, 0)
  check("a late-UTC publish rolls forward in UTC+8", formatAlbumDate(later) === "2024-01-02", formatAlbumDate(later))

  check("pre-epoch placeholders are rejected", formatAlbumDate(12345) === undefined)
  check("ISO strings pass through", formatAlbumDate("2023-07-09T00:00:00Z") === "2023-07-09")
  check("bare years pass through", formatAlbumDate("2021") === "2021")
  check("empty is undefined", formatAlbumDate("") === undefined)
}

console.log("\ndurations never render as NaN")
{
  check("finite seconds format", formatDuration(227) === "3:47", formatDuration(227))
  check("zero", formatDuration(0) === "0:00")
  check("NaN does not leak into the UI", formatDuration(Number.NaN) === "0:00", formatDuration(Number.NaN))
  check("Infinity is handled", formatDuration(Number.POSITIVE_INFINITY) === "0:00")
  check("negative is handled", formatDuration(-5) === "0:00", formatDuration(-5))
}

console.log("\nplatform duration strings parse instead of becoming NaN")
{
  check("plain seconds", parseDurationSeconds(227) === 227)
  check("numeric string", parseDurationSeconds("227") === 227)
  check("mm:ss (the mg regression)", parseDurationSeconds("3:47") === 227, String(parseDurationSeconds("3:47")))
  check("h:mm:ss", parseDurationSeconds("1:03:47") === 3827, String(parseDurationSeconds("1:03:47")))
  check("milliseconds", parseDurationSeconds(227000) === 227, String(parseDurationSeconds(227000)))
  check("garbage is 0", parseDurationSeconds("abc") === 0)
  check("null is 0", parseDurationSeconds(null) === 0)
  check("undefined is 0", parseDurationSeconds(undefined) === 0)
}

console.log("\nremote ids never become the string \"undefined\"")
{
  check("undefined -> empty", remoteId(undefined) === "")
  check("null -> empty", remoteId(null) === "")
  check("zero survives", remoteId(0) === "0")
  check("number survives", remoteId(42) === "42")
  check("string survives", remoteId("abc") === "abc")
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Domain fixes checks passed.")
