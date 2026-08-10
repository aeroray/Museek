export const LYRIC_FONT_SCALE_KEY = "museek.lyricFontScale";

export interface FontScalePolicy {
  min: number;
  max: number;
  defaultValue: number;
}

export function clampLyricFontScale(
  value: number,
  policy: FontScalePolicy,
): number {
  return Math.min(policy.max, Math.max(policy.min, value));
}

export function readLyricFontScale(policy: FontScalePolicy): number {
  const raw =
    typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(LYRIC_FONT_SCALE_KEY);
  const value = raw === null ? Number.NaN : parseFloat(raw);
  return Number.isFinite(value)
    ? clampLyricFontScale(value, policy)
    : policy.defaultValue;
}

export function writeLyricFontScale(value: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LYRIC_FONT_SCALE_KEY, String(value));
}
