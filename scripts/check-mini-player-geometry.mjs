// Pins the mini player's window geometry and its enter/exit permission rule.
//
// Two bugs, both pure arithmetic/boolean logic and both user-visible:
//
//   * The queue panel was sized with a 38px row while the row it renders is
//     39.5px (py-1.5 + text-xs/leading-tight + text-[10px]/leading-tight), so the
//     panel overflowed for EVERY queue length: a one-song queue grew a
//     scrollbar, and the fourth row's singer line was clipped.
//   * Five on-screen clamp sites, three of which used the inversion-safe
//     `Math.max(min, max)` form. The other two did not, so on a work area
//     narrower/shorter than the bar they placed the window above/left of it.
//
//   node scripts/check-mini-player-geometry.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const geo = await load("src/lib/miniPlayerGeometry.ts")
const session = await load("src/lib/miniPlayerSession.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

// ---------------------------------------------------------------------------
// The row height the panel budget must match.
//
// Derived from the row's Tailwind classes, exactly as the browser resolves them:
// `leading-tight` (line-height: 1.25) is declared after `text-xs`, so it wins for
// the 12px title, and it also applies to the 10px sub-line. `py-1.5` is 12px.
const PADDING_Y = 6 * 2
const TITLE = 12 * 1.25
const SINGER = 10 * 1.25
const EXPECTED_ROW = PADDING_Y + TITLE + SINGER // 39.5

console.log("\nthe row constant matches the row the component renders")
check(
  `MINI_QUEUE_ROW is the rendered row height (${EXPECTED_ROW}px)`,
  geo.MINI_QUEUE_ROW === EXPECTED_ROW,
  `got ${geo.MINI_QUEUE_ROW}`,
)
check(
  "the old 38px budget is not enough (this is the bug being pinned)",
  Math.floor(EXPECTED_ROW) > 38,
)

console.log("\nthe panel is tall enough for every row count, with no slack")
{
  const ROW = geo.MINI_QUEUE_ROW
  const GAP = 2
  const PAD = 12
  for (let n = 1; n <= geo.MINI_QUEUE_MAX_ROWS; n++) {
    const allocated = geo.miniQueuePanelHeight(n)
    // What the browser lays out for n rows.
    const needed = PAD + n * ROW + (n - 1) * GAP
    check(
      `${n} row(s): allocated ${allocated}px >= needed ${needed}px`,
      allocated >= needed,
      `short by ${needed - allocated}px`,
    )
    // And not wildly over, or the panel would grow a gap of its own.
    check(
      `${n} row(s): allocated ${allocated}px <= needed + 1px`,
      allocated <= needed + 1,
      `over by ${allocated - needed}px`,
    )
  }
}

console.log("\nthe panel caps at four rows and never shrinks below the empty state")
{
  check(
    "empty queue returns the placeholder height",
    geo.miniQueuePanelHeight(0) === 40,
    `got ${geo.miniQueuePanelHeight(0)}`,
  )
  check(
    "a negative count is treated as empty",
    geo.miniQueuePanelHeight(-3) === 40,
    `got ${geo.miniQueuePanelHeight(-3)}`,
  )
  check(
    "5 songs do not grow past 4 rows",
    geo.miniQueuePanelHeight(5) === geo.miniQueuePanelHeight(4),
    `${geo.miniQueuePanelHeight(5)} vs ${geo.miniQueuePanelHeight(4)}`,
  )
  check(
    "100 songs do not grow past 4 rows",
    geo.miniQueuePanelHeight(100) === geo.miniQueuePanelHeight(4),
  )
  check(
    "the static 4-row bound agrees with the function",
    geo.MINI_QUEUE_HEIGHT === geo.miniQueuePanelHeight(4),
  )
}

console.log("\nclampOriginToWorkArea keeps the window on-screen")
{
  const wa = { x: 0, y: 0, width: 1920, height: 1080 }
  const inside = geo.clampOriginToWorkArea(100, 100, 400, 72, wa, 14)
  check("an in-bounds origin is untouched", inside.x === 100 && inside.y === 100)

  const topLeft = geo.clampOriginToWorkArea(-500, -500, 400, 72, wa, 14)
  check(
    "a far off-screen origin is pulled to the inset corner",
    topLeft.x === 14 && topLeft.y === 14,
    JSON.stringify(topLeft),
  )

  const bottomRight = geo.clampOriginToWorkArea(9999, 9999, 400, 72, wa, 14)
  check(
    "a far past-the-edge origin is pulled inside",
    bottomRight.x === 1920 - 400 - 14 && bottomRight.y === 1080 - 72 - 14,
    JSON.stringify(bottomRight),
  )

  // The inversion case: a work area smaller than the window plus its insets.
  // The naive form silently picks the LOWER bound and puts the window off-screen.
  const tiny = { x: 0, y: 0, width: 300, height: 60 }
  const inverted = geo.clampOriginToWorkArea(0, 0, 400, 200, tiny, 14)
  check(
    "a work area narrower than the window keeps the origin non-negative",
    inverted.x >= 0 && inverted.y >= 0,
    JSON.stringify(inverted),
  )
  check(
    "the naive Math.min/Math.max form really does go negative here",
    Math.min(Math.max(0, 14), 300 - 400 - 14) < 0,
  )

  // A second monitor: everything is offset by its origin.
  const right = { x: 1920, y: 0, width: 2560, height: 1440 }
  const onRight = geo.clampOriginToWorkArea(9999, 9999, 400, 72, right, 14)
  check(
    "clamping is relative to the monitor's own origin",
    onRight.x === 1920 + 2560 - 400 - 14 && onRight.y === 1440 - 72 - 14,
    JSON.stringify(onRight),
  )
}

// ---------------------------------------------------------------------------
// Enter/exit permission.
//
// The shortcut used to require `currentSong` for BOTH directions, so a finished
// or cleared queue made the mini bar impossible to leave from the keyboard.
console.log("\nthe mini toggle can always exit, even with no song")
{
  const combos = [
    { hasSong: true, miniMode: false, sessionActive: false },
    { hasSong: true, miniMode: true, sessionActive: true },
    { hasSong: false, miniMode: true, sessionActive: true },
    { hasSong: false, miniMode: true, sessionActive: false },
    { hasSong: false, miniMode: false, sessionActive: true },
    { hasSong: false, miniMode: false, sessionActive: false },
  ]
  for (const c of combos) {
    const label = `song=${c.hasSong} mini=${c.miniMode} session=${c.sessionActive}`
    const direction = session.miniToggleDirection(c)
    if (c.miniMode || c.sessionActive) {
      check(`${label} => exit`, direction === "exit", `got ${direction}`)
      check(`${label} is allowed`, session.canToggleMini(c) === true)
    } else if (c.hasSong) {
      check(`${label} => enter`, direction === "enter", `got ${direction}`)
      check(`${label} is allowed`, session.canToggleMini(c) === true)
    } else {
      check(`${label} => nothing`, direction === null, `got ${direction}`)
      check(`${label} is refused`, session.canToggleMini(c) === false)
    }
  }

  // The exact regression: no song, still inside the mini player.
  check(
    "the old `!currentSong` guard would have blocked the exit",
    (() => {
      const hasSong = false
      const miniMode = true
      // Old rule, kept verbatim to prove it refuses.
      const oldAllowed = !hasSong ? false : true
      return oldAllowed === false && session.canToggleMini({ hasSong, miniMode, sessionActive: true })
    })(),
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Mini-player geometry checks passed.")
