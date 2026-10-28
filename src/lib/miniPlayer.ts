import type { Window } from "@tauri-apps/api/window";
import type { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { isMacOs } from "@/lib/os";
import {
  exitLyricsFullscreen,
  isLyricsFullscreenSession,
} from "@/lib/lyricsFullscreen";
import { readData, writeData } from "@/lib/db";
import { refreshMainWindowShadow } from "@/lib/showWindow";
import { usePlayerStore } from "@/stores/playerStore";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Device-local mini-bar position (physical px). Deliberately not in config sync
 * (see configIO DB_FILES — this file is never exported).
 */
const MINI_POS_FILE = "miniPlayer.json";

type MiniPosPrefs = {
  x: number;
  y: number;
};

// Window geometry lives in a dependency-free module so the numbers that the
// native window is sized to can be pinned by a plain-node check.
export {
  MINI_WIDTH,
  MINI_HEIGHT,
  MINI_QUEUE_MAX_ROWS,
  MINI_QUEUE_HEIGHT,
  MINI_PEEK_SIZE,
  miniQueuePanelHeight,
} from "@/lib/miniPlayerGeometry";
import {
  MINI_WIDTH,
  MINI_HEIGHT,
  MINI_PEEK_SIZE,
  miniQueuePanelHeight,
  clampOriginToWorkArea,
} from "@/lib/miniPlayerGeometry";
import { miniToggleDirection } from "@/lib/miniPlayerSession";

/**
 * Uniform inset from work-area edges for corner place, magnetic snap,
 * peek dock, and on-screen clamp — top must match right (same for all sides).
 */
const EDGE_INSET = 14;
/** Distance from work-area edge that arms the dock hint / magnetic snap. */
const EDGE_THRESHOLD_LOGICAL = 40;
/** When already docking one edge, also pin the orthogonal axis if this close. */
const CORNER_PIN_LOGICAL = 48;
/** Main → mini enter morph (ease-out; ≤400ms per motion guidance). */
const TRANSITION_ENTER_MS = 300;
/** Mini → main exit morph (~65% of enter — exit-faster-than-enter). */
const TRANSITION_EXIT_MS = 200;
/** Bar ↔ vinyl peek morph. */
const PEEK_MS = 240;
const COLLAPSE_DELAY_MS = 360;
const MOVE_SETTLE_MS = 200;
/** Brief hold so the veiled target chrome paints before clearing the veil. */
const REVEAL_HOLD_MS = 36;
/** Brief hold so soft peek veil can paint. */
const VEIL_IN_MS = 32;
/** Wait for full morph content to fade out before resizing (matches CSS). */
const VEIL_IN_FULL_MS = 120;

/** Matches tauri.conf.json main window mins — restored on exit. */
const MAIN_MIN_WIDTH = 1200;
const MAIN_MIN_HEIGHT = 786;
/** How long to wait for an animated fullscreen exit to settle before sampling. */
const FULLSCREEN_EXIT_TIMEOUT_MS = 900;

type SavedChrome = {
  size: PhysicalSize;
  position: PhysicalPosition;
  maximized: boolean;
  alwaysOnTop: boolean;
  resizable: boolean;
};

type PhysRect = { x: number; y: number; w: number; h: number };
export type DockEdge = "left" | "right" | "top" | "bottom";
type MorphEase = "enter" | "exit" | "peek";

let saved: SavedChrome | null = null;
let sessionActive = false;
let transitioning = false;
let queueExpanded = false;
let dockEdge: DockEdge | null = null;
let collapseTimer: ReturnType<typeof setTimeout> | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let movedUnlisten: (() => void) | null = null;
let pointerInside = false;
let moveRaf = 0;
let clamping = false;
let peekBusy = false;

async function getWin(): Promise<Window | null> {
  if (!isTauri) return null;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function setMorphing(on: boolean, soft = false) {
  usePlayerStore.setState({ miniMorphing: on });
  if (on) {
    document.documentElement.dataset.miniMorphing = "true";
    if (soft) document.documentElement.dataset.miniMorphSoft = "true";
    else delete document.documentElement.dataset.miniMorphSoft;
  } else {
    delete document.documentElement.dataset.miniMorphing;
    delete document.documentElement.dataset.miniMorphSoft;
  }
}

async function revealAfterMorph(): Promise<void> {
  // One paint under the veil, then ease filter/opacity back via CSS.
  await sleep(REVEAL_HOLD_MS);
  setMorphing(false);
}

function applyMiniCss(on: boolean) {
  if (on) {
    document.documentElement.dataset.mini = "true";
    document.documentElement.dataset.maximized = "false";
  } else {
    delete document.documentElement.dataset.mini;
  }
}

/** Ease-out expo — snappy start, soft settle (spring-like without overshoot). */
function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

/** Ease-in-out cubic — balanced for exit / large restores. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Soft ease-out for peek (disc stays readable while the shell moves). */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function morphEase(kind: MorphEase, t: number): number {
  if (kind === "exit") return easeInOutCubic(t);
  if (kind === "peek") return easeOutCubic(t);
  return easeOutExpo(t);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function clearCollapseTimer() {
  if (collapseTimer != null) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
}

function clearSettleTimer() {
  if (settleTimer != null) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
}

function setDockHint(edge: DockEdge | null) {
  // Never paint dock chrome while the vinyl peek is up / morphing into it.
  if (edge && (peekBusy || usePlayerStore.getState().miniPeek)) edge = null;
  if (usePlayerStore.getState().miniDockHint === edge) {
    // Keep DOM dataset in sync even when the store value didn't change.
    if (!edge) delete document.documentElement.dataset.miniDock;
    return;
  }
  usePlayerStore.setState({ miniDockHint: edge });
  if (edge) document.documentElement.dataset.miniDock = edge;
  else delete document.documentElement.dataset.miniDock;
}

async function readRect(win: Window): Promise<PhysRect> {
  const size = await win.outerSize();
  const pos = await win.outerPosition();
  return { x: pos.x, y: pos.y, w: size.width, h: size.height };
}

/**
 * Interpolate outer size + position in physical pixels.
 * Prefer the Rust one-shot morph (size+pos per step, single invoke) so the
 * WebView isn't also driving a rAF/IPC storm during resize.
 */
async function animateWindowRect(
  win: Window,
  to: PhysRect,
  durationMs: number,
  ease: MorphEase = "enter",
): Promise<void> {
  const ms = prefersReducedMotion() ? 0 : durationMs;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("animate_window_outer_rect", {
      to: { x: to.x, y: to.y, w: to.w, h: to.h },
      durationMs: ms,
      ease,
    });
    return;
  } catch {
    /* fall through to JS path (browser preview / older builds) */
  }

  const { PhysicalSize, PhysicalPosition } =
    await import("@tauri-apps/api/dpi");
  const from = await readRect(win);
  const apply = async (r: PhysRect) => {
    await win.setSize(new PhysicalSize(r.w, r.h));
    await win.setPosition(new PhysicalPosition(r.x, r.y));
  };

  if (
    Math.abs(from.x - to.x) < 2 &&
    Math.abs(from.y - to.y) < 2 &&
    Math.abs(from.w - to.w) < 2 &&
    Math.abs(from.h - to.h) < 2
  ) {
    await apply(to);
    return;
  }

  if (ms <= 0) {
    await apply(to);
    return;
  }

  const steps = Math.min(12, Math.max(8, Math.ceil(ms / 28)));
  const stepMs = Math.max(1, Math.floor(ms / steps));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = morphEase(ease, t);
    await apply({
      w: Math.max(1, Math.round(from.w + (to.w - from.w) * e)),
      h: Math.max(1, Math.round(from.h + (to.h - from.h) * e)),
      x: Math.round(from.x + (to.x - from.x) * e),
      y: Math.round(from.y + (to.y - from.y) * e),
    });
    if (i < steps) await sleep(stepMs);
  }
  await apply(to);
}

async function unlockSizeConstraints(win: Window): Promise<void> {
  const { LogicalSize } = await import("@tauri-apps/api/dpi");
  try {
    await win.setMaxSize(null);
  } catch {
    /* ignore */
  }
  try {
    await win.setMinSize(new LogicalSize(MINI_PEEK_SIZE, MINI_PEEK_SIZE));
  } catch {
    /* ignore */
  }
  try {
    await win.setResizable(true);
  } catch {
    /* ignore */
  }
}

async function lockLogicalSize(
  win: Window,
  width: number,
  height: number,
): Promise<void> {
  const { LogicalSize } = await import("@tauri-apps/api/dpi");
  await win.setMinSize(new LogicalSize(width, height));
  try {
    await win.setMaxSize(new LogicalSize(width, height));
  } catch {
    /* optional */
  }
  try {
    await win.setResizable(false);
  } catch {
    /* optional */
  }
  await win.setSize(new LogicalSize(width, height));
}

function barHeight(): number {
  if (!queueExpanded) return MINI_HEIGHT;
  const n = usePlayerStore.getState().queue.length;
  return MINI_HEIGHT + miniQueuePanelHeight(n);
}

/** Right-edge center mini target in physical pixels for the current monitor. */
async function miniTargetPhysical(win: Window): Promise<PhysRect> {
  const { currentMonitor } = await import("@tauri-apps/api/window");
  const scale = (await win.scaleFactor()) || 1;
  const heightLogical = barHeight();
  const w = Math.round(MINI_WIDTH * scale);
  const h = Math.round(heightLogical * scale);
  try {
    const monitor = await currentMonitor();
    if (monitor) {
      const wa = monitor.workArea;
      const pad = Math.round(EDGE_INSET * scale);
      const right = wa.position.x + wa.size.width - w - pad;
      const centreY = wa.position.y + Math.round((wa.size.height - h) / 2);
      const { x, y } = clampOriginToWorkArea(
        right,
        centreY,
        w,
        h,
        {
          x: wa.position.x,
          y: wa.position.y,
          width: wa.size.width,
          height: wa.size.height,
        },
        pad,
      );
      return { x, y, w, h };
    }
  } catch {
    /* fall through */
  }
  const cur = await readRect(win);
  return { x: Math.max(0, cur.x + cur.w - w), y: Math.max(0, cur.y), w, h };
}

async function loadSavedMiniPos(): Promise<MiniPosPrefs | null> {
  if (!isTauri) return null;
  try {
    const data = await readData<Partial<MiniPosPrefs>>(MINI_POS_FILE, {});
    if (
      typeof data.x === "number" &&
      typeof data.y === "number" &&
      Number.isFinite(data.x) &&
      Number.isFinite(data.y)
    ) {
      return { x: Math.round(data.x), y: Math.round(data.y) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persistMiniPos(x: number, y: number): void {
  if (!isTauri) return;
  void writeData(MINI_POS_FILE, {
    x: Math.round(x),
    y: Math.round(y),
  } satisfies MiniPosPrefs);
}

/** Save current bar top-left (skip while in cover peek). */
async function persistCurrentMiniBarPos(win: Window): Promise<void> {
  if (usePlayerStore.getState().miniPeek) return;
  await persistWindowPos(win);
}

/**
 * Save the window's current top-left regardless of peek state.
 *
 * The peek disc is draggable, and while peeking the window origin *is* the disc
 * origin, so it is what the next enter should restore.
 */
async function persistWindowPos(win: Window): Promise<void> {
  try {
    const r = await readRect(win);
    persistMiniPos(r.x, r.y);
  } catch {
    /* ignore */
  }
}

/** Prefer last dragged position; fall back to default right-edge center. */
async function resolveMiniEnterTarget(win: Window): Promise<PhysRect> {
  const scale = (await win.scaleFactor()) || 1;
  const w = Math.round(MINI_WIDTH * scale);
  const h = Math.round(MINI_HEIGHT * scale);
  const savedPos = await loadSavedMiniPos();
  if (!savedPos) return miniTargetPhysical(win);

  let x = savedPos.x;
  let y = savedPos.y;
  try {
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const monitor = await currentMonitor();
    if (monitor) {
      const wa = monitor.workArea;
      const pad = Math.round(EDGE_INSET * scale);
      ({ x, y } = clampOriginToWorkArea(
        x,
        y,
        w,
        h,
        {
          x: wa.position.x,
          y: wa.position.y,
          width: wa.size.width,
          height: wa.size.height,
        },
        pad,
      ));
    }
  } catch {
    /* keep saved */
  }
  return { x, y, w, h };
}

/**
 * Move the window without letting our own `Moved` echo re-enter the pipeline.
 *
 * `clamping` has to be cleared on the failure path too. It used to be set
 * outside the `try` and reset only in a `queueMicrotask` on the success path, so
 * one rejected `setPosition` (which every caller then swallowed) left it `true`
 * for the rest of the process — and the `onMoved` handler returns on it. From
 * then on there was no dock hint, no settle handling, no on-screen clamp, no
 * magnetic snap and no position persistence, until a restart.
 *
 * The reset is deferred by a timer rather than a microtask because the OS
 * delivers the `Moved` echo asynchronously; a microtask ran before it arrived.
 */
async function moveWindow(
  win: Window,
  position: PhysicalPosition,
): Promise<void> {
  clamping = true;
  try {
    await win.setPosition(position);
  } catch {
    /* a rejected move must not latch the guard */
  } finally {
    setTimeout(() => {
      clamping = false;
    }, 80);
  }
}

/**
 * Keep the entire mini window inside the monitor work area so the bar
 * never slides off-screen during / after a drag.
 */
async function clampFullyVisible(win: Window): Promise<PhysRect> {
  const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
  const { currentMonitor } = await import("@tauri-apps/api/window");
  const rect = await readRect(win);
  try {
    const monitor = await currentMonitor();
    if (!monitor) return rect;
    const scale = monitor.scaleFactor || (await win.scaleFactor()) || 1;
    const pad = Math.round(EDGE_INSET * scale);
    const wa = monitor.workArea;
    const { x, y } = clampOriginToWorkArea(
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      {
        x: wa.position.x,
        y: wa.position.y,
        width: wa.size.width,
        height: wa.size.height,
      },
      pad,
    );
    if (Math.abs(x - rect.x) > 1 || Math.abs(y - rect.y) > 1) {
      await moveWindow(win, new PhysicalPosition(x, y));
      return { ...rect, x, y };
    }
  } catch {
    /* ignore */
  }
  return rect;
}

/** Soft-snap flush to a work-area edge while keeping the full bar visible. */
async function magneticSnapToEdge(win: Window, edge: DockEdge): Promise<void> {
  const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
  const { currentMonitor } = await import("@tauri-apps/api/window");
  try {
    const monitor = await currentMonitor();
    if (!monitor) return;
    const scale = monitor.scaleFactor || (await win.scaleFactor()) || 1;
    const pad = Math.round(EDGE_INSET * scale);
    const corner = CORNER_PIN_LOGICAL * scale;
    const wa = monitor.workArea;
    const rect = await readRect(win);
    let x = rect.x;
    let y = rect.y;
    if (edge === "right") x = wa.position.x + wa.size.width - rect.w - pad;
    else if (edge === "left") x = wa.position.x + pad;
    else if (edge === "top") y = wa.position.y + pad;
    else y = wa.position.y + wa.size.height - rect.h - pad;

    // Corner pin: if already near an adjacent edge, snap that axis too
    // so top-right (etc.) keeps equal inset on both sides.
    const distL = rect.x - wa.position.x;
    const distR = wa.position.x + wa.size.width - (rect.x + rect.w);
    const distT = rect.y - wa.position.y;
    const distB = wa.position.y + wa.size.height - (rect.y + rect.h);
    if (edge === "right" || edge === "left") {
      if (distT <= corner) y = wa.position.y + pad;
      else if (distB <= corner)
        y = wa.position.y + wa.size.height - rect.h - pad;
    } else {
      if (distL <= corner) x = wa.position.x + pad;
      else if (distR <= corner)
        x = wa.position.x + wa.size.width - rect.w - pad;
    }

    // Keep the orthogonal axis fully on-screen too.
    const clamped = clampOriginToWorkArea(
      x,
      y,
      rect.w,
      rect.h,
      {
        x: wa.position.x,
        y: wa.position.y,
        width: wa.size.width,
        height: wa.size.height,
      },
      pad,
    );
    x = clamped.x;
    y = clamped.y;

    if (Math.abs(x - rect.x) > 1 || Math.abs(y - rect.y) > 1) {
      await moveWindow(win, new PhysicalPosition(x, y));
    }
  } catch {
    /* ignore */
  }
}

async function detectDockEdge(win: Window): Promise<DockEdge | null> {
  const { currentMonitor } = await import("@tauri-apps/api/window");
  try {
    const monitor = await currentMonitor();
    if (!monitor) return null;
    const scale = monitor.scaleFactor || (await win.scaleFactor()) || 1;
    const thr = EDGE_THRESHOLD_LOGICAL * scale;
    const rect = await readRect(win);
    const wa = monitor.workArea;
    const distL = rect.x - wa.position.x;
    const distR = wa.position.x + wa.size.width - (rect.x + rect.w);
    const distT = rect.y - wa.position.y;
    const distB = wa.position.y + wa.size.height - (rect.y + rect.h);

    const hits: { edge: DockEdge; d: number }[] = [];
    if (distR <= thr) hits.push({ edge: "right", d: distR });
    if (distL <= thr) hits.push({ edge: "left", d: distL });
    if (distT <= thr) hits.push({ edge: "top", d: distT });
    if (distB <= thr) hits.push({ edge: "bottom", d: distB });
    if (!hits.length) return null;
    hits.sort((a, b) => a.d - b.d);
    const best = hits[0].d;
    const near = hits.filter((h) => Math.abs(h.d - best) < 2);
    const horiz = near.find((h) => h.edge === "right" || h.edge === "left");
    return (horiz ?? near[0]).edge;
  } catch {
    return null;
  }
}

async function peekTarget(win: Window, edge: DockEdge): Promise<PhysRect> {
  const { currentMonitor } = await import("@tauri-apps/api/window");
  const scale = (await win.scaleFactor()) || 1;
  const size = Math.round(MINI_PEEK_SIZE * scale);
  const pad = Math.round(EDGE_INSET * scale);
  const corner = CORNER_PIN_LOGICAL * scale;
  const cur = await readRect(win);
  let x = cur.x;
  let y = cur.y;

  try {
    const monitor = await currentMonitor();
    if (monitor) {
      const wa = monitor.workArea;
      const minX = wa.position.x + pad;
      const minY = wa.position.y + pad;
      const maxX = wa.position.x + wa.size.width - size - pad;
      const maxY = wa.position.y + wa.size.height - size - pad;
      const distL = cur.x - wa.position.x;
      const distR = wa.position.x + wa.size.width - (cur.x + cur.w);
      const distT = cur.y - wa.position.y;
      const distB = wa.position.y + wa.size.height - (cur.y + cur.h);

      if (edge === "right") {
        x = maxX;
        if (distT <= corner) y = minY;
        else if (distB <= corner) y = maxY;
      } else if (edge === "left") {
        x = minX;
        if (distT <= corner) y = minY;
        else if (distB <= corner) y = maxY;
      } else if (edge === "top") {
        y = minY;
        if (distL <= corner) x = minX;
        else if (distR <= corner) x = maxX;
      } else {
        y = maxY;
        if (distL <= corner) x = minX;
        else if (distR <= corner) x = maxX;
      }
      // One clamp at the end covers both axes, including the orthogonal
      // "keep where it was" case and the work-area-smaller-than-the-window case.
      ({ x, y } = clampOriginToWorkArea(
        x,
        y,
        size,
        size,
        {
          x: wa.position.x,
          y: wa.position.y,
          width: wa.size.width,
          height: wa.size.height,
        },
        pad,
      ));
      return { x, y, w: size, h: size };
    }
  } catch {
    /* fall through */
  }

  if (edge === "right") x = cur.x + cur.w - size;
  else if (edge === "left") x = cur.x;
  else if (edge === "top") y = cur.y;
  else y = cur.y + cur.h - size;
  return { x, y, w: size, h: size };
}

/** Expand from peek while keeping the docked edge anchored. */
async function expandedTargetFromPeek(
  win: Window,
  edge: DockEdge,
): Promise<PhysRect> {
  const scale = (await win.scaleFactor()) || 1;
  const w = Math.round(MINI_WIDTH * scale);
  const h = Math.round(barHeight() * scale);
  const cur = await readRect(win);
  let x = cur.x;
  let y = cur.y;

  if (edge === "right") x = cur.x + cur.w - w;
  else if (edge === "left") x = cur.x;
  else if (edge === "top") y = cur.y;
  else y = cur.y + cur.h - h;

  // Vertical/horizontal secondary clamp so the bar stays on-screen.
  try {
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const monitor = await currentMonitor();
    if (monitor) {
      const wa = monitor.workArea;
      const pad = Math.round(EDGE_INSET * scale);
      ({ x, y } = clampOriginToWorkArea(
        x,
        y,
        w,
        h,
        {
          x: wa.position.x,
          y: wa.position.y,
          width: wa.size.width,
          height: wa.size.height,
        },
        pad,
      ));
    }
  } catch {
    /* ignore */
  }

  return { x, y, w, h };
}

export async function setMiniPeek(peek: boolean): Promise<void> {
  if (
    (!sessionActive && !usePlayerStore.getState().miniMode) ||
    transitioning ||
    peekBusy
  )
    return;
  if (peek && queueExpanded) return;
  if (usePlayerStore.getState().miniPeek === peek) return;

  const win = await getWin();
  if (!win) {
    usePlayerStore.setState({ miniPeek: peek });
    if (peek) document.documentElement.dataset.miniPeek = "true";
    else delete document.documentElement.dataset.miniPeek;
    return;
  }

  peekBusy = true;
  // Soft veil: opacity only — blur during resize is the main stutter source.
  setMorphing(true, true);
  clearSettleTimer();
  setDockHint(null);
  await sleep(VEIL_IN_MS);

  try {
    await unlockSizeConstraints(win);

    if (peek) {
      const edge = (await detectDockEdge(win)) ?? dockEdge;
      if (!edge) {
        usePlayerStore.setState({ miniPeek: false });
        delete document.documentElement.dataset.miniPeek;
        await revealAfterMorph();
        return;
      }
      dockEdge = edge;
      const target = await peekTarget(win, edge);
      // Swap to vinyl *before* geometry so the disc stays a true circle while
      // the bar shell collapses around it (spatial continuity).
      setDockHint(null);
      delete document.documentElement.dataset.miniDock;
      usePlayerStore.setState({ miniPeek: true, miniDockHint: null });
      document.documentElement.dataset.miniPeek = "true";
      await sleep(16);
      await animateWindowRect(win, target, PEEK_MS, "peek");
      await lockLogicalSize(win, MINI_PEEK_SIZE, MINI_PEEK_SIZE);
    } else {
      // Re-detect rather than trusting the remembered edge: the vinyl disc is
      // draggable (it carries `data-tauri-drag-region`), and the move pipeline
      // ignores peek moves, so `dockEdge` can be stale by the time the user
      // hovers. Trusting it expanded the bar on the edge the disc used to be
      // docked to, which made it jump across the screen.
      const edge = (await detectDockEdge(win)) ?? dockEdge ?? "right";
      dockEdge = edge;
      const target = await expandedTargetFromPeek(win, edge);
      // Keep vinyl through the expand, then reveal the bar chrome.
      await animateWindowRect(win, target, PEEK_MS, "peek");
      clearSettleTimer();
      setDockHint(null);
      delete document.documentElement.dataset.miniDock;
      usePlayerStore.setState({ miniPeek: false, miniDockHint: null });
      delete document.documentElement.dataset.miniPeek;
      await lockLogicalSize(win, MINI_WIDTH, barHeight());
    }

    await revealAfterMorph();
  } catch {
    setMorphing(false);
  } finally {
    clearSettleTimer();
    peekBusy = false;
    // Vinyl: no dock chrome. Bar: keep the edge strip while still docked.
    if (peek || usePlayerStore.getState().miniPeek) {
      setDockHint(null);
    } else if (dockEdge) {
      setDockHint(dockEdge);
    } else {
      setDockHint(null);
    }
  }
}

/**
 * Reset the hover gate.
 *
 * `pointerInside` is only ever written by React mouse enter/leave, and a missed
 * `mouseleave` disables the dock peek for the rest of the process: the window can
 * shrink out from under the pointer (closing the queue panel, or a blur-driven
 * close) so the pointer ends up over the desktop without a leave event ever
 * firing, and `scheduleMiniPeekCollapse` then returns early forever.
 */
function resetMiniPointerInside(): void {
  pointerInside = false;
  clearCollapseTimer();
}

/**
 * Ask the OS where the cursor actually is, instead of trusting the last mouse
 * event. Falls back to the tracked flag if the query fails.
 */
async function pointerReallyInside(win: Window): Promise<boolean> {
  try {
    const { cursorPosition } = await import("@tauri-apps/api/window");
    const [point, rect] = await Promise.all([cursorPosition(), readRect(win)]);
    return (
      point.x >= rect.x &&
      point.x < rect.x + rect.w &&
      point.y >= rect.y &&
      point.y < rect.y + rect.h
    );
  } catch {
    return pointerInside;
  }
}

/** Schedule auto-collapse when docked and the pointer is outside. */
export function scheduleMiniPeekCollapse(delayMs = COLLAPSE_DELAY_MS): void {
  clearCollapseTimer();
  // Don't gate on `transitioning` here — enter finishes in `finally` after scheduling.
  if (!sessionActive || queueExpanded || pointerInside) return;
  if (usePlayerStore.getState().miniPeek) return;

  collapseTimer = setTimeout(() => {
    collapseTimer = null;
    void (async () => {
      if (!sessionActive || queueExpanded || transitioning) return;
      const win = await getWin();
      if (!win) return;
      // Re-check against the real cursor: the flag can be stale.
      if (await pointerReallyInside(win)) return;
      const edge = await detectDockEdge(win);
      if (!edge) {
        dockEdge = null;
        setDockHint(null);
        return;
      }
      dockEdge = edge;
      await setMiniPeek(true);
    })();
  }, delayMs);
}

export function notifyMiniPointerEnter(): void {
  pointerInside = true;
  clearCollapseTimer();
  if (usePlayerStore.getState().miniPeek) {
    void setMiniPeek(false);
  }
}

export function notifyMiniPointerLeave(): void {
  pointerInside = false;
  scheduleMiniPeekCollapse();
}

async function bindMovedListener(win: Window): Promise<void> {
  movedUnlisten?.();
  movedUnlisten = await win.onMoved(() => {
    if (!sessionActive || transitioning || clamping || peekBusy) return;
    if (usePlayerStore.getState().miniPeek) {
      // The vinyl disc is draggable too. The live pipeline cannot run while
      // peeking (it would fight the peek's own geometry), but the position still
      // has to be remembered, otherwise the next enter snaps the bar back to a
      // place the user moved the disc away from.
      clearSettleTimer();
      settleTimer = setTimeout(() => {
        settleTimer = null;
        void persistWindowPos(win);
      }, MOVE_SETTLE_MS);
      return;
    }
    if (moveRaf) cancelAnimationFrame(moveRaf);
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0;
      void onMiniMovedLive(win);
    });

    // Drag settled → magnetic snap (still fully visible) then maybe peek.
    clearSettleTimer();
    settleTimer = setTimeout(() => {
      settleTimer = null;
      void onMiniMoveSettled(win);
    }, MOVE_SETTLE_MS);
  });
}

/** While dragging: only update the dock hint — never fight the OS drag with setPosition. */
async function onMiniMovedLive(win: Window): Promise<void> {
  if (
    !sessionActive ||
    transitioning ||
    peekBusy ||
    usePlayerStore.getState().miniPeek
  )
    return;
  if (queueExpanded) {
    setDockHint(null);
    return;
  }
  const edge = await detectDockEdge(win);
  dockEdge = edge;
  setDockHint(edge);
}

/** After drag stops: clamp on-screen, keep dock chrome if still in zone, then maybe peek. */
async function onMiniMoveSettled(win: Window): Promise<void> {
  if (!sessionActive || transitioning || peekBusy) return;
  if (usePlayerStore.getState().miniPeek) return;

  await clampFullyVisible(win);
  const edge = await detectDockEdge(win);
  dockEdge = edge;
  // Stay lit while docked — tells the user the magnetic edge is active.
  setDockHint(edge);
  await persistCurrentMiniBarPos(win);

  if (!edge || queueExpanded || pointerInside) return;

  await magneticSnapToEdge(win, edge);
  await persistCurrentMiniBarPos(win);
  scheduleMiniPeekCollapse(COLLAPSE_DELAY_MS);
}

function unbindMovedListener() {
  movedUnlisten?.();
  movedUnlisten = null;
  clearSettleTimer();
  if (moveRaf) {
    cancelAnimationFrame(moveRaf);
    moveRaf = 0;
  }
}

/** Grow/shrink the mini window for the bottom queue panel (keeps current x/y). */
export async function setMiniQueueExpanded(expanded: boolean): Promise<void> {
  if ((!sessionActive && !usePlayerStore.getState().miniMode) || transitioning)
    return;
  queueExpanded = expanded;
  clearCollapseTimer();

  if (expanded && usePlayerStore.getState().miniPeek) {
    await setMiniPeek(false);
  }
  setDockHint(null);

  await applyMiniBarSize();

  if (!expanded) {
    // Collapsing shrinks the window out from under a pointer that may be over
    // the panel we just removed. That pointer is now over the desktop, where no
    // `mouseleave` will ever fire, so the tracked flag would stay `true` and
    // suppress the dock peek for good. Drop it; the collapse timer re-checks the
    // real cursor position anyway.
    resetMiniPointerInside();
    scheduleMiniPeekCollapse(500);
  }
}

/** Re-apply window size while the queue panel is open (e.g. songs added/removed). */
export async function syncMiniQueueWindowSize(): Promise<void> {
  if (!queueExpanded) return;
  if ((!sessionActive && !usePlayerStore.getState().miniMode) || transitioning)
    return;
  await applyMiniBarSize();
}

async function applyMiniBarSize(): Promise<void> {
  const win = await getWin();
  if (!win) return;

  const { LogicalSize } = await import("@tauri-apps/api/dpi");
  const height = barHeight();
  try {
    await win.setMinSize(new LogicalSize(MINI_WIDTH, height));
    await win.setMaxSize(new LogicalSize(MINI_WIDTH, height));
    await win.setSize(new LogicalSize(MINI_WIDTH, height));
  } catch {
    /* best-effort */
  }
}

export function isMiniPlayerSession(): boolean {
  return sessionActive;
}

/** Same shortcut for enter / exit. Enter needs a current song. */
export async function toggleMiniPlayer(): Promise<void> {
  if (transitioning || peekBusy) return;
  const direction = miniToggleDirection({
    hasSong: Boolean(usePlayerStore.getState().currentSong),
    miniMode: usePlayerStore.getState().miniMode,
    sessionActive,
  });
  if (direction === "exit") {
    await exitMiniPlayer();
    return;
  }
  if (direction === "enter") await enterMiniPlayer();
}

/**
 * Shrink main into a frameless always-on-top mini bar (identical chrome on Win/Mac).
 * Veil → swap chrome → morph geometry → reveal → soft dock peek.
 */
export async function enterMiniPlayer(): Promise<void> {
  if (
    sessionActive ||
    usePlayerStore.getState().miniMode ||
    transitioning ||
    !usePlayerStore.getState().currentSong
  )
    return;
  transitioning = true;
  setMorphing(true);
  queueExpanded = false;
  dockEdge = null;
  pointerInside = false;
  clearCollapseTimer();
  clearSettleTimer();

  try {
    if (isLyricsFullscreenSession()) {
      await exitLyricsFullscreen();
    }
    usePlayerStore.setState({
      showLyrics: false,
      showQueue: false,
      miniPeek: false,
      miniDockHint: null,
    });
    delete document.documentElement.dataset.miniPeek;
    delete document.documentElement.dataset.miniDock;

    // Brief hold so the veil hides content before the shell starts resizing.
    await sleep(VEIL_IN_FULL_MS);

    const win = await getWin();
    if (!win) {
      applyMiniCss(true);
      sessionActive = true;
      usePlayerStore.setState({ miniMode: true, miniDockHint: null });
      await revealAfterMorph();
      return;
    }

    // Leave fullscreen *and wait for it* before sampling the geometry we will
    // restore on exit. `setFullscreen(false)` is animated and asynchronous on
    // macOS, so sampling right after it records the screen-sized rect with
    // `maximized: false` — the exit then animates to a screen-sized window with
    // its title bar behind the menu bar. The lyrics path already waits the same
    // way (see lyricsFullscreen.ts); this mirrors it.
    if (await win.isFullscreen()) {
      await win.setFullscreen(false);
      const deadline = Date.now() + FULLSCREEN_EXIT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (!(await win.isFullscreen())) break;
        await sleep(30);
      }
      await sleep(48);
    }
    // Re-read after leaving fullscreen: some platforms report maximized only
    // once the fullscreen flag has actually dropped.
    const maximized = await win.isMaximized();
    if (maximized) {
      await win.unmaximize();
      await sleep(24);
    }

    saved = {
      size: await win.outerSize(),
      position: await win.outerPosition(),
      maximized,
      alwaysOnTop: await win.isAlwaysOnTop(),
      resizable: await win.isResizable(),
    };

    if (isMacOs()) {
      try {
        await win.setDecorations(false);
      } catch {
        /* best-effort */
      }
      // The mini bar floats above the desktop, so it keeps the native shadow.
      // `conf` starts with `shadow: false` (Windows needs that), which is why it
      // is asserted here. This is also why the exit path has to TOGGLE rather
      // than set true: by then the value is already true, so re-setting it does
      // nothing and AppKit keeps the layer it stopped painting when the style
      // mask changed.
      try {
        await win.setShadow(true);
      } catch {
        /* optional */
      }
    }

    applyMiniCss(true);
    usePlayerStore.setState({
      miniMode: true,
      miniPeek: false,
      miniDockHint: null,
    });
    delete document.documentElement.dataset.miniPeek;
    delete document.documentElement.dataset.miniDock;
    sessionActive = true;
    await sleep(16);

    await unlockSizeConstraints(win);
    const target = await resolveMiniEnterTarget(win);
    await animateWindowRect(win, target, TRANSITION_ENTER_MS, "enter");
    await lockLogicalSize(win, MINI_WIDTH, MINI_HEIGHT);
    await win.setAlwaysOnTop(true);
    try {
      await win.setSkipTaskbar(true);
    } catch {
      /* optional */
    }
    await bindMovedListener(win);
    await revealAfterMorph();
    const edge = await detectDockEdge(win);
    dockEdge = edge;
    setDockHint(edge);
    // Only auto-peek when restored/snapped near an edge — free-floating stays as the bar.
    if (edge) scheduleMiniPeekCollapse(320);
  } catch {
    // Never leave a half-entered shell behind. `saved` may already hold the
    // pre-mini geometry, so use it to get back to a normal main window; without
    // one, at least drop the mini chrome and store flags so the app is not stuck
    // rendering the bar with no way out.
    const snapshot = saved;
    saved = null;
    await forceRestoreMainWindow(await getWin().catch(() => null), snapshot).catch(
      () => {},
    );
    setMorphing(false);
  } finally {
    transitioning = false;
  }
}

/**
 * Force every mini-player trace out of the DOM and the store.
 *
 * Used by the failure paths, where leaving any of `sessionActive`, `data-mini`,
 * `miniMode` or the peek/dock attributes set strands the app in a half-mini
 * shell that the user cannot leave with a second press of the same button.
 */
function resetMiniUi(): void {
  sessionActive = false;
  queueExpanded = false;
  dockEdge = null;
  pointerInside = false;
  applyMiniCss(false);
  usePlayerStore.setState({
    miniMode: false,
    miniMorphing: false,
    miniPeek: false,
    miniDockHint: null,
  });
  delete document.documentElement.dataset.miniMorphing;
  delete document.documentElement.dataset.miniMorphSoft;
  delete document.documentElement.dataset.miniPeek;
  delete document.documentElement.dataset.miniDock;
}

/**
 * Best-effort restore of the main window when the normal exit path failed.
 *
 * The important part is that it *always* ends in a usable window: the app must
 * never be left as a 400×72 borderless shell rendering the full UI, which is
 * what happened when the restore threw after `saved` had already been cleared.
 */
async function forceRestoreMainWindow(
  win: Window | null,
  snapshot: SavedChrome | null,
): Promise<void> {
  if (win && snapshot) {
    try {
      await win.setAlwaysOnTop(false);
    } catch {
      /* ignore */
    }
    try {
      await win.setSkipTaskbar(false);
    } catch {
      /* ignore */
    }
    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    try {
      await win.setMaxSize(null);
    } catch {
      /* ignore */
    }
    try {
      await win.setMinSize(new LogicalSize(MAIN_MIN_WIDTH, MAIN_MIN_HEIGHT));
    } catch {
      /* ignore */
    }
    try {
      await win.setSize(snapshot.size);
      await win.setPosition(snapshot.position);
    } catch {
      /* ignore */
    }
    try {
      await win.setResizable(snapshot.resizable);
    } catch {
      /* ignore */
    }
    if (isMacOs()) {
      try {
        await win.setDecorations(true);
        await win.setTitleBarStyle("overlay");
      } catch {
        /* best-effort */
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("reapply_macos_traffic_lights");
      } catch {
        /* overlay inset is best-effort */
      }
    }
    if (snapshot.maximized) {
      try {
        await win.maximize();
      } catch {
        /* ignore */
      }
    }
    document.documentElement.dataset.maximized = snapshot.maximized
      ? "true"
      : "false";
  }
  resetMiniUi();
}

/**
 * Restore main window geometry and platform chrome.
 * Vinyl exits in one morph (disc → main) — no bar intermediate under the veil.
 */
export async function exitMiniPlayer(): Promise<void> {
  if (transitioning || peekBusy) return;
  if (!sessionActive && !usePlayerStore.getState().miniMode && !saved) {
    resetMiniUi();
    return;
  }

  transitioning = true;
  clearCollapseTimer();
  unbindMovedListener();
  setMorphing(true);
  setDockHint(null);
  const snapshot = saved;
  queueExpanded = false;
  pointerInside = false;
  const wasPeek = usePlayerStore.getState().miniPeek;
  dockEdge = null;

  let win: Window | null = null;
  let restored = false;

  try {
    win = await getWin();
    if (!win) {
      sessionActive = false;
      applyMiniCss(false);
      usePlayerStore.setState({
        miniMode: false,
        miniPeek: false,
        miniDockHint: null,
      });
      delete document.documentElement.dataset.miniPeek;
      delete document.documentElement.dataset.miniDock;
      await revealAfterMorph();
      restored = true;
      return;
    }

    await sleep(VEIL_IN_FULL_MS);
    await unlockSizeConstraints(win);

    if (wasPeek) {
      // Remember disc position; stay on vinyl chrome through the single expand.
      await persistWindowPos(win);
    } else {
      await persistCurrentMiniBarPos(win);
    }

    try {
      await win.setAlwaysOnTop(false);
    } catch {
      /* ignore */
    }
    try {
      await win.setSkipTaskbar(false);
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
        TRANSITION_EXIT_MS,
        "exit",
      );
    }

    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    try {
      await win.setMaxSize(null);
    } catch {
      /* ignore */
    }
    try {
      await win.setMinSize(new LogicalSize(MAIN_MIN_WIDTH, MAIN_MIN_HEIGHT));
    } catch {
      /* ignore */
    }
    try {
      await win.setResizable(snapshot?.resizable ?? true);
    } catch {
      /* ignore */
    }

    if (isMacOs()) {
      try {
        await win.setDecorations(true);
        await win.setTitleBarStyle("overlay");
      } catch {
        /* best-effort */
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("reapply_macos_traffic_lights");
      } catch {
        /* overlay inset is best-effort */
      }
    }

    if (snapshot?.maximized) {
      try {
        await win.maximize();
        document.documentElement.dataset.maximized = "true";
      } catch {
        document.documentElement.dataset.maximized = "false";
      }
    } else {
      document.documentElement.dataset.maximized = "false";
    }

    sessionActive = false;
    applyMiniCss(false);
    usePlayerStore.setState({
      miniMode: false,
      miniPeek: false,
      miniDockHint: null,
    });
    delete document.documentElement.dataset.miniPeek;
    delete document.documentElement.dataset.miniDock;
    await revealAfterMorph();
    // Last, once the window is decorated and visible again. Reported: switching
    // to the mini player and back left the main window with no shadow at all.
    // The enter path sets the shadow true and the exit path set it true again,
    // so the value never changed and AppKit never rebuilt the layer it had
    // stopped painting while the window was borderless. Reopening from the tray
    // was the known workaround because that path toggles it; this makes the
    // toggle part of the transition. Must come after `revealAfterMorph` — the
    // rebuild is what has to survive, so it cannot run while still veiled.
    await refreshMainWindowShadow();
    restored = true;
  } catch {
    // A restore step threw. Leaving the app in the mini shell would strand it:
    // the mini window is 400×72 and frameless, and a retry now has no snapshot
    // (or a stale one), so it would render the full UI inside that shell.
    // Land in a usable main window instead, and keep the snapshot for a retry.
    await forceRestoreMainWindow(win, snapshot).catch(() => {});
    setMorphing(false);
  } finally {
    // Only drop the snapshot once the restore actually completed, so a failed
    // exit can still be retried with the real geometry.
    if (restored) saved = null;
    transitioning = false;
  }
}
