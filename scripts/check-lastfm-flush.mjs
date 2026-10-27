// Pins the Last.fm flush re-entrancy rule.
//
// `flush()` guards on `state.flushing`, sets it true, and clears it in `finally`.
// The "anything still pending and already due gets another pass" retry used to
// call `get().flush()` INLINE, from inside the try block — at which point
// `flushing` was still true, so the recursive call hit the guard at the top of
// `flush` and returned immediately. The retry was dead code, and a
// partially-settled batch never drained until some unrelated flush trigger fired.
//
// Driving the real store needs network + persistence stubs, so this pins the
// structural invariant that makes the bug impossible instead: the re-flush must
// not happen before `flushing` is cleared. It also asserts the retry still
// exists — deleting it would trade the stall for no retry at all.
//
//   node scripts/check-lastfm-flush.mjs
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const src = readFileSync(join(root, "src/stores/lastfmStore.ts"), "utf8")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

/** The body of `async flush(...) { ... }`, up to the next top-level method. */
const flushStart = src.indexOf("async flush(")
if (flushStart < 0) {
  console.error("could not find flush() in src/stores/lastfmStore.ts")
  process.exit(1)
}
// Take a generous slice: flush() is followed by the next store method.
const nextMethod = src.indexOf("\n  async ", flushStart + 10)
const flushBody = src.slice(flushStart, nextMethod > 0 ? nextMethod : undefined)

console.log("the guard and the flag exist")
{
  check("flush guards on state.flushing", /if \(state\.flushing\) return/.test(flushBody))
  check("flush raises the flag", /set\(\{ flushing: true \}\)/.test(flushBody))
  check("flush clears it in a finally", /finally[\s\S]*?set\(\{ flushing: false \}\)/.test(flushBody))
}

console.log("\nthe retry is deferred past the finally, not called inline")
{
  // The bug: an inline `void get().flush()` while flushing is still true.
  const inlineCall = /else\s+void get\(\)\.flush\(\)/.test(flushBody)
  const bareInline = /(?:^|[;{}\s])void get\(\)\.flush\(\)\s*;?\s*\n?\s*\}\s*catch/.test(flushBody)
  check("no inline flush() before the finally", !inlineCall && !bareInline)

  check(
    "the retry is recorded as a flag",
    /needsAnotherPass\s*=\s*true/.test(flushBody),
    "expected `needsAnotherPass = true`",
  )
  check(
    "the retry runs after flushing is cleared",
    /finally\s*\{[\s\S]*?set\(\{ flushing: false \}\)[\s\S]*?needsAnotherPass[\s\S]*?get\(\)\.flush\(\)/.test(
      flushBody,
    ),
    "expected the re-flush inside the finally, after the flag clears",
  )
  check(
    "the deferred retry is async (does not recurse on the same stack)",
    /queueMicrotask|setTimeout/.test(flushBody),
  )
}

console.log("\nthe retry is conditioned on there being more work")
{
  check(
    "the flag is only set when more entries are due",
    /if \(done\.length && dueBatch\(get\(\)\.pending\)\.length\)/.test(flushBody) ||
      /dueBatch\(get\(\)\.pending\)\.length\)\s*\{\s*\n\s*needsAnotherPass/.test(flushBody),
    "expected a dueBatch(...).length condition around the flag",
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Last.fm flush checks passed.")
