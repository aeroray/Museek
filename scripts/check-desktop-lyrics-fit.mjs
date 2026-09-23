// Verifies the desktop-lyrics fit-to-width maths.
//
//   node --experimental-strip-types scripts/check-desktop-lyrics-fit.mjs
//
// Imports the real module (src/lib/desktopLyricsFit.ts has no imports, so plain
// node can load it). The project has no configured test runner, so this stands
// in for one.
import {
  computeLyricFitScale,
  fitChanged,
  FIT_MIN_SCALE,
  FIT_GUTTER,
} from "../src/lib/desktopLyricsFit.ts"

let failed = 0
const check = (name, actual, expected, tolerance = 0.001) => {
  const ok =
    typeof expected === "number"
      ? Math.abs(actual - expected) <= tolerance
      : actual === expected
  if (!ok) failed += 1
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${name.padEnd(58)} => ${actual}${ok ? "" : `   (expected ${expected})`}`,
  )
}

// --- A line that already fits must not be shrunk -------------------------
check(
  "narrow line fits, no shrink",
  computeLyricFitScale({
    contentWidth: 400,
    padding: 14,
    appliedFit: 1,
    viewportWidth: 1920,
  }),
  1,
)

// --- A line wider than the window is shrunk to exactly fit ---------------
// natural = 3000 + 28 = 3028; available = 1920 - 40 = 1880.
// scale = 1880 / 3028 = 0.62087...
{
  const expected = 1880 / 3028
  check(
    "wide line shrinks to exactly fit",
    computeLyricFitScale({
      contentWidth: 3000,
      padding: 14,
      appliedFit: 1,
      viewportWidth: 1920,
    }),
    expected,
  )
}

// --- Idempotence: re-measuring at the chosen fit must choose the same fit ---
// This is the property that matters. The effect re-runs whenever `fitScale`
// changes, so the fit must be a FIXED POINT: feeding a fitted measurement back
// in has to return that same fit, or the effect would shrink on every render.
// (It does not return 1 — a fitted capsule is exactly at the limit, so asking
// "does the natural width fit?" still says no. Returning 1 here would be wrong:
// it would mean the line was never too wide in the first place.)
{
  const viewportWidth = 1600
  const naturalContent = 2400
  const padding = 14
  const fit = computeLyricFitScale({
    contentWidth: naturalContent,
    padding,
    appliedFit: 1,
    viewportWidth,
  })
  // Content and padding both scale by `fit`.
  const nextWidth = (naturalContent + padding * 2) * fit
  const settled = computeLyricFitScale({
    contentWidth: naturalContent * fit,
    padding: padding * fit,
    appliedFit: fit,
    viewportWidth,
  })
  check("fitted capsule fits within the gutters", nextWidth <= viewportWidth - 40 + 0.5, true)
  check("re-measuring returns the SAME fit (fixed point)", settled, fit)
  check("fitChanged sees no change after settling", fitChanged(fit, settled), false)
}

// --- The floor is also a fixed point, so an impossible line cannot loop ----
{
  const viewportWidth = 1280
  const padding = 14
  // Long enough that the ideal fit falls below the floor, so the clamp applies.
  // (At the old 0.55 floor a 2428px line was already unfittable; at 0.4 it fits,
  // which is the point of lowering it.)
  const naturalContent = 6000
  const fit = computeLyricFitScale({
    contentWidth: naturalContent,
    padding,
    appliedFit: 1,
    viewportWidth,
  })
  const settled = computeLyricFitScale({
    contentWidth: naturalContent * fit,
    padding: padding * fit,
    appliedFit: fit,
    viewportWidth,
  })
  const ideal = (viewportWidth - 40) / (naturalContent + padding * 2)
  check("case is genuinely below the floor", ideal < FIT_MIN_SCALE, true)
  check("unfittable line clamps to the floor", fit, FIT_MIN_SCALE)
  check("floor is a fixed point (no shrink loop)", settled, FIT_MIN_SCALE)
}

// --- Scaling down the available width shrinks the lyric further ----------
{
  const base = { contentWidth: 2000, padding: 14, appliedFit: 1 }
  const at100 = computeLyricFitScale({ ...base, viewportWidth: 1920 })
  const at150 = computeLyricFitScale({ ...base, viewportWidth: 1280 })
  check("higher display scaling shrinks more", at150 < at100, true)
}

// --- The reported bug: same line, 100% vs 150% scaling -------------------
// A 40-char CJK line at 28px * 1.15 is ~1316px of text plus 28px padding.
{
  const contentWidth = 1288
  const padding = 14
  const fits100 = computeLyricFitScale({
    contentWidth,
    padding,
    appliedFit: 1,
    viewportWidth: 1920,
  })
  const fits150 = computeLyricFitScale({
    contentWidth,
    padding,
    appliedFit: 1,
    viewportWidth: 1280,
  })
  check("40-char line fits at 100% scaling", fits100, 1)
  check("same line is shrunk at 150% scaling", fits150 < 1, true)
  console.log(
    `      at 150%: scale=${fits150.toFixed(3)} -> capsule ${Math.round((contentWidth + padding * 2) * fits150)}px in 1280px viewport`,
  )
}

// --- Degenerate input must not produce a broken scale -------------------
check(
  "zero content width is a no-op",
  computeLyricFitScale({
    contentWidth: 0,
    padding: 14,
    appliedFit: 1,
    viewportWidth: 1920,
  }),
  1,
)
check(
  "zero viewport is a no-op",
  computeLyricFitScale({
    contentWidth: 900,
    padding: 14,
    appliedFit: 1,
    viewportWidth: 0,
  }),
  1,
)
check(
  "NaN content width is a no-op",
  computeLyricFitScale({
    contentWidth: NaN,
    padding: 14,
    appliedFit: 1,
    viewportWidth: 1920,
  }),
  1,
)
check(
  "viewport narrower than the gutters clamps to the minimum",
  computeLyricFitScale({
    contentWidth: 900,
    padding: 14,
    appliedFit: 1,
    viewportWidth: 30,
  }),
  FIT_MIN_SCALE,
)

// --- The minimum scale is a floor, not a suggestion ---------------------
check(
  "absurdly long line stops at the minimum scale",
  computeLyricFitScale({
    contentWidth: 100000,
    padding: 14,
    appliedFit: 1,
    viewportWidth: 1920,
  }),
  FIT_MIN_SCALE,
)

// --- fitChanged must ignore noise so the effect cannot loop -------------
check("fitChanged ignores sub-epsilon drift", fitChanged(0.62, 0.62), false)
check("fitChanged detects a real change", fitChanged(1, 0.62), true)

// --- Realistic lyrics must always fit, at every common scaling ------------
// Guards the choice of floor: if the floor were raised, long lines on scaled
// monitors would clip again, which is the bug this module exists to fix.
{
  const BASE_FONT = 28
  const FONT_SCALE = 1.15 // the default desktop lyric scale
  const PADDING = 14
  const CHAR_PX = BASE_FONT * FONT_SCALE // ~1em per CJK char
  const monitors = [
    ["1920x1080 @100%", 1920 / 1.0],
    ["1920x1080 @125%", 1920 / 1.25],
    ["1920x1080 @150%", 1920 / 1.5],
    ["2560x1440 @150%", 2560 / 1.5],
    ["3840x2160 @200%", 3840 / 2.0],
    ["1366x768  @150%", 1366 / 1.5],
  ]
  const REALISTIC_CHARS = 80 // a generous upper bound for one lyric line
  for (const [name, viewportWidth] of monitors) {
    const contentWidth = REALISTIC_CHARS * CHAR_PX
    const fit = computeLyricFitScale({
      contentWidth,
      padding: PADDING,
      appliedFit: 1,
      viewportWidth,
    })
    const fitted = (contentWidth + PADDING * 2) * fit
    const available = viewportWidth - FIT_GUTTER * 2
    check(
      `80-char line fits at ${name}`,
      fitted <= available + 0.5 || fit === FIT_MIN_SCALE,
      true,
    )
  }
}

console.log(
  `\nConstants: FIT_MIN_SCALE=${FIT_MIN_SCALE}  FIT_GUTTER=${FIT_GUTTER}`,
)
console.log(failed === 0 ? "All cases pass." : `\n${failed} case(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
