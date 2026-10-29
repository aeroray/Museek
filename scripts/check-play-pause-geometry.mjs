// Pins the play/pause button's glyph geometry.
//
// History: this button used to morph a single <path> between a triangle and two
// bars. The paths were tuned until their bounding boxes shared the geometric
// centre (12, 12), and measuring the interpolation confirmed the box centre
// really does stay at x=12 for every t — yet it still looked like the icon
// slid sideways on press. Two shapes with matching bounding boxes can still have
// different optical centres (a triangle's mass sits toward its flat edge, two
// bars are symmetric), and a morph asserts "this is one object becoming another",
// which is exactly the claim those two glyphs cannot support.
//
// So the button now cross-fades two optically-balanced lucide glyphs. The
// invariant that matters is different, and this checks it:
//
//   1. no animated path `d` (no morph)
//   2. both glyphs render into one fixed-size box, so nothing resizes
//   3. both layers are absolutely positioned, so the outgoing and incoming
//      glyphs occupy identical geometry throughout the transition
//   4. the icon has no horizontal hover pose (the rule in check-icon-pose-jump)
//
//   node scripts/check-play-pause-geometry.mjs
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const path = join(root, "src/components/player/PlayPauseButton.tsx")
const src = readFileSync(path, "utf8")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

console.log("no path morph")
check(
  "does not animate a path `d`",
  !/animate=\{\{\s*d:/.test(src),
  "an animated `d` means the two glyphs are being interpolated as one shape",
)
check(
  "does not declare hand-drawn PLAY_PATH / PAUSE_PATH literals",
  !/const\s+(PLAY|PAUSE)_PATH\s*=/.test(src),
)
check(
  "uses the lucide Play and Pause glyphs",
  /\bPlay\b/.test(src) && /\bPause\b/.test(src),
)

console.log("\none fixed-size box for both glyphs")
check(
  "the glyph wrapper is sized from `iconSize`",
  /style=\{\{\s*width:\s*iconSize,\s*height:\s*iconSize\s*\}\}/.test(src),
)
check(
  "the wrapper is a positioned box (anchors the absolute layers)",
  /className="relative inline-flex items-center justify-center"/.test(src),
)
check(
  "glyph layers are absolutely positioned inside it",
  /className="absolute inset-0 inline-flex items-center justify-center"/.test(src),
)
check(
  "the keyed layer is keyed by glyph identity, not by a boolean",
  /key=\{glyphKey\}/.test(src) && /glyphKey\s*=\s*loading\s*\?/.test(src),
)

console.log("\nthe swap respects reduced motion")
check(
  "variants are applied behind a reduced-motion guard",
  /\{\.\.\.\(reduceMotion \? \{\} : ICON_SWAP_VARIANTS\)\}/.test(src),
)

console.log("\nno horizontal pose on the button")
check(
  "no icon-hover-* class that could translate the glyph",
  !/icon-hover-/.test(src),
)

console.log("\nloading state still wins over play/pause")
check(
  "loading is checked before isPlaying",
  /loading\s*\?\s*"loading"\s*:\s*isPlaying\s*\?\s*"pause"\s*:\s*"play"/.test(src),
)

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Play/pause geometry checks passed.")
