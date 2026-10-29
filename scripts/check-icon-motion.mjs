// One icon-motion mechanism, and no horizontal glyph movement.
//
// Two rules, both of which were broken before:
//
// 1. HORIZONTAL. Every icon pose used to translate the glyph sideways in some
//    cases, and several controls chose their pose FROM THEIR OWN STATE (the
//    play-mode button swapped list<->shuffle, the theme switcher sun<->moon).
//    The pointer is over the button when it is clicked, so the pose was live as
//    the class changed and the glyph slid 1px sideways mid-click.
//
// 2. UNIFORMITY. There were five mechanisms: a 21-entry per-action pose table, a
//    container `scale` on icon buttons, a bare `active:scale` on text buttons, a
//    motion/react `whileHover` on the play button, and nothing at all on ~80
//    buttons. They disagreed about how much a control should grow (1.04x to
//    1.12x depending on which classes a button happened to carry).
//
// There is now one class, `.icon-motion`: the glyph lifts on hover, the box
// shrinks on press. This check fails if a second mechanism comes back.
//
//   node scripts/check-icon-motion.mjs
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const css = readFileSync(join(root, "src/index.css"), "utf8")

let failures = 0
const check = (name, cond, detail = "") => {
  if (!cond) failures++
  console.log(`${cond ? "OK  " : "FAIL"}  ${name.padEnd(56)}${detail ? "  " + detail : ""}`)
}

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

/** Strip // and /* *\/ comments so prose about old classes is not scanned. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

// ---------------------------------------------------------------------------
console.log("the single mechanism exists and is the only one")
{
  check("index.css defines .icon-motion", /\.icon-motion\s*\{/.test(css))

  // Brace balance. Editing this file by script is how a stray `}` shipped and
  // broke the whole bundle; `pnpm build` catches it but only after a full run.
  {
    const stripped = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    let depth = 0
    let firstNegative = -1
    for (let i = 0; i < stripped.length; i++) {
      if (stripped[i] === "{") depth++
      else if (stripped[i] === "}") {
        depth--
        if (depth < 0 && firstNegative < 0) firstNegative = i
      }
    }
    check(
      "index.css braces balance",
      depth === 0 && firstNegative < 0,
      depth === 0 ? "" : `unbalanced by ${depth}`,
    )
  }
  check(
    "no .icon-hover-* pose rules remain",
    !/\.icon-hover-[a-z-]+\s*(?::hover|:active|\{)/.test(css),
    (css.match(/\.icon-hover-[a-z-]+/g) ?? []).join(", ").slice(0, 80),
  )
  check(
    "the old .icon-button-motion class is gone",
    !/\.icon-button-motion\s*(?::|\{)/.test(stripComments(css)),
  )

  // The hover pose and the press pose must live on different elements, or the
  // two scales compound (1.04 * 1.06 = 1.10) and controls stop matching.
  check(
    "hover pose is applied to the glyph, not the box",
    /\.icon-motion:hover[^{]*\bsvg\s*\{/.test(css),
  )
  check(
    "press shrink is applied to the box, not the glyph",
    /\.icon-motion:active[^{]*\{\s*scale:\s*0\.96/.test(css),
  )
  // Scan EVERY hover rule: a second one that scales the box would compound with
  // the glyph's 1.04 and make this control larger than its neighbours.
  const hoverRules = [...css.matchAll(/(\.icon-motion:hover[^{]*)\{([^}]*)\}/g)]
  const boxScale = hoverRules
    .filter((m) => !/\bsvg\s*$/.test(m[1].trim()))
    .map((m) => /scale:\s*([\d.]+)/.exec(m[2])?.[1])
    .filter(Boolean)
  check(
    "no hover rule scales the box itself",
    boxScale.length === 0,
    boxScale.length ? `found scale ${boxScale.join(", ")}` : "",
  )

  // The exact travel. These were tuned down from 1.5px/6%, which read as the
  // control moving rather than responding; pin the agreed values so a later
  // "make it more noticeable" edit has to be deliberate.
  const glyphBody = hoverRules.find((m) => /\bsvg\s*$/.test(m[1].trim()))?.[2] ?? ""
  check(
    "the lift is exactly 1px",
    /translateY\(-1px\)/.test(glyphBody),
    /translateY\([^)]+\)/.exec(glyphBody)?.[0] ?? "none",
  )
  check(
    "the growth is exactly 4%",
    /scale\(1\.04\)/.test(glyphBody),
    /scale\([^)]+\)/.exec(glyphBody)?.[0] ?? "none",
  )
}

// ---------------------------------------------------------------------------
console.log("\nno pose moves a glyph horizontally")
{
  // Any `translate(...)` with a non-zero first argument, or `translateX(`.
  const bad = []
  for (const m of css.matchAll(/\.icon-motion[^{]*\{([^}]*)\}/g)) {
    const body = m[1]
    const t = /transform:\s*([^;]+);/.exec(body)?.[1] ?? ""
    const xy = /translate\(\s*(-?[\d.]+)px/.exec(t)
    const x = /translateX\(\s*(-?[\d.]+)px/.exec(t)
    const dx = xy ? Number(xy[1]) : x ? Number(x[1]) : 0
    if (Math.abs(dx) > 0.01) bad.push(t)
  }
  check("no horizontal translate in .icon-motion", bad.length === 0, bad.join(" | "))
}

// ---------------------------------------------------------------------------
console.log("\nnothing compounds with the shared press scale")
{
  // `.icon-motion` writes the CSS `scale` property; Tailwind's `scale-*`
  // utilities write `transform: scaleX() scaleY()`. Because they are different
  // properties they MULTIPLY. The sidebar had `active:scale-[0.98]` alongside
  // `icon-motion`, so it rendered 0.96 * 0.98 = 0.94 and shrank visibly harder
  // than every icon button. Any co-located scale utility is a bug.
  const offenders = []
  for (const file of sources) {
    if (!file.endsWith(".tsx")) continue
    const rel = relative(root, file).replace(/\\/g, "/")
    const lines = stripComments(readFileSync(file, "utf8")).split("\n")
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes("icon-motion")) continue
      // className strings can span lines; inspect a small window around the hit.
      const window = lines.slice(Math.max(0, i - 2), i + 6).join(" ")
      const m = /(?:^|[\s"'])((?:active|group-active):scale-[\d.[\]-]+)/.exec(window)
      if (m) offenders.push(`${rel}:${i + 1} ${m[1]}`)
    }
  }
  check(
    "no element applies icon-motion and its own scale",
    offenders.length === 0,
    offenders.slice(0, 4).join("; "),
  )
}

// ---------------------------------------------------------------------------
console.log("\nthe play/pause button switches its glyph without moving")
{
  const src = readFileSync(
    join(root, "src/components/player/PlayPauseButton.tsx"),
    "utf8",
  )
  check(
    "it opts out of the shared motion",
    /\bstatic\b/.test(src),
  )
  check(
    "it does not re-add icon-motion",
    !/icon-motion/.test(stripComments(src)),
    "the button changes its own glyph; a lift on top reads as wobbling",
  )
  check(
    "the glyph still cross-fades",
    /AnimatePresence/.test(src) && /ICON_SWAP_VARIANTS/.test(src),
  )
}

// ---------------------------------------------------------------------------
console.log("\nno second mechanism in the sources")
{
  const offenders = []
  for (const file of sources) {
    const rel = relative(root, file).replace(/\\/g, "/")
    const text = stripComments(readFileSync(file, "utf8"))
    if (/icon-hover-[a-z-]+/.test(text)) offenders.push(`${rel}: icon-hover-*`)
    if (/icon-button-motion/.test(text)) offenders.push(`${rel}: icon-button-motion`)
  }
  check(
    "no source references the retired pose classes",
    offenders.length === 0,
    offenders.slice(0, 3).join("; "),
  )
}

// A control must not pick its pose class from its own state. After unification
// there is only one class, so the only way this regresses is a new conditional
// producing class names that differ per state.
{
  const offenders = []
  for (const file of sources) {
    const rel = relative(root, file).replace(/\\/g, "/")
    const text = stripComments(readFileSync(file, "utf8"))
    // A ternary whose branches are two different animated class names.
    for (const m of text.matchAll(/\?\s*"([a-z][\w-]*(?:motion|hover|anim)[\w-]*)"\s*:\s*"([a-z][\w-]*(?:motion|hover|anim)[\w-]*)"/g)) {
      if (m[1] !== m[2]) offenders.push(`${rel}: "${m[1]}" / "${m[2]}"`)
    }
  }
  check(
    "no control selects its animated class from state",
    offenders.length === 0,
    offenders.slice(0, 3).join("; "),
  )
}

// ---------------------------------------------------------------------------
console.log("\nno motion/react hover on buttons (CSS owns this now)")
{
  const offenders = []
  for (const file of sources) {
    const rel = relative(root, file).replace(/\\/g, "/")
    const text = stripComments(readFileSync(file, "utf8"))
    if (/whileHover=/.test(text)) offenders.push(rel)
  }
  check(
    "no component uses whileHover",
    offenders.length === 0,
    offenders.join(", "),
  )
}

// ---------------------------------------------------------------------------
console.log("\nraw icon buttons are covered (or exempt with a reason)")
{
  const EXEMPT = new Map([
    ["src/components/layout/WindowControls.tsx", "OS chrome must not move"],
    ["src/components/settings/SourceManager.tsx", "drag handle, not a click target"],
  ])
  const missing = []
  for (const file of sources) {
    if (!file.endsWith(".tsx")) continue
    const rel = relative(root, file).replace(/\\/g, "/")
    const text = readFileSync(file, "utf8")
    const re = /<button\b([\s\S]*?)>/g
    let m
    while ((m = re.exec(text))) {
      const attrs = m[1]
      const close = text.indexOf("</button>", m.index)
      const body = text.slice(m.index, close < 0 ? m.index + 900 : close)
      const hasIcon = /<svg\b/.test(body) || /<[A-Z][A-Za-z0-9]*\b/.test(body)
      if (!hasIcon) continue
      if (/icon-motion/.test(attrs) || /icon-motion/.test(body)) continue
      if (EXEMPT.has(rel)) continue
      missing.push(`${rel}:${text.slice(0, m.index).split("\n").length}`)
    }
  }
  check(
    "every raw icon button carries icon-motion",
    missing.length === 0,
    missing.slice(0, 5).join(", "),
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Icon motion checks passed.")
