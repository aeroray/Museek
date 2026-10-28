// Pins the play/pause glyph geometry.
//
// The button morphs one <path> between two `d` strings. If their bounding boxes
// do not share a centre, the glyph visibly jumps sideways on every toggle. That
// is exactly what shipped: the play path started at x=6 and ran to x=19, giving
// it a centre of (12.5, 12) against the pause path's (12, 12) — a half-pixel
// shift, small enough to read as "the icon wiggles" rather than as a bug.
//
// The paths are intentionally different SIZES (a triangle reads larger than two
// bars, so the play triangle is 13x14.8 against the bars' 12x14), so this cannot
// assert equal boxes. It asserts the invariant that actually matters: both are
// centred on the viewBox centre, and neither exceeds it.
//
//   node scripts/check-play-pause-geometry.mjs
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const src = readFileSync(
  join(root, "src/components/player/PlayPauseButton.tsx"),
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

/** Pull a `const NAME = "M ..."` path literal out of the component source. */
function pathLiteral(name) {
  const m = new RegExp(`const ${name} =\\s*\\n?\\s*"([^"]+)"`).exec(src)
  return m?.[1] ?? null
}

const VIEWBOX = 24
const CENTER = VIEWBOX / 2

function bbox(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const xs = []
  const ys = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    xs.push(nums[i])
    ys.push(nums[i + 1])
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

const play = pathLiteral("PLAY_PATH")
const pause = pathLiteral("PAUSE_PATH")

check("PLAY_PATH is declared", Boolean(play))
check("PAUSE_PATH is declared", Boolean(pause))

if (play && pause) {
  const bp = bbox(play)
  const bq = bbox(pause)
  const cp = { x: (bp.minX + bp.maxX) / 2, y: (bp.minY + bp.maxY) / 2 }
  const cq = { x: (bq.minX + bq.maxX) / 2, y: (bq.minY + bq.maxY) / 2 }

  console.log(`  play  centre (${cp.x}, ${cp.y})  box ${bp.maxX - bp.minX}x${bp.maxY - bp.minY}`)
  console.log(`  pause centre (${cq.x}, ${cq.y})  box ${bq.maxX - bq.minX}x${bq.maxY - bq.minY}`)

  check(
    "play is horizontally centred on the viewBox",
    cp.x === CENTER,
    `centre x = ${cp.x}, want ${CENTER}`,
  )
  check(
    "play is vertically centred on the viewBox",
    cp.y === CENTER,
    `centre y = ${cp.y}, want ${CENTER}`,
  )
  check(
    "pause is horizontally centred on the viewBox",
    cq.x === CENTER,
    `centre x = ${cq.x}, want ${CENTER}`,
  )
  check(
    "pause is vertically centred on the viewBox",
    cq.y === CENTER,
    `centre y = ${cq.y}, want ${CENTER}`,
  )
  check(
    "the two glyphs share a centre (no jump on toggle)",
    cp.x === cq.x && cp.y === cq.y,
    `play (${cp.x}, ${cp.y}) vs pause (${cq.x}, ${cq.y})`,
  )

  // Each path stays inside the viewBox, so nothing is clipped by the 24x24 box.
  for (const [name, b] of [
    ["play", bp],
    ["pause", bq],
  ]) {
    check(
      `${name} stays inside the viewBox`,
      b.minX >= 0 && b.minY >= 0 && b.maxX <= VIEWBOX && b.maxY <= VIEWBOX,
      `x=[${b.minX},${b.maxX}] y=[${b.minY},${b.maxY}]`,
    )
  }

  // Both must be well-formed SVG path data (the morph animation needs this).
  for (const [name, d] of [
    ["play", play],
    ["pause", pause],
  ]) {
    check(
      `${name} uses only absolute move/line/close commands`,
      /^M[\s\d.,]+L/.test(d) && !/[a-df-zA-DF-Z]/.test(d.replace(/[MLZ]/g, "")),
      d.slice(0, 40) + "...",
    )
  }
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Play/pause geometry checks passed.")
