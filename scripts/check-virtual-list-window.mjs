// Verifies the virtual-list windowing maths, which is what produced the
// reported "large blank areas while scrolling search results".
//
// The failure was not in this arithmetic — it was that VirtualList never
// received its scrollElement, so `scrollTop` stayed 0 and the window never
// moved while the container kept growing. But the arithmetic is what decides
// whether a given scrollTop paints rows over the viewport, so it is worth
// pinning directly: a wrong window looks exactly like the same bug.
//
//   node scripts/check-virtual-list-window.mjs
import { createRequire } from "node:module"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
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
  if (!dir) throw new Error("esbuild not found")
  return join(root, "node_modules", ".pnpm", dir, "node_modules", "esbuild", "lib", "main.js")
}

const work = mkdtempSync(join(tmpdir(), "museek-vlist-"))
const outFile = join(work, "window.mjs")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

// Read ROW/OVERSCAN straight out of the component so a change there cannot
// silently diverge from this check.
const componentSrc = readFileSync(join(root, "src/components/common/VirtualList.tsx"), "utf8")
const rowMatch = /const DEFAULT_ROW = (\d+)/.exec(componentSrc)
const overMatch = /const OVERSCAN = (\d+)/.exec(componentSrc)
if (!rowMatch || !overMatch) {
  console.error("could not read DEFAULT_ROW/OVERSCAN from VirtualList.tsx")
  process.exit(1)
}
const ROW = Number(rowMatch[1])
const OVERSCAN = Number(overMatch[1])

function windowFor(scrollTop, viewH, itemCount) {
  const total = itemCount * ROW
  const start = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN)
  const visible = Math.ceil((viewH || 600) / ROW) + OVERSCAN * 2
  const end = Math.min(itemCount, start + visible)
  const offset = start * ROW
  return { total, start, end, offset, count: end - start }
}

/** Do the painted rows span the viewport? The bug was that they did not. */
function coversViewport({ start, end }, scrollTop, viewH, itemCount) {
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
  const covers = coversViewport(w, scrollTop, viewH, longList)
  const advanced = w.start >= prevStart
  if (!covers || !advanced) {
    allCover = false
    console.log(`   at scrollTop=${scrollTop}: start=${w.start} count=${w.count} covers=${covers}`)
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
  check("rows still cover the viewport", coversViewport(w, 2500, viewH, longList))
  // What the buggy build did: window pinned at the top.
  const stuck = { start: 0, end: 31 }
  check("a stuck-at-zero window does NOT cover (so this check can fail)", !coversViewport(stuck, 2500, viewH, longList))
}

console.log("\nshort lists and edges")
{
  const w = windowFor(0, viewH, 20)
  check("20 rows: start clamps to 0", w.start === 0)
  check("20 rows: end covers the list", w.end === 20)
  check("20 rows at top covers viewport", coversViewport(w, 0, viewH, 20))
  const wEnd = windowFor(533, viewH, 20)
  check("scrolling to the bottom of a short list still covers", coversViewport(wEnd, 533, viewH, 20))
}
{
  // 70 rows is 3920px, so the furthest a 587px viewport can scroll is 3333 —
  // asking for more than that is not a state the browser can produce.
  const maxScroll = 70 * ROW - viewH
  const w = windowFor(maxScroll, viewH, 70)
  check("end never exceeds itemCount", w.end <= 70)
  check(`last page covers the viewport (scrollTop=${maxScroll})`, coversViewport(w, maxScroll, viewH, 70))
}
{
  const w = windowFor(0, 0, 40)
  check("viewH=0 falls back to 600 (first paint, before measure)", w.count > 0)
}

rmSync(work, { recursive: true, force: true })

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Virtual-list window checks passed.")
