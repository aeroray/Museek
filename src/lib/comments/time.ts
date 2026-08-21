import { t } from "@/lib/i18n";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Relative clock for comment timestamps. `time` is unix ms. */
export function formatCommentTime(time: number | null | undefined): string {
  if (time == null || !Number.isFinite(time) || time <= 0) return "";
  const ms = time < 1e12 ? time * 1000 : time;
  const delta = Date.now() - ms;
  if (delta < MINUTE) return t("comments.justNow");
  if (delta < HOUR) {
    return t("comments.minutesAgo", { n: Math.max(1, Math.floor(delta / MINUTE)) });
  }
  if (delta < DAY) {
    return t("comments.hoursAgo", { n: Math.max(1, Math.floor(delta / HOUR)) });
  }
  if (delta < 30 * DAY) {
    return t("comments.daysAgo", { n: Math.max(1, Math.floor(delta / DAY)) });
  }
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function asTimeMs(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}
