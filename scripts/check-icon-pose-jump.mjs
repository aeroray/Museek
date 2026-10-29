// No icon pose may move its glyph horizontally.
//
// Reported: pressing the play button, the favourite button or the play-mode
// button made the glyph shift left. Measuring the geometry of those controls
// showed no movement at all — the boxes and the painted ink stay put. What does
// move is the hover *pose* applied to the glyph, and for several controls that
// pose is chosen by the control's own state:
//
//   play mode  sequence -> icon-hover-list     translateY(-1.5px) scale(1.06)
//              shuffle  -> icon-hover-shuffle  translate(1px, -1.5px) scale(1.06)
//   theme      light    -> icon-hover-sun
//              dark     -> icon-hover-moon
//
// The pointer is necessarily over the button when it is clicked, so the pose is
// live at the moment the class changes. The class swaps, the glyph slides 1px
// sideways over the 240ms spring, and the user reads it as "the icon jumps left".
//
// This check enforces the rule at the source: every `icon-hover-*` pose must
// have zero horizontal translate, and no control may pick its pose class from
// state. Both are needed — either one alone lets the jump back in.
//
//   node scripts/check-icon-pose-jump.mjs
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const css = readFileSync(join(root, "src/index.css"), "utf8")

let failures = 0
const check = (name, cond, detail = "") => {
  if (!cond) failures++
  console.log(`${cond ? "OK  " : "FAIL"}  ${name.padEnd(58)}${detail ? "  " + detail : ""}`)
}

/**
 * Horizontal translate of every `.icon-hover-<name>` pose, in px.
 *
 * `translate(x, y)` and `translateX(x)` both carry a horizontal component;
 * `translateY`, `scale` and `rotate` do not.
 */
function poseTranslateX(name) {
  const re = new RegExp(
    `\\.icon-hover-${name}:(?:hover|active)[^{]*\\{([^}]*)\\}`,
    "g",
  )
  const values = []
  let m
  while ((m = re.exec(css))) {
    // Strip comments: some rules carry a /* ... */ explanation before the
    // transform, and `[^;]+` would otherwise run into the comment text.
    const body = m[1].replace(/\/\*[\s\S]*?\*\//g, " ")
    const tm = /transform:\s*([^;]+);/.exec(body)
    if (!tm) continue
    const t = tm[1].trim()
    const tx = /translate\(\s*(-?[\d.]+)px/.exec(t)
    const tX = /translateX\(\s*(-?[\d.]+)px/.exec(t)
    values.push({ transform: t, tx: tx ? Number(tx[1]) : tX ? Number(tX[1]) : 0 })
  }
  return values
}

const poseNames = [
  ...new Set([...css.matchAll(/\.icon-hover-([a-z-]+):hover/g)].map((m) => m[1])),
].sort()

console.log(`every pose: horizontal translate must be 0 (${poseNames.length} poses)`)
for (const name of poseNames) {
  const rules = poseTranslateX(name)
  if (rules.length === 0) {
    check(`icon-hover-${name}: declares a pose`, false, "no transform rule found")
    continue
  }
  const worst = rules.reduce((a, b) => (Math.abs(b.tx) > Math.abs(a.tx) ? b : a), rules[0])
  check(
    `icon-hover-${name}`,
    Math.abs(worst.tx) < 0.01,
    Math.abs(worst.tx) < 0.01 ? worst.transform : `translateX ${worst.tx}px in "${worst.transform}"`,
  )
}

// ---------------------------------------------------------------------------
// No control may choose its pose from state.
console.log("\nno control picks its pose class from state")

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const sources = walk(join(root, "src"))
const offenders = []
for (const file of sources) {
  const raw = readFileSync(file, "utf8")
  // Strip comments before scanning. The rule is about *code* choosing a pose;
  // comments across the codebase discuss pose class names at length and would
  // otherwise be read as conditional expressions.
  const text = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^:])\/\/.*$/gm, "$1")

  const matches = [...text.matchAll(/icon-hover-[a-z-]+/g)]
  if (matches.length < 2) continue
  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      const a = matches[i]
      const b = matches[j]
      if (a[0] === b[0]) continue
      const gap = Math.abs(b.index - a.index)
      if (gap > 220) continue
      const start = Math.min(a.index, b.index)
      const end = Math.max(a.index, b.index) + b[0].length
      const between = text.slice(start, end)
      // A ternary, || or && that yields pose class names is state selection.
      // Two independent className strings are not.
      const selectsBetweenThem =
        /\?\s*["'`]?icon-hover-|:\s*["'`]?icon-hover-|\|\|\s*["'`]?icon-hover-|&&\s*["'`]?icon-hover-/.test(
          between,
        )
      if (!selectsBetweenThem) continue
      // Both names must sit in ONE expression. A table of independent rows
      // (`{ iconHover: "icon-hover-search" }, { iconHover: "icon-hover-trend" }`)
      // places them near each other with no conditional choosing between them.
      if (between.includes("iconHover:")) continue

      offenders.push({
        file: relative(root, file).replace(/\\/g, "/"),
        pair: `${a[0]} / ${b[0]}`,
        snippet: between.replace(/\s+/g, " ").slice(0, 90),
      })
      break
    }
  }
}

check(
  "no state-selected pose class anywhere in src/",
  offenders.length === 0,
  offenders.length === 0
    ? ""
    : offenders.map((o) => `${o.file}: ${o.pair}`).join("; "),
)
for (const o of offenders) console.log(`       ${o.file}: ${o.pair}`)

// ---------------------------------------------------------------------------
// The play/pause glyph pair must be two glyphs, not a morph.
console.log("\nplay/pause uses a glyph swap, not a path morph")
{
  const src = readFileSync(join(root, "src/components/player/PlayPauseButton.tsx"), "utf8")
  check(
    "no animated path `d` (a morph makes two shapes read as one object)",
    !/animate=\{\{\s*d:/.test(src),
    /animate=\{\{\s*d:/.test(src) ? "still morphing `d`" : "",
  )
  check("renders lucide Play and Pause", /\bPlay\b/.test(src) && /\bPause\b/.test(src))
  check(
    "both glyph layers share one fixed-size box",
    /style=\{\{ width: iconSize, height: iconSize \}\}/.test(src),
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Icon pose checks passed.")
