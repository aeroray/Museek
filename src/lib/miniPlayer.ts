import type { Window } from "@tauri-apps/api/window"
import type { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi"
import { isMacOs } from "@/lib/os"
import { exitLyricsFullscreen, isLyricsFullscreenSession } from "@/lib/lyricsFullscreen"
import { usePlayerStore } from "@/stores/playerStore"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Horizontal mini bar — compact width for cover + transport + actions. */
export const MINI_WIDTH = 400
export const MINI_HEIGHT = 72
/** Compact queue panel under the bar — keep short. */
export const MINI_QUEUE_HEIGHT = 168
/** Cover-only peek when docked to a screen edge. */
export const MINI_PEEK_SIZE = 64

/**
 * Uniform inset from work-area edges for corner place, magnetic snap,
 * peek dock, and on-screen clamp — top must match right (same for all sides).
 */
const EDGE_INSET = 14
/** Distance from work-area edge that arms the dock hint / magnetic snap. */
const EDGE_THRESHOLD_LOGICAL = 40
/** When already docking one edge, also pin the orthogonal axis if this close. */
const CORNER_PIN_LOGICAL = 48
/** Main ↔ mini window morph. */
const TRANSITION_MS = 280
/** Peek ↔ bar morph (shorter = snappier dock). */
const PEEK_MS = 200
const COLLAPSE_DELAY_MS = 360
const MOVE_SETTLE_MS = 200
/** Let the veiled layout paint before clearing blur. */
const REVEAL_HOLD_MS = 72

/** Matches tauri.conf.json main window mins — restored on exit. */
const MAIN_MIN_WIDTH = 1200
const MAIN_MIN_HEIGHT = 786

type SavedChrome = {
  size: PhysicalSize
  position: PhysicalPosition
  maximized: boolean
  alwaysOnTop: boolean
  resizable: boolean
}

type PhysRect = { x: number; y: number; w: number; h: number }
export type DockEdge = "left" | "right" | "top" | "bottom"

let saved: SavedChrome | null = null
let sessionActive = false
let transitioning = false
let queueExpanded = false
let dockEdge: DockEdge | null = null
let collapseTimer: ReturnType<typeof setTimeout> | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null
let movedUnlisten: (() => void) | null = null
let pointerInside = false
let moveRaf = 0
let clamping = false
let peekBusy = false

async function getWin(): Promise<Window | null> {
  if (!isTauri) return null
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  return getCurrentWindow()
}

function setMorphing(on: boolean) {
  usePlayerStore.setState({ miniMorphing: on })
  if (on) document.documentElement.dataset.miniMorphing = "true"
  else delete document.documentElement.dataset.miniMorphing
}

async function revealAfterMorph(): Promise<void> {
  // One paint under the veil, then ease filter/opacity back via CSS.
  await sleep(REVEAL_HOLD_MS)
  setMorphing(false)
}

function applyMiniCss(on: boolean) {
  if (on) {
    document.documentElement.dataset.mini = "true"
    document.documentElement.dataset.maximized = "false"
  } else {
    delete document.documentElement.dataset.mini
  }
}

/** Smooth deceleration — softer than cubic for large window morphs. */
function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function clearCollapseTimer() {
  if (collapseTimer != null) {
    clearTimeout(collapseTimer)
    collapseTimer = null
  }
}

function clearSettleTimer() {
  if (settleTimer != null) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}

function setDockHint(edge: DockEdge | null) {
  // Never paint dock chrome while the vinyl peek is up / morphing into it.
  if (edge && (peekBusy || usePlayerStore.getState().miniPeek)) edge = null
  if (usePlayerStore.getState().miniDockHint === edge) {
    // Keep DOM dataset in sync even when the store value didn't change.
    if (!edge) delete document.documentElement.dataset.miniDock
    return
  }
  usePlayerStore.setState({ miniDockHint: edge })
  if (edge) document.documentElement.dataset.miniDock = edge
  else delete document.documentElement.dataset.miniDock
}

async function readRect(win: Window): Promise<PhysRect> {
  const size = await win.outerSize()
  const pos = await win.outerPosition()
  return { x: pos.x, y: pos.y, w: size.width, h: size.height }
}

/**
 * Interpolate outer size + position in physical pixels.
 * Fires IPC updates without awaiting each frame (awaiting caused stutter);
 * snaps to the exact target on the last frame.
 */
async function animateWindowRect(win: Window, to: PhysRect, durationMs = TRANSITION_MS): Promise<void> {
  const { PhysicalSize, PhysicalPosition } = await import("@tauri-apps/api/dpi")
  const from = await readRect(win)
  if (
    Math.abs(from.x - to.x) < 2 &&
    Math.abs(from.y - to.y) < 2 &&
    Math.abs(from.w - to.w) < 2 &&
    Math.abs(from.h - to.h) < 2
  ) {
    await win.setSize(new PhysicalSize(to.w, to.h))
    await win.setPosition(new PhysicalPosition(to.x, to.y))
    return
  }

  await new Promise<void>((resolve) => {
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const e = easeOutQuint(t)
      const w = Math.max(1, Math.round(from.w + (to.w - from.w) * e))
      const h = Math.max(1, Math.round(from.h + (to.h - from.h) * e))
      const x = Math.round(from.x + (to.x - from.x) * e)
      const y = Math.round(from.y + (to.y - from.y) * e)
      // Don't await — overlapping awaits stacked frames and felt choppy.
      void win.setSize(new PhysicalSize(w, h))
      void win.setPosition(new PhysicalPosition(x, y))
      if (t < 1) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })

  await win.setSize(new PhysicalSize(to.w, to.h))
  await win.setPosition(new PhysicalPosition(to.x, to.y))
}

async function unlockSizeConstraints(win: Window): Promise<void> {
  const { LogicalSize } = await import("@tauri-apps/api/dpi")
  try {
    await win.setMaxSize(null)
  } catch {
    /* ignore */
  }
  try {
    await win.setMinSize(new LogicalSize(MINI_PEEK_SIZE, MINI_PEEK_SIZE))
  } catch {
    /* ignore */
  }
  try {
    await win.setResizable(true)
  } catch {
    /* ignore */
  }
}

async function lockLogicalSize(win: Window, width: number, height: number): Promise<void> {
  const { LogicalSize } = await import("@tauri-apps/api/dpi")
  await win.setMinSize(new LogicalSize(width, height))
  try {
    await win.setMaxSize(new LogicalSize(width, height))
  } catch {
    /* optional */
  }
  try {
    await win.setResizable(false)
  } catch {
    /* optional */
  }
  await win.setSize(new LogicalSize(width, height))
}

function barHeight(): number {
  return queueExpanded ? MINI_HEIGHT + MINI_QUEUE_HEIGHT : MINI_HEIGHT
}

/** Top-right mini target in physical pixels for the current monitor. */
async function miniTargetPhysical(win: Window): Promise<PhysRect> {
  const { currentMonitor } = await import("@tauri-apps/api/window")
  const scale = (await win.scaleFactor()) || 1
  const heightLogical = barHeight()
  const w = Math.round(MINI_WIDTH * scale)
  const h = Math.round(heightLogical * scale)
  try {
    const monitor = await currentMonitor()
    if (monitor) {
      const wa = monitor.workArea
      const pad = Math.round(EDGE_INSET * scale)
      const x = wa.position.x + wa.size.width - w - pad
      const y = wa.position.y + pad
      return { x: Math.max(wa.position.x, x), y, w, h }
    }
  } catch {
    /* fall through */
  }
  const cur = await readRect(win)
  return { x: Math.max(0, cur.x + cur.w - w), y: Math.max(0, cur.y), w, h }
}

/**
 * Keep the entire mini window inside the monitor work area so the bar
 * never slides off-screen during / after a drag.
 */
async function clampFullyVisible(win: Window): Promise<PhysRect> {
  const { PhysicalPosition } = await import("@tauri-apps/api/dpi")
  const { currentMonitor } = await import("@tauri-apps/api/window")
  const rect = await readRect(win)
  try {
    const monitor = await currentMonitor()
    if (!monitor) return rect
    const scale = monitor.scaleFactor || (await win.scaleFactor()) || 1
    const pad = Math.round(EDGE_INSET * scale)
    const wa = monitor.workArea
    const minX = wa.position.x + pad
    const minY = wa.position.y + pad
    const maxX = wa.position.x + wa.size.width - rect.w - pad
    const maxY = wa.position.y + wa.size.height - rect.h - pad
    const x = Math.round(Math.min(Math.max(rect.x, minX), Math.max(minX, maxX)))
    const y = Math.round(Math.min(Math.max(rect.y, minY), Math.max(minY, maxY)))
    if (Math.abs(x - rect.x) > 1 || Math.abs(y - rect.y) > 1) {
      clamping = true
      await win.setPosition(new PhysicalPosition(x, y))
      // Ignore the echo onMoved from our own clamp.
      queueMicrotask(() => {
        clamping = false
      })
      return { ...rect, x, y }
    }
  } catch {
    /* ignore */
  }
  return rect
}

/** Soft-snap flush to a work-area edge while keeping the full bar visible. */
async function magneticSnapToEdge(win: Window, edge: DockEdge): Promise<void> {
  const { PhysicalPosition } = await import("@tauri-apps/api/dpi")
  const { currentMonitor } = await import("@tauri-apps/api/window")
  try {
    const monitor = await currentMonitor()
    if (!monitor) return
    const scale = monitor.scaleFactor || (await win.scaleFactor()) || 1
    const pad = Math.round(EDGE_INSET * scale)
    const corner = CORNER_PIN_LOGICAL * scale
    const wa = monitor.workArea
    const rect = await readRect(win)
    let x = rect.x
    let y = rect.y
    if (edge === "right") x = wa.position.x + wa.size.width - rect.w - pad
    else if (edge === "left") x = wa.position.x + pad
    else if (edge === "top") y = wa.position.y + pad
    else y = wa.position.y + wa.size.height - rect.h - pad

    // Corner pin: if already near an adjacent edge, snap that axis too
    // so top-right (etc.) keeps equal inset on both sides.
    const distL = rect.x - wa.position.x
    const distR = wa.position.x + wa.size.width - (rect.x + rect.w)
    const distT = rect.y - wa.position.y
    const distB = wa.position.y + wa.size.height - (rect.y + rect.h)
    if (edge === "right" || edge === "left") {
      if (distT <= corner) y = wa.position.y + pad
      else if (distB <= corner) y = wa.position.y + wa.size.height - rect.h - pad
    } else {
      if (distL <= corner) x = wa.position.x + pad
      else if (distR <= corner) x = wa.position.x + wa.size.width - rect.w - pad
    }

    // Keep the orthogonal axis fully on-screen too.
    const minX = wa.position.x + pad
    const minY = wa.position.y + pad
    const maxX = wa.position.x + wa.size.width - rect.w - pad
    const maxY = wa.position.y + wa.size.height - rect.h - pad
    x = Math.round(Math.min(Math.max(x, minX), Math.max(minX, maxX)))
    y = Math.round(Math.min(Math.max(y, minY), Math.max(minY, maxY)))

    if (Math.abs(x - rect.x) > 1 || Math.abs(y - rect.y) > 1) {
      clamping = true
      await win.setPosition(new PhysicalPosition(x, y))
      queueMicrotask(() => {
        clamping = false
      })
    }
  } catch {
    /* ignore */
  }
}

async function detectDockEdge(win: Window): Promise<DockEdge | null> {
  const { currentMonitor } = await import("@tauri-apps/api/window")
  try {
    const monitor = await currentMonitor()
    if (!monitor) return null
    const scale = monitor.scaleFactor || (await win.scaleFactor()) || 1
    const thr = EDGE_THRESHOLD_LOGICAL * scale
    const rect = await readRect(win)
    const wa = monitor.workArea
    const distL = rect.x - wa.position.x
    const distR = wa.position.x + wa.size.width - (rect.x + rect.w)
    const distT = rect.y - wa.position.y
    const distB = wa.position.y + wa.size.height - (rect.y + rect.h)

    const hits: { edge: DockEdge; d: number }[] = []
    if (distR <= thr) hits.push({ edge: "right", d: distR })
    if (distL <= thr) hits.push({ edge: "left", d: distL })
    if (distT <= thr) hits.push({ edge: "top", d: distT })
    if (distB <= thr) hits.push({ edge: "bottom", d: distB })
    if (!hits.length) return null
    hits.sort((a, b) => a.d - b.d)
    const best = hits[0].d
    const near = hits.filter((h) => Math.abs(h.d - best) < 2)
    const horiz = near.find((h) => h.edge === "right" || h.edge === "left")
    return (horiz ?? near[0]).edge
  } catch {
    return null
  }
}

async function peekTarget(win: Window, edge: DockEdge): Promise<PhysRect> {
  const { currentMonitor } = await import("@tauri-apps/api/window")
  const scale = (await win.scaleFactor()) || 1
  const size = Math.round(MINI_PEEK_SIZE * scale)
  const pad = Math.round(EDGE_INSET * scale)
  const corner = CORNER_PIN_LOGICAL * scale
  const cur = await readRect(win)
  let x = cur.x
  let y = cur.y

  try {
    const monitor = await currentMonitor()
    if (monitor) {
      const wa = monitor.workArea
      const minX = wa.position.x + pad
      const minY = wa.position.y + pad
      const maxX = wa.position.x + wa.size.width - size - pad
      const maxY = wa.position.y + wa.size.height - size - pad
      const distL = cur.x - wa.position.x
      const distR = wa.position.x + wa.size.width - (cur.x + cur.w)
      const distT = cur.y - wa.position.y
      const distB = wa.position.y + wa.size.height - (cur.y + cur.h)

      if (edge === "right") {
        x = maxX
        if (distT <= corner) y = minY
        else if (distB <= corner) y = maxY
        else y = Math.min(Math.max(cur.y, minY), maxY)
      } else if (edge === "left") {
        x = minX
        if (distT <= corner) y = minY
        else if (distB <= corner) y = maxY
        else y = Math.min(Math.max(cur.y, minY), maxY)
      } else if (edge === "top") {
        y = minY
        if (distL <= corner) x = minX
        else if (distR <= corner) x = maxX
        else x = Math.min(Math.max(cur.x, minX), maxX)
      } else {
        y = maxY
        if (distL <= corner) x = minX
        else if (distR <= corner) x = maxX
        else x = Math.min(Math.max(cur.x, minX), maxX)
      }
      return { x, y, w: size, h: size }
    }
  } catch {
    /* fall through */
  }

  if (edge === "right") x = cur.x + cur.w - size
  else if (edge === "left") x = cur.x
  else if (edge === "top") y = cur.y
  else y = cur.y + cur.h - size
  return { x, y, w: size, h: size }
}

/** Expand from peek while keeping the docked edge anchored. */
async function expandedTargetFromPeek(win: Window, edge: DockEdge): Promise<PhysRect> {
  const scale = (await win.scaleFactor()) || 1
  const w = Math.round(MINI_WIDTH * scale)
  const h = Math.round(barHeight() * scale)
  const cur = await readRect(win)
  let x = cur.x
  let y = cur.y

  if (edge === "right") x = cur.x + cur.w - w
  else if (edge === "left") x = cur.x
  else if (edge === "top") y = cur.y
  else y = cur.y + cur.h - h

  // Vertical/horizontal secondary clamp so the bar stays on-screen.
  try {
    const { currentMonitor } = await import("@tauri-apps/api/window")
    const monitor = await currentMonitor()
    if (monitor) {
      const wa = monitor.workArea
      const pad = Math.round(EDGE_INSET * scale)
      x = Math.min(Math.max(x, wa.position.x + pad), wa.position.x + wa.size.width - w - pad)
      y = Math.min(Math.max(y, wa.position.y + pad), wa.position.y + wa.size.height - h - pad)
    }
  } catch {
    /* ignore */
  }

  return { x, y, w, h }
}

export async function setMiniPeek(peek: boolean): Promise<void> {
  if ((!sessionActive && !usePlayerStore.getState().miniMode) || transitioning || peekBusy) return
  if (peek && queueExpanded) return
  if (usePlayerStore.getState().miniPeek === peek) return

  const win = await getWin()
  if (!win) {
    usePlayerStore.setState({ miniPeek: peek })
    if (peek) document.documentElement.dataset.miniPeek = "true"
    else delete document.documentElement.dataset.miniPeek
    return
  }

  peekBusy = true
  setMorphing(true)
  clearSettleTimer()
  setDockHint(null)
  await sleep(36)

  try {
    await unlockSizeConstraints(win)

    if (peek) {
      const edge = (await detectDockEdge(win)) ?? dockEdge
      if (!edge) {
        usePlayerStore.setState({ miniPeek: false })
        delete document.documentElement.dataset.miniPeek
        await revealAfterMorph()
        return
      }
      dockEdge = edge
      const target = await peekTarget(win, edge)
      await animateWindowRect(win, target, PEEK_MS)
      setDockHint(null)
      delete document.documentElement.dataset.miniDock
      usePlayerStore.setState({ miniPeek: true, miniDockHint: null })
      document.documentElement.dataset.miniPeek = "true"
      await lockLogicalSize(win, MINI_PEEK_SIZE, MINI_PEEK_SIZE)
    } else {
      const edge = dockEdge ?? (await detectDockEdge(win)) ?? "right"
      dockEdge = edge
      const target = await expandedTargetFromPeek(win, edge)
      await animateWindowRect(win, target, PEEK_MS)
      clearSettleTimer()
      setDockHint(null)
      delete document.documentElement.dataset.miniDock
      usePlayerStore.setState({ miniPeek: false, miniDockHint: null })
      delete document.documentElement.dataset.miniPeek
      await lockLogicalSize(win, MINI_WIDTH, barHeight())
    }

    await revealAfterMorph()
  } catch {
    setMorphing(false)
  } finally {
    clearSettleTimer()
    peekBusy = false
    // Vinyl: no dock chrome. Bar: keep the edge strip while still docked.
    if (peek || usePlayerStore.getState().miniPeek) {
      setDockHint(null)
    } else if (dockEdge) {
      setDockHint(dockEdge)
    } else {
      setDockHint(null)
    }
  }
}

/** Schedule auto-collapse when docked and the pointer is outside. */
export function scheduleMiniPeekCollapse(delayMs = COLLAPSE_DELAY_MS): void {
  clearCollapseTimer()
  // Don't gate on `transitioning` here — enter finishes in `finally` after scheduling.
  if (!sessionActive || queueExpanded || pointerInside) return
  if (usePlayerStore.getState().miniPeek) return

  collapseTimer = setTimeout(() => {
    collapseTimer = null
    void (async () => {
      if (!sessionActive || queueExpanded || pointerInside || transitioning) return
      const win = await getWin()
      if (!win) return
      const edge = await detectDockEdge(win)
      if (!edge) {
        dockEdge = null
        setDockHint(null)
        return
      }
      dockEdge = edge
      await setMiniPeek(true)
    })()
  }, delayMs)
}

export function notifyMiniPointerEnter(): void {
  pointerInside = true
  clearCollapseTimer()
  if (usePlayerStore.getState().miniPeek) {
    void setMiniPeek(false)
  }
}

export function notifyMiniPointerLeave(): void {
  pointerInside = false
  scheduleMiniPeekCollapse()
}

async function bindMovedListener(win: Window): Promise<void> {
  movedUnlisten?.()
  movedUnlisten = await win.onMoved(() => {
    if (!sessionActive || transitioning || clamping || peekBusy) return
    if (usePlayerStore.getState().miniPeek) return
    if (moveRaf) cancelAnimationFrame(moveRaf)
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0
      void onMiniMovedLive(win)
    })

    // Drag settled → magnetic snap (still fully visible) then maybe peek.
    clearSettleTimer()
    settleTimer = setTimeout(() => {
      settleTimer = null
      void onMiniMoveSettled(win)
    }, MOVE_SETTLE_MS)
  })
}

/** While dragging: only update the dock hint — never fight the OS drag with setPosition. */
async function onMiniMovedLive(win: Window): Promise<void> {
  if (!sessionActive || transitioning || peekBusy || usePlayerStore.getState().miniPeek) return
  if (queueExpanded) {
    setDockHint(null)
    return
  }
  const edge = await detectDockEdge(win)
  dockEdge = edge
  setDockHint(edge)
}

/** After drag stops: clamp on-screen, keep dock chrome if still in zone, then maybe peek. */
async function onMiniMoveSettled(win: Window): Promise<void> {
  if (!sessionActive || transitioning || peekBusy) return
  if (usePlayerStore.getState().miniPeek) return

  await clampFullyVisible(win)
  const edge = await detectDockEdge(win)
  dockEdge = edge
  // Stay lit while docked — tells the user the magnetic edge is active.
  setDockHint(edge)

  if (!edge || queueExpanded || pointerInside) return

  await magneticSnapToEdge(win, edge)
  scheduleMiniPeekCollapse(COLLAPSE_DELAY_MS)
}

function unbindMovedListener() {
  movedUnlisten?.()
  movedUnlisten = null
  clearSettleTimer()
  if (moveRaf) {
    cancelAnimationFrame(moveRaf)
    moveRaf = 0
  }
}

/** Grow/shrink the mini window for the bottom queue panel (keeps current x/y). */
export async function setMiniQueueExpanded(expanded: boolean): Promise<void> {
  if ((!sessionActive && !usePlayerStore.getState().miniMode) || transitioning) return
  queueExpanded = expanded
  clearCollapseTimer()

  if (expanded && usePlayerStore.getState().miniPeek) {
    await setMiniPeek(false)
  }
  setDockHint(null)

  const win = await getWin()
  if (!win) return

  const { LogicalSize } = await import("@tauri-apps/api/dpi")
  const height = barHeight()
  try {
    await win.setMinSize(new LogicalSize(MINI_WIDTH, height))
    await win.setMaxSize(new LogicalSize(MINI_WIDTH, height))
    await win.setSize(new LogicalSize(MINI_WIDTH, height))
  } catch {
    /* best-effort */
  }

  if (!expanded) scheduleMiniPeekCollapse(500)
}

export function isMiniPlayerSession(): boolean {
  return sessionActive
}

/**
 * Shrink main into a frameless always-on-top mini bar (identical chrome on Win/Mac).
 * Veil → swap chrome → morph geometry → reveal → soft dock peek.
 */
export async function enterMiniPlayer(): Promise<void> {
  if (sessionActive || usePlayerStore.getState().miniMode || transitioning) return
  transitioning = true
  setMorphing(true)
  queueExpanded = false
  dockEdge = "right"
  pointerInside = false
  clearCollapseTimer()
  clearSettleTimer()

  try {
    if (isLyricsFullscreenSession()) {
      await exitLyricsFullscreen()
    }
    usePlayerStore.setState({ showLyrics: false, showQueue: false, miniPeek: false, miniDockHint: null })
    delete document.documentElement.dataset.miniPeek
    delete document.documentElement.dataset.miniDock

    // Brief hold so the veil is visible on the full layout before the swap.
    await sleep(48)

    const win = await getWin()
    if (!win) {
      applyMiniCss(true)
      sessionActive = true
      usePlayerStore.setState({ miniMode: true, miniDockHint: null })
      await revealAfterMorph()
      return
    }

    const maximized = await win.isMaximized()
    if (await win.isFullscreen()) {
      await win.setFullscreen(false)
    }
    if (maximized) {
      await win.unmaximize()
      await sleep(32)
    }

    saved = {
      size: await win.outerSize(),
      position: await win.outerPosition(),
      maximized,
      alwaysOnTop: await win.isAlwaysOnTop(),
      resizable: await win.isResizable(),
    }

    if (isMacOs()) {
      try {
        await win.setDecorations(false)
      } catch {
        /* best-effort */
      }
      try {
        await win.setShadow(true)
      } catch {
        /* optional */
      }
    }

    applyMiniCss(true)
    usePlayerStore.setState({ miniMode: true, miniPeek: false, miniDockHint: null })
    delete document.documentElement.dataset.miniPeek
    delete document.documentElement.dataset.miniDock
    sessionActive = true
    await sleep(24)

    await unlockSizeConstraints(win)
    const target = await miniTargetPhysical(win)
    await animateWindowRect(win, target, TRANSITION_MS)
    await lockLogicalSize(win, MINI_WIDTH, MINI_HEIGHT)
    await win.setAlwaysOnTop(true)
    try {
      await win.setSkipTaskbar(true)
    } catch {
      /* optional */
    }
    await bindMovedListener(win)
    await revealAfterMorph()
    // Don't flash dock chrome before the auto vinyl peek — hint is for drag only.
    scheduleMiniPeekCollapse(320)
  } catch {
    setMorphing(false)
  } finally {
    transitioning = false
  }
}

/**
 * Restore main window geometry and platform chrome.
 * One continuous veil covers peek→bar→main so the layout never flashes mid-size.
 */
export async function exitMiniPlayer(): Promise<void> {
  if (transitioning || peekBusy) return
  if (!sessionActive && !usePlayerStore.getState().miniMode && !saved) {
    applyMiniCss(false)
    usePlayerStore.setState({ miniMode: false, miniMorphing: false, miniPeek: false, miniDockHint: null })
    delete document.documentElement.dataset.miniMorphing
    delete document.documentElement.dataset.miniPeek
    delete document.documentElement.dataset.miniDock
    return
  }

  transitioning = true
  clearCollapseTimer()
  unbindMovedListener()
  setMorphing(true)
  setDockHint(null)
  const win = await getWin()
  const snapshot = saved
  saved = null
  queueExpanded = false
  const wasPeek = usePlayerStore.getState().miniPeek
  const edgeForExpand = dockEdge ?? "right"
  dockEdge = null

  try {
    if (!win) {
      sessionActive = false
      applyMiniCss(false)
      usePlayerStore.setState({ miniMode: false, miniPeek: false, miniDockHint: null })
      delete document.documentElement.dataset.miniPeek
      delete document.documentElement.dataset.miniDock
      await revealAfterMorph()
      return
    }

    await sleep(36)
    await unlockSizeConstraints(win)

    // Under the same veil: vinyl → bar footprint, then bar → main.
    if (wasPeek) {
      const barTarget = await expandedTargetFromPeek(win, edgeForExpand)
      await animateWindowRect(win, barTarget, PEEK_MS)
      usePlayerStore.setState({ miniPeek: false, miniDockHint: null })
      delete document.documentElement.dataset.miniPeek
      delete document.documentElement.dataset.miniDock
      await lockLogicalSize(win, MINI_WIDTH, MINI_HEIGHT)
      await unlockSizeConstraints(win)
    }

    try {
      await win.setAlwaysOnTop(false)
    } catch {
      /* ignore */
    }
    try {
      await win.setSkipTaskbar(false)
    } catch {
      /* ignore */
    }

    if (snapshot) {
      await animateWindowRect(
        win,
        {
          x: snapshot.position.x,
          y: snapshot.position.y,
          w: snapshot.size.width,
          h: snapshot.size.height,
        },
        TRANSITION_MS,
      )
    }

    const { LogicalSize } = await import("@tauri-apps/api/dpi")
    try {
      await win.setMaxSize(null)
    } catch {
      /* ignore */
    }
    try {
      await win.setMinSize(new LogicalSize(MAIN_MIN_WIDTH, MAIN_MIN_HEIGHT))
    } catch {
      /* ignore */
    }
    try {
      await win.setResizable(snapshot?.resizable ?? true)
    } catch {
      /* ignore */
    }

    if (isMacOs()) {
      try {
        await win.setDecorations(true)
        await win.setTitleBarStyle("overlay")
        await win.setShadow(true)
      } catch {
        /* best-effort */
      }
    }

    if (snapshot?.maximized) {
      try {
        await win.maximize()
        document.documentElement.dataset.maximized = "true"
      } catch {
        document.documentElement.dataset.maximized = "false"
      }
    } else {
      document.documentElement.dataset.maximized = "false"
    }

    sessionActive = false
    applyMiniCss(false)
    usePlayerStore.setState({ miniMode: false, miniPeek: false, miniDockHint: null })
    delete document.documentElement.dataset.miniPeek
    delete document.documentElement.dataset.miniDock
    await revealAfterMorph()
  } catch {
    setMorphing(false)
  } finally {
    transitioning = false
  }
}
