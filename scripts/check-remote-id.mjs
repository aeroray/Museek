// Pins `remoteId()` and the guards that depend on it.
//
// `String(undefined)` is the *truthy* string "undefined". Every platform adapter
// read ids straight out of untrusted JSON, so a row whose id field was missing
// sailed past `if (!songId) continue` and became a track with id `kg_undefined`.
// Those rows then deduped into a single card, so the visible symptom was a
// search result that quietly vanished.
//
//   node scripts/check-remote-id.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const { remoteId } = await load("src/lib/utils.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

console.log("missing ids coerce to empty, not the string \"undefined\"")
{
  check("undefined -> \"\"", remoteId(undefined) === "", JSON.stringify(remoteId(undefined)))
  check("null -> \"\"", remoteId(null) === "", JSON.stringify(remoteId(null)))
  check("the literal string \"undefined\" -> \"\"", remoteId("undefined") === "")
  check("the literal string \"null\" -> \"\"", remoteId("null") === "")
  check("undefined is falsy once coerced (the guard fix)", !remoteId(undefined))
}

console.log("\nreal ids survive untouched")
{
  check("number stays as text", remoteId(1234) === "1234", remoteId(1234))
  check("numeric string", remoteId("1234") === "1234", remoteId("1234"))
  check("zero is a real id, not missing", remoteId(0) === "0", JSON.stringify(remoteId(0)))
  check("zero is truthy as a string (guards keep it)", Boolean(remoteId(0)))
  check("string zero", remoteId("0") === "0")
  check("hex hash id", remoteId("A1B2C3D4E5") === "A1B2C3D4E5")
  check("empty string stays empty", remoteId("") === "")
}

console.log("\nthe actual bug: an id assembled from a missing field")
{
  // What the adapters used to do.
  const oldWay = String(undefined)
  const newWay = remoteId(undefined)
  check("old form was truthy (so the guard never fired)", Boolean(oldWay))
  check("old form produced a bogus track id", `kg_${oldWay}` === "kg_undefined")
  check("new form is falsy, so the guard drops the row", !newWay)
  check("new form cannot produce a bogus id", `kg_${newWay}` === "kg_")
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("remoteId checks passed.")
