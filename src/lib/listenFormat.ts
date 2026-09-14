export function formatListenDuration(
  ms: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  if (totalSec < 60) return t("listening.seconds", { count: totalSec });
  const totalMin = Math.floor(totalSec / 60);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours <= 0) return t("listening.minutes", { count: minutes });
  if (minutes <= 0) return t("listening.hoursOnly", { count: hours });
  return t("listening.hoursMinutes", { hours, minutes });
}
