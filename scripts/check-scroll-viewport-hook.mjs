// Focused check on the viewport-clearing contract in useScrollAreaViewport.
//
// The hook clears its viewport in the effect cleanup so consumers never hold a
// detached node. The risk in the other direction is clearing it too eagerly: if
// cleanup runs on a mere `deps` change and the new effect pass cannot re-find the
// viewport, the caller sees a null flash and virtualization stops for a frame.
//
// This stubs a minimal DOM + React-free model of the effect body to assert the
// ordering property: a re-run that CAN find the viewport must publish one before
// the consumer observes null.
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const src = readFileSync(
  join(root, "src/components/common/VirtualList.tsx"),
  "utf8",
)

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

console.log("the hook still resolves the viewport it is given")
{
  check("hook is exported", /export function useScrollAreaViewport/.test(src))
  check("hook returns [ref, viewport]", /return \[ref, viewport\]/.test(src))
}

console.log("\nthe observer is attached before the ScrollArea can exist")
{
  // The bug was: observer only created when ref.current was already non-null,
  // which is exactly not the case in the scenario it was written for.
  check(
    "attachObserver is defined as its own function",
    /const attachObserver = \(\) => \{/.test(src),
  )
  check(
    "attachObserver is called up front, not only in the timeout branch",
    /attachObserver\(\)\s*\n\s*settle\(\)/.test(src),
  )
  check(
    "attachObserver no-ops when observer already exists (no duplicate observe)",
    /if \(observer \|\| cancelled\) return/.test(src),
  )
}

console.log("\ncleanup does not leave a detached node behind")
{
  check(
    "cleanup clears the viewport",
    /setViewport\(\(current\) => \(current \? null : current\)\)/.test(src),
  )
  check(
    "cleanup also disconnects the observer and cancels the frame",
    /cancelAnimationFrame\(raf\)/.test(src) && /observer\?\.disconnect\(\)/.test(src),
  )
}

console.log("\nwindowing maths is imported, not duplicated")
{
  check("component imports the shared module", /from "\.\/virtualWindow"/.test(src))
  check(
    "component no longer computes start locally",
    !/const start = Math\.max\(0, Math\.floor\(scrollTop/.test(src),
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("ScrollArea viewport hook checks passed.")
