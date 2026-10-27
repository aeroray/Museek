// Pins the LRC parser against two field-standard shapes it used to mishandle.
//
//  1. A line may carry several timestamps — `[mm:ss.xx][mm:ss.yy]text` is the
//     normal encoding for a repeated chorus. Only the first used to be consumed,
//     and the rest were then rendered as literal sung text: the user saw
//     "[01:20.00]" in the middle of the lyric and the repeat never timed.
//  2. Minutes were capped at two digits, so every stamp past 100 minutes was
//     dropped. For a long file (DJ set, audiobook, live recording) that silently
//     erased the entire tail of the lyric.
//
//   node scripts/check-lrc-parser.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const { parseLrc } = await load("src/lib/lyrics/parser.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}
const texts = (lines) => lines.map((l) => l.text)
const times = (lines) => lines.map((l) => l.time)

console.log("multiple timestamps on one line (repeated chorus)")
{
  const lines = parseLrc("[00:12.00][01:20.00]same chorus\n[00:30.50]next line")
  check("expands to one entry per stamp", lines.length === 3, `got ${lines.length}`)
  check(
    "the later stamp is no longer literal text",
    lines.every((l) => !l.text.includes("[")),
    JSON.stringify(texts(lines)),
  )
  check(
    "both repeats carry the lyric",
    texts(lines).filter((t) => t === "same chorus").length === 2,
    JSON.stringify(texts(lines)),
  )
  check("stamps are 12, 30.5 and 80", JSON.stringify(times(lines)) === "[12,30.5,80]", JSON.stringify(times(lines)))
  check("result is time-sorted", times(lines).every((t, i, a) => i === 0 || a[i - 1] <= t), JSON.stringify(times(lines)))
}

console.log("\nthree stamps, and stamps with no body")
{
  const lines = parseLrc("[00:05.00][00:10.00][00:15.00]again\n[00:20.00]")
  check("three stamps expand", texts(lines).filter((t) => t === "again").length === 3, JSON.stringify(texts(lines)))
  check("empty body produces no line", lines.length === 3, `got ${lines.length}`)
}

console.log("\nstamps at or past 100 minutes")
{
  const lines = parseLrc("[100:00.00]hundred\n[99:00.00]ninety-nine\n[123:45.67]long")
  check("100 minutes parses", times(lines).includes(6000), JSON.stringify(times(lines)))
  check("99 minutes still parses", times(lines).includes(5940), JSON.stringify(times(lines)))
  check("123:45.67 parses", times(lines).includes(7425.67), JSON.stringify(times(lines)))
  check("nothing dropped", lines.length === 3, `got ${lines.length}`)
}

console.log("\nordinary LRC is unaffected")
{
  const lines = parseLrc("[00:01.00]one\n[00:02.500]two\n[00:03]three")
  check("three lines", lines.length === 3, `got ${lines.length}`)
  check("hundredths scale", lines[0].time === 1)
  check("milliseconds scale", lines[1].time === 2.5)
  check("bare seconds", lines[2].time === 3)
  check("text intact", JSON.stringify(texts(lines)) === '["one","two","three"]', JSON.stringify(texts(lines)))
}

console.log("\ntimestamps that are not at line start are left alone")
{
  const lines = parseLrc("[00:10.00]sales (2020,2021) units")
  check("one line", lines.length === 1, `got ${lines.length}`)
  check(
    "parenthesised number pair kept as text",
    lines[0].text.includes("2020,2021"),
    JSON.stringify(lines[0].text),
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("LRC parser checks passed.")
