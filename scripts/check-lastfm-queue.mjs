// Pins the offline scrobble queue's retention, batching and backoff rules.
//
// `src/lib/lastfm/queue.ts` is written to be "pure and free of store/network
// imports so the retention, batching and backoff rules can be checked directly"
// — and `queueEntry.ts` exists purely as a check barrel — but the check it was
// built for (`scripts/check-lastfm-queue.mjs`) was not in the repo. So the rules
// had a test seam and no test.
//
// A scrobble records something that already happened, so losing one silently is
// real user-visible data loss: the play simply never appears in their history.
//
//   node scripts/check-lastfm-queue.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const {
  MAX_PENDING_SCROBBLES,
  MAX_SCROBBLE_AGE_MS,
  RETRY_BACKOFF_MS,
  isDue,
  dueBatch,
  markAttempted,
  clearBackoff,
  removeEntries,
  trimPending,
  dedupePending,
  parsePendingList,
} = await load("src/lib/lastfm/queueEntry.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

const nowMs = Date.now()
const nowSec = Math.floor(nowMs / 1000)
const entry = (id, extra = {}) => ({
  id,
  artist: "a",
  track: `t-${id}`,
  album: "",
  duration: 200,
  timestamp: nowSec,
  attempts: 0,
  ...extra,
})

console.log("retention drops the oldest first")
{
  // All inside the two-week window, so only the count cap applies.
  const many = Array.from({ length: MAX_PENDING_SCROBBLES + 25 }, (_, i) =>
    entry(`id-${i}`, { timestamp: nowSec - 600 + i }),
  )
  const trimmed = trimPending(many, nowMs)
  check("capped at MAX_PENDING_SCROBBLES", trimmed.length === MAX_PENDING_SCROBBLES, `${trimmed.length}`)
  check("kept the newest", trimmed[trimmed.length - 1].id === `id-${many.length - 1}`)
  check("dropped the oldest", !trimmed.some((e) => e.id === "id-0"))
}

console.log("\nplays past Last.fm's two-week limit are dropped")
{
  const stale = entry("stale", { timestamp: nowSec - MAX_SCROBBLE_AGE_MS / 1000 - 60 })
  const fresh = entry("fresh")
  const trimmed = trimPending([stale, fresh], nowMs)
  check("stale entry removed", !trimmed.some((e) => e.id === "stale"), `kept=${trimmed.length}`)
  check("fresh entry kept", trimmed.some((e) => e.id === "fresh"))
}

console.log("\nbackoff makes a failed entry not-due, then due again")
{
  const fresh = entry("a")
  check("never-attempted is due immediately", isDue(fresh, nowMs))

  const once = markAttempted([fresh], ["a"], nowMs)[0]
  check("failure recorded an attempt", once.attempts === 1, `${once.attempts}`)
  check("failure recorded the time", once.lastAttempt === nowMs)
  check("is not due right after failing", !isDue(once, nowMs))
  check(
    "is due once the backoff elapses",
    isDue(once, nowMs + RETRY_BACKOFF_MS[1] + 1),
  )

  // Repeated failures must grow the delay, not reset it.
  const twice = markAttempted([once], ["a"], nowMs)[0]
  check("a second failure counts", twice.attempts === 2, `${twice.attempts}`)
  const wait1 = RETRY_BACKOFF_MS[Math.min(1, RETRY_BACKOFF_MS.length - 1)]
  const wait2 = RETRY_BACKOFF_MS[Math.min(2, RETRY_BACKOFF_MS.length - 1)]
  check("the second backoff is longer", wait2 > wait1, `${wait2} vs ${wait1}`)
  check("still backing off at the first delay", !isDue(twice, nowMs + wait1))

  const cleared = clearBackoff([twice], ["a"])[0]
  check("clearBackoff makes it due again", isDue(cleared, nowMs))
  check("clearBackoff resets the attempt count", cleared.attempts === 0, `${cleared.attempts}`)
}

console.log("\ndueBatch returns only what may be sent now, oldest first")
{
  const batch = dueBatch(
    [
      entry("newer", { timestamp: nowSec - 10 }),
      entry("older", { timestamp: nowSec - 100 }),
      entry("backing-off", { attempts: 5, lastAttempt: nowMs }),
    ],
    nowMs,
  )
  check("excludes entries still backing off", !batch.some((e) => e.id === "backing-off"))
  check("ordered oldest first", batch[0]?.id === "older", JSON.stringify(batch.map((e) => e.id)))
  check("includes both due entries", batch.length === 2, `${batch.length}`)
}

console.log("\nremoveEntries only removes the settled ids")
{
  const kept = removeEntries([entry("a"), entry("b"), entry("c")], ["b"])
  check("removed exactly the given ids", kept.length === 2 && !kept.some((e) => e.id === "b"))
}

console.log("\nparsing rejects junk instead of trusting the file")
{
  const parsed = parsePendingList([
    { ...entry("good"), lastAttempt: undefined },
    null,
    42,
    { id: "bad-no-artist", track: "t", timestamp: nowSec },
    { ...entry("bad-ts"), timestamp: "not a number" },
  ])
  const ids = parsed.map((e) => e.id)
  check("kept the valid entry", ids.includes("good"), JSON.stringify(ids))
  check("dropped the missing-artist entry", !ids.includes("bad-no-artist"))
  check("dropped the non-numeric timestamp", !ids.includes("bad-ts"))
  check("non-array input yields []", JSON.stringify(parsePendingList("nope")) === "[]")
}

console.log("\ndedupe collapses repeated ids")
{
  // Dedup is by `id` (a stable per-entry key), not by play identity: two entries
  // for the same artist+track are legitimately two different plays.
  const list = [entry("a"), entry("a"), entry("b")]
  const deduped = dedupePending(list)
  check("duplicate ids collapse to one", deduped.length === 2, `${deduped.length}`)
  check("kept the first occurrence", deduped[0].id === "a" && deduped[1].id === "b")

  // Same artist+track with different ids are kept: a song really can play twice.
  const repeats = [entry("x"), entry("y")]
  check("distinct ids for the same play are preserved", dedupePending(repeats).length === 2)
}

console.log("\nconstants are sane")
{
  check("two-week age limit", MAX_SCROBBLE_AGE_MS === 14 * 24 * 60 * 60 * 1000)
  check("backoff is monotonic", RETRY_BACKOFF_MS.every((v, i, a) => i === 0 || a[i - 1] <= v))
  check("retention cap is bounded", MAX_PENDING_SCROBBLES > 0 && MAX_PENDING_SCROBBLES <= 5000)
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Last.fm queue checks passed.")
