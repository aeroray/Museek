// Verifies the virtual-list windowing maths, which is what produced the
// reported "large blank areas while scrolling search results".
//
// IMPORTANT — why this imports the component's module:
//
// This check used to re-implement the arithmetic locally and only regex-read
// two constants out of VirtualList.tsx. That made it vacuous: it stayed green
// when the real computation was replaced with `start = 0`, which IS the reported
// bug. It could only fail if someone edited DEFAULT_ROW or OVERSCAN.
//
// So the maths now lives in `src/components/common/virtualWindow.ts`, the
// component imports it, and this check imports the same module. A change to the
// windowing logic is therefore observable here by construction.
//
// The failure was never in this arithmetic — it was that VirtualList never
// received its scrollElement, so `scrollTop` stayed 0 and the window never
// moved while the container kept growing. But the arithmetic decides whether a
// given scrollTop paints rows over the viewport, so it is worth pinning
// directly: a wrong window looks exactly like the same bug.
//
//   node scripts/check-virtual-list-window.mjs
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createTsLoader } from "./lib/load-ts.mjs"

const root = resolve(import.meta.dirname, "..")
const load = createTsLoader()
const { virtualWindow } = await load("src/components/common/virtualWindow.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

// Read the component's constants so a change there cannot silently diverge from
// this check. The arithmetic itself is imported, not copied.
const componentSrc = readFileSync(
  join(root, "src/components/common/VirtualList.tsx"),
  "utf8",
)
const rowMatch = /const DEFAULT_ROW = (\d+)/.exec(componentSrc)
const overMatch = /const OVERSCAN = (\d+)/.exec(componentSrc)
if (!rowMatch || !overMatch) {
  console.error("could not read DEFAULT_ROW/OVERSCAN from VirtualList.tsx")
  process.exit(1)
}
const ROW = Number(rowMatch[1])
const OVERSCAN = Number(overMatch[1])

/** Guard: the component must actually call the shared helper. */
check(
  "VirtualList imports the shared windowing module",
  /from "\.\/virtualWindow"/.test(componentSrc),
)

const windowFor = (scrollTop, viewH, itemCount) =>
  virtualWindow(scrollTop, viewH, itemCount, ROW, OVERSCAN)

/** Do the painted rows span the viewport? The bug was that they did not. */
function coversViewport({ start, end }, scrollTop, viewH) {
  if (end <= start) return false
  const firstTop = start * ROW - scrollTop
  const lastBottom = end * ROW - scrollTop
  return firstTop <= 0 && lastBottom >= viewH
}

console.log("container height")
check("empty list has no height", windowFor(0, 600, 0).total === 0)
check("20 rows is 1120px", windowFor(0, 600, 20).total === 1120)
check("70 rows is 3920px", windowFor(0, 600, 70).total === 3920)

console.log("\nwindow follows scrollTop")
const viewH = 587
const longList = 70
let allCover = true
let prevStart = -1
for (const scrollTop of [0, 300, 560, 561, 1000, 2000, 2500, 3200]) {
  const w = windowFor(scrollTop, viewH, longList)
  const covers = coversViewport(w, scrollTop, viewH)
  const advanced = w.start >= prevStart
  if (!covers || !advanced) {
    allCover = false
    console.log(`   at scrollTop=${scrollTop}: start=${w.start} end=${w.end} covers=${covers}`)
  }
  prevStart = w.start
}
check("rows always cover the viewport (the reported blank-screen case)", allCover)

console.log("\nthe specific failure that was reported")
{
  // 70 rows, scrolled 2500px: the old build left translateY at 0, so the window
  // was rows 0..30 and every one of them sat above the viewport.
  const w = windowFor(2500, viewH, longList)
  check(`window starts well past row 0 (start=${w.start})`, w.start > 0)
  check(`offset equals start*rowHeight (offset=${w.offset})`, w.offset === w.start * ROW)
  check("rows still cover the viewport", coversViewport(w, 2500, viewH))
  // What the buggy build did: window pinned at the top.
  const stuck = { start: 0, end: 31 }
  check("a stuck-at-zero window does NOT cover (so this check can fail)", !coversViewport(stuck, 2500, viewH))
  // And the exact mutation that used to slip through: start pinned to 0.
  const pinned = { ...w, start: 0, end: 31 }
  check("the `start = 0` mutation would be caught here", !coversViewport(pinned, 2500, viewH))
}

console.log("\nshort lists and edges")
{
  const w = windowFor(0, viewH, 20)
  check("20 rows: start clamps to 0", w.start === 0)
  check("20 rows: end covers the list", w.end === 20)
  check("20 rows at top covers viewport", coversViewport(w, 0, viewH))
  const wEnd = windowFor(533, viewH, 20)
  check("scrolling to the bottom of a short list still covers", coversViewport(wEnd, 533, viewH))
}
{
  // 70 rows is 3920px, so the furthest a 587px viewport can scroll is 3333 —
  // asking for more than that is not a state the browser can produce.
  const maxScroll = 70 * ROW - viewH
  const w = windowFor(maxScroll, viewH, 70)
  check("end never exceeds itemCount", w.end <= 70)
  check(`last page covers the viewport (scrollTop=${maxScroll})`, coversViewport(w, maxScroll, viewH))
}
{
  const w = windowFor(0, 0, 40)
  check("viewH=0 falls back to 600 (first paint, before measure)", w.end - w.start > 0)
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Virtual-list window checks passed.")
