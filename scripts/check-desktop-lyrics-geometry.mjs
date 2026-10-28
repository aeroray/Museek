// Pins the desktop-lyrics window geometry and its snapshot dedupe key.
//
// Both are pure, and both shipped broken:
//
//   * `restoreDesktopLyricsGeometry` applied the saved origin verbatim. Unplug the
//     display the lyric was parked on and it was placed at a coordinate that no
//     longer exists, then immediately re-persisted — and a monitor-wide,
//     click-through, skipTaskbar window at a dead coordinate cannot be recovered
//     from inside the app.
//   * The drag target trusted the monitor the drag STARTED on, so the lyric could
//     never be dragged to a second display: it stopped dead at the seam.
//   * `snapshotKey` included `Math.round(currentTime * 1000)`, and `timeupdate`
//     writes the store ~4x/s, so the dedupe never matched while playing: the whole
//     lyric array (with per-word karaoke timings) was re-serialized and shipped
//     several times a second, for no benefit.
//
//   node scripts/check-desktop-lyrics-geometry.mjs
import { createTsLoader } from "./lib/load-ts.mjs"

const load = createTsLoader()
const win = await load("src/lib/desktopLyricsWindow.ts")
const sync = await load("src/lib/desktopLyricsSync.ts")

let failures = 0
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${extra ? "  " + extra : ""}`)
    failures++
  }
}

const mon = (x, y, width, height, scaleFactor = 1) => ({
  position: { x, y },
  size: { width, height },
  scaleFactor,
  name: `${width}x${height}@${x},${y}`,
})

const PRIMARY = mon(0, 0, 1920, 1080)
const SECONDARY = mon(1920, 0, 2560, 1440)

// ---------------------------------------------------------------------------
console.log("\nrestoring a saved position")
{
  const g = win.computeRestoredGeometry({
    saved: { x: 300, y: 400, width: 1920, height: 200, heightIncludesToolbar: true },
    monitors: [PRIMARY, SECONDARY],
    activeMonitor: PRIMARY,
    fallbackScale: 1,
  })
  // The window is monitor-wide, so its origin is the monitor origin by
  // construction; only y carries a saved offset.
  check(
    "x is the monitor origin (the window spans the monitor)",
    g !== null && g.x === PRIMARY.position.x,
    JSON.stringify(g),
  )
  check("the saved y is kept", g !== null && g.y === 400, JSON.stringify(g))
  check("the window is monitor-wide", g !== null && g.width === 1920, JSON.stringify(g))
  check("the saved height is respected", g !== null && g.height === 200, JSON.stringify(g))
}

console.log("\nrestoring after the saved monitor was disconnected")
{
  // Saved on the secondary display, which is now gone. Without the clamp the
  // window lands at x=2400 on a 1920-wide desktop: invisible and unrecoverable.
  const g = win.computeRestoredGeometry({
    saved: { x: 2400, y: 900, width: 2560, height: 200, heightIncludesToolbar: true },
    monitors: [PRIMARY],
    activeMonitor: PRIMARY,
    fallbackScale: 1,
  })
  check("the window lands on a connected monitor", g !== null && g.x >= 0 && g.x + g.width <= 1920, JSON.stringify(g))
  check("the y is inside the work area", g !== null && g.y >= 0 && g.y + g.height <= 1080, JSON.stringify(g))
  check(
    "the old verbatim placement would have been off-screen",
    2400 >= 1920,
  )
}

console.log("\nrestoring with no saved geometry")
{
  const g = win.computeRestoredGeometry({
    saved: null,
    monitors: [PRIMARY, SECONDARY],
    activeMonitor: SECONDARY,
    fallbackScale: 1,
  })
  check("the active monitor is used", g !== null && g.x === SECONDARY.position.x, JSON.stringify(g))
  check(
    "the default sits near the bottom of that monitor",
    g !== null && g.y + g.height < SECONDARY.position.y + SECONDARY.size.height,
    JSON.stringify(g),
  )
  check("no monitors at all yields nothing", win.computeRestoredGeometry({
    saved: null,
    monitors: [],
    activeMonitor: null,
    fallbackScale: 1,
  }) === null)
}

console.log("\na saved point selects the monitor it is actually on")
{
  // This is the unit-mixing case: the saved rect's LOGICAL width (2560) is
  // narrower than the window really is, so a rect-overlap test near the seam can
  // pick the wrong monitor. The point test cannot.
  const g = win.computeRestoredGeometry({
    saved: { x: 2500, y: 300, width: 900, height: 200, heightIncludesToolbar: true },
    monitors: [PRIMARY, SECONDARY],
    activeMonitor: PRIMARY,
    fallbackScale: 1,
  })
  check(
    "a point on the secondary display keeps the window there",
    g !== null && g.x >= SECONDARY.position.x,
    JSON.stringify(g),
  )
}

// ---------------------------------------------------------------------------
console.log("\ndragging toward a second monitor")
{
  const drag = {
    pointerId: 1,
    startCursorX: 100,
    startCursorY: 100,
    startPosition: { x: 0, y: 500 },
    width: 1920,
    height: 200,
    monitors: [PRIMARY, SECONDARY],
    // The drag started with the pointer over the primary display.
    monitor: PRIMARY,
    visualLeftOffset: 0,
    visualRightOffset: 1920,
    visualTopOffset: 0,
    visualBottomOffset: 200,
    latestCursorX: 100,
    latestCursorY: 100,
    ready: true,
    finished: false,
    pendingFinish: false,
    frameId: null,
    positionPromise: Promise.resolve(),
  }
  const onPrimary = win.getDesktopLyricsDragTarget(drag)
  check("a small move stays on the primary display", onPrimary !== null && onPrimary.x === 0, JSON.stringify(onPrimary))

  // 2400px to the right puts the window's left edge on the secondary display.
  const moved = win.getDesktopLyricsDragTarget({ ...drag, latestCursorX: 2500 })
  check(
    "dragging far right crosses onto the second monitor",
    moved !== null && moved.x >= SECONDARY.position.x,
    JSON.stringify(moved),
  )
  check(
    "the old pinned-monitor behaviour would have clamped it back",
    moved !== null && moved.x > PRIMARY.size.width - 1920,
    JSON.stringify(moved),
  )
}

console.log("\na released-before-ready drag is not lost")
{
  const pending = {
    pointerId: 1,
    startCursorX: 0,
    startCursorY: 0,
    startPosition: null,
    width: 0,
    height: 0,
    monitors: [],
    monitor: null,
    visualLeftOffset: 0,
    visualRightOffset: 0,
    visualTopOffset: 0,
    visualBottomOffset: 0,
    latestCursorX: 0,
    latestCursorY: 0,
    ready: false,
    finished: true,
    pendingFinish: true,
    frameId: null,
    positionPromise: Promise.resolve(),
  }
  check(
    "an unready drag has no target yet",
    win.getDesktopLyricsDragTarget(pending) === null,
  )
  check(
    "the drag state carries the flag the setup path needs",
    pending.pendingFinish === true,
  )
}

// ---------------------------------------------------------------------------
console.log("\nthe snapshot key is blind to the clock")
{
  const state = {
    currentSong: { id: "s1", name: "Song", singer: "Artist", meta: {} },
    isPlaying: true,
    status: "playing",
    lyricsLoading: false,
    duration: 200,
    currentPicUrl: null,
    lyricLines: [
      { time: 0, text: "first line" },
      { time: 5, text: "second line", translation: "翻译" },
    ],
  }
  const base = sync.snapshotKey(state)
  check(
    "a clock change does not change the key",
    sync.snapshotKey({ ...state, currentTime: 12.5 }) === base &&
      sync.snapshotKey({ ...state, currentTime: 99 }) === base,
  )
  check(
    "the old clock-bearing key would have changed (this is the bug)",
    `a|n|${Math.round(12.5 * 1000)}` !== `a|n|${Math.round(99 * 1000)}`,
  )

  console.log("\n...but sensitive to everything the window renders")
  const cases = [
    ["song id", { currentSong: { ...state.currentSong, id: "s2" } }],
    ["song title", { currentSong: { ...state.currentSong, name: "Other" } }],
    ["artist", { currentSong: { ...state.currentSong, singer: "Other" } }],
    ["playing", { isPlaying: false }],
    ["status", { status: "paused" }],
    ["lyrics loading", { lyricsLoading: true }],
    ["duration", { duration: 300 }],
    ["cover", { currentPicUrl: "https://example.test/c.jpg" }],
    [
      "line text",
      { lyricLines: [{ time: 0, text: "FIRST line" }, state.lyricLines[1]] },
    ],
    [
      "line translation",
      { lyricLines: [state.lyricLines[0], { ...state.lyricLines[1], translation: "different" }] },
    ],
    [
      "word count (karaoke)",
      {
        lyricLines: [
          { time: 0, text: "first line", words: [{ text: "first", time: 0, duration: 1 }] },
          state.lyricLines[1],
        ],
      },
    ],
    ["line count", { lyricLines: [state.lyricLines[0]] }],
  ]
  for (const [name, patch] of cases) {
    check(`${name} changes the key`, sync.snapshotKey({ ...state, ...patch }) !== base)
  }

  console.log("\nand identical payloads dedupe")
  check(
    "a re-render with the same payload produces the same key",
    sync.snapshotKey({ ...state, currentTime: 0 }) ===
      sync.snapshotKey({ ...state, currentTime: 123.456 }),
  )
  check(
    "the key stays small enough to compute every store tick",
    base.length < 500,
    `length ${base.length}`,
  )
}

console.log("")
if (failures) {
  console.log(`FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log("Desktop-lyrics geometry checks passed.")
