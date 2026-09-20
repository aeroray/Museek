type Translate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatListenDuration(ms: number, t: Translate): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  if (totalSec < 60) return t("listening.seconds", { count: totalSec });
  const totalMin = Math.floor(totalSec / 60);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours <= 0) return t("listening.minutes", { count: minutes });
  if (minutes <= 0) return t("listening.hoursOnly", { count: hours });
  return t("listening.hoursMinutes", { hours, minutes });
}

/** Whole calendar days between two instants, ignoring the time of day. */
function calendarDaysAgo(startedAt: number, now: number): number {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - start.getTime()) / 86_400_000);
}

/**
 * "Recently played" timestamp, in the order a person actually thinks about it:
 * relative while it is still fresh, then named days, then a date.
 *
 *   刚刚 → N 分钟前 → N 小时前 → 昨天 21:30 → 前天 21:30 → 3/5 21:30
 *
 * The relative branches are gated on the *calendar*, not just the elapsed time:
 * a song played at 23:00 and read at 02:00 is "昨天 23:00", not "3 小时前",
 * because the day changed and the day label is the more useful anchor. Minutes
 * still win over the day boundary, so 23:50 read at 00:10 stays "20 分钟前".
 *
 * A clock time is kept alongside the day labels: on a listening-history screen
 * "昨天" alone does not tell you whether it was the morning or late at night.
 */
export function formatRelativePlayed(
  startedAt: number,
  now: number,
  t: Translate,
): string {
  const delta = Math.max(0, now - startedAt);
  if (delta < 60_000) return t("listening.justNow");
  if (delta < 3_600_000) {
    return t("listening.minutesAgo", { count: Math.floor(delta / 60_000) });
  }

  const date = new Date(startedAt);
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const daysAgo = calendarDaysAgo(startedAt, now);

  // Same calendar day: stay relative, and drop the redundant date entirely.
  if (daysAgo <= 0) {
    return t("listening.hoursAgo", { count: Math.floor(delta / 3_600_000) });
  }
  if (daysAgo === 1) return t("listening.yesterdayAt", { time });
  if (daysAgo === 2) return t("listening.dayBeforeYesterdayAt", { time });

  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const day = `${date.getMonth() + 1}/${date.getDate()}`;
  // A previous year keeps the year and drops the clock: "2025/12/31" already
  // identifies the day, and the exact minute of a play from last year is not
  // worth the column width it costs. This keeps the whole ladder inside one
  // narrow, fixed-width column (see TrackRow's stat slot).
  if (!sameYear) {
    return t("listening.dateOnly", { date: `${date.getFullYear()}/${day}` });
  }
  return t("listening.dateAt", { date: day, time });
}
