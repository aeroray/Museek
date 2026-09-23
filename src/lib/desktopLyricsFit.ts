/**
 * Fit-to-width scaling for the desktop lyrics capsule.
 *
 * ## Why this exists
 *
 * The desktop lyrics window is sized to the monitor's *physical* width, so the
 * CSS viewport the webview receives is `monitorPhysicalWidth / scaleFactor`
 * logical pixels. Lyric text is laid out in logical pixels at a size that does
 * not change with display scaling, so raising the OS scale factor makes the text
 * occupy a larger fraction of the screen — the same line that fits at 100% can
 * overflow at 150%.
 *
 * The capsule is centred, and a centred flex item wider than its container
 * overflows *both* edges equally. A native window hard-clips its content, so a
 * line that does not fit loses its rounded left and right ends and reads as a
 * plain rectangle.
 *
 * Shrinking the lyric until it fits keeps the single-line presentation, shows
 * the complete line, and preserves the capsule shape.
 *
 * ## Why a closed form
 *
 * Capsule width is linear in the applied scale: font size, padding and
 * letter-spacing are all em-relative, so both the text and the padding scale by
 * the same factor. Dividing the measurement by the scale that produced it
 * therefore recovers the natural width exactly, and the largest scale that fits
 * follows in one step. A closed form cannot oscillate the way an iterative
 * "measure, adjust, re-measure" loop can.
 */

/**
 * Smallest scale the lyric may shrink to, so a pathological line stays legible.
 *
 * This is a backstop against absurd input, not a normal operating point: at 0.4
 * the default 1.15 font scale renders at 28 * 1.15 * 0.4 ≈ 13 logical px, which
 * is still readable. It is deliberately low enough that any realistic line
 * (well under 100 CJK characters) fits on the narrowest monitor. A higher floor
 * such as 0.55 was measured to still clip a 90-character line at a 1024px
 * viewport, which is the very bug this module exists to remove.
 */
export const FIT_MIN_SCALE = 0.4;

/** Space kept between the capsule and the window edges, in logical pixels. */
export const FIT_GUTTER = 20;

/** Fit changes smaller than this are ignored, so rounding cannot cause a loop. */
export const FIT_EPSILON = 0.005;

export interface LyricFitInput {
  /**
   * Natural (single-line) width of the lyric content in CSS pixels, measured
   * with `appliedFit` already in effect.
   */
  contentWidth: number;
  /** Horizontal capsule padding on one side, with `appliedFit` in effect. */
  padding: number;
  /** The fit scale that produced the measurements. `1` when unfitted. */
  appliedFit: number;
  /** Native lyrics window width in CSS pixels. */
  viewportWidth: number;
  gutter?: number;
  min?: number;
}

/**
 * Returns the scale to apply to the lyric's font size and padding so the capsule
 * fits inside the window. `1` means "already fits, do not shrink".
 */
export function computeLyricFitScale({
  contentWidth,
  padding,
  appliedFit,
  viewportWidth,
  gutter = FIT_GUTTER,
  min = FIT_MIN_SCALE,
}: LyricFitInput): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 1;
  if (!Number.isFinite(appliedFit) || appliedFit <= 0) return 1;
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return 1;
  if (!Number.isFinite(padding) || padding < 0) return 1;

  const available = viewportWidth - gutter * 2;
  if (available <= 0) return min;

  // Undo the applied fit to get the capsule width the lyric would have at 1.
  const naturalWidth = (contentWidth + padding * 2) / appliedFit;
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) return 1;
  if (naturalWidth <= available) return 1;

  return Math.max(min, Math.min(1, available / naturalWidth));
}

/** True when `next` differs from `current` enough to be worth re-rendering. */
export function fitChanged(current: number, next: number): boolean {
  return Math.abs(current - next) > FIT_EPSILON;
}
