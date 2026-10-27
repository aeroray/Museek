/**
 * Windowing maths for `VirtualList`, kept pure and React-free so a plain node
 * check can exercise the code that actually ships.
 *
 * This exists because the previous regression check re-implemented this
 * arithmetic inside the test instead of importing it. The result was a check
 * that stayed green when the real window computation was replaced with
 * `start = 0` — which is precisely the reported "large blank areas while
 * scrolling" bug. A test that cannot fail is worse than no test, because it
 * reads as protection.
 *
 * Anything here must stay importable without a DOM.
 */

export interface VirtualWindow {
  /** Height of the full list, in pixels. */
  total: number
  /** Index of the first rendered item. */
  start: number
  /** Index one past the last rendered item. */
  end: number
  /** translateY offset for the rendered slice, in pixels. */
  offset: number
}

/**
 * The slice of `itemCount` rows that covers the viewport at `scrollTop`.
 *
 * `viewH` of 0 means "not measured yet" (first paint); a nominal height is
 * assumed so the first render paints something instead of waiting a frame.
 */
export function virtualWindow(
  scrollTop: number,
  viewH: number,
  itemCount: number,
  rowHeight: number,
  overscan: number,
): VirtualWindow {
  const total = itemCount * rowHeight
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visible = Math.ceil((viewH || 600) / rowHeight) + overscan * 2
  const end = Math.min(itemCount, start + visible)
  return { total, start, end, offset: start * rowHeight }
}
