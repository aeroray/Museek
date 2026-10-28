/**
 * Pure geometry for the mini player window.
 *
 * Kept apart from `miniPlayer.ts` for one reason: that module owns Tauri
 * windows, module-level session state and the player store, so nothing can
 * import it without a DOM and a live IPC bridge. These numbers are what the
 * native window is sized to, and getting one wrong clips content or pushes the
 * bar off a work area — both worth pinning in a plain `node` check.
 *
 * See `scripts/check-mini-queue-geometry.mjs`.
 */

/** Horizontal mini bar — compact width for cover + transport + actions. */
export const MINI_WIDTH = 400;
export const MINI_HEIGHT = 72;
/** Max visible rows in the mini queue panel before scrolling. */
export const MINI_QUEUE_MAX_ROWS = 4;

/**
 * Height of one queue row in CSS pixels.
 *
 * The panel is a fixed-height native window, so this constant *is* the layout
 * contract with `MiniPlayer.tsx`. Measured from the row's own classes:
 *
 *   py-1.5                            6 + 6   = 12
 *   title  `text-xs leading-tight`    12 × 1.25 = 15
 *   singer `text-[10px] leading-tight` 10 × 1.25 = 12.5
 *                                             ------
 *                                             39.5
 *
 * `leading-tight` (line-height: 1.25) overrides the `line-height: 1rem` that
 * `text-xs` would otherwise set, and applies to the 10px sub-line too. The 24px
 * remove button is centred inside the row and does not raise it.
 *
 * It used to be 38, which is 1.5px short per row: a one-song queue overflowed
 * and grew a scrollbar, and the fourth row's singer line was cut off.
 */
export const MINI_QUEUE_ROW = 39.5;
const MINI_QUEUE_GAP = 2;
const MINI_QUEUE_PAD = 12;
/** Empty-queue placeholder height. */
const MINI_QUEUE_EMPTY = 40;

/** Compact queue panel height for `trackCount` songs (capped at 4). */
export function miniQueuePanelHeight(trackCount: number): number {
  if (trackCount <= 0) return MINI_QUEUE_EMPTY;
  const n = Math.min(trackCount, MINI_QUEUE_MAX_ROWS);
  return Math.ceil(
    MINI_QUEUE_PAD + n * MINI_QUEUE_ROW + Math.max(0, n - 1) * MINI_QUEUE_GAP,
  );
}

/** Four-row maximum, for callers that need a static upper bound. */
export const MINI_QUEUE_HEIGHT = miniQueuePanelHeight(MINI_QUEUE_MAX_ROWS);
/** Cover-only peek when docked to a screen edge. */
export const MINI_PEEK_SIZE = 64;

/** A monitor work area, in physical pixels (Tauri's `Monitor.workArea`). */
export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Clamp a window origin so the whole rect stays inside `workArea`, inset by
 * `pad` on every side.
 *
 * The `Math.max(min, max)` guard matters: when the work area is narrower or
 * shorter than `w + 2 * pad` (a small or high-DPI screen, or a tall queue panel)
 * the naive `Math.min(Math.max(v, min), max)` silently picks the *lower* bound
 * and places the window above/left of the work area — off-screen, with a dock
 * hint pointing at nothing. Collapsing both bounds onto `min` keeps the origin
 * on-screen instead, which is at least recoverable by dragging.
 */
export function clampOriginToWorkArea(
  x: number,
  y: number,
  w: number,
  h: number,
  workArea: WorkArea,
  pad: number,
): { x: number; y: number } {
  const minX = workArea.x + pad;
  const minY = workArea.y + pad;
  const maxX = workArea.x + workArea.width - w - pad;
  const maxY = workArea.y + workArea.height - h - pad;
  return {
    x: Math.round(Math.min(Math.max(x, minX), Math.max(minX, maxX))),
    y: Math.round(Math.min(Math.max(y, minY), Math.max(minY, maxY))),
  };
}
