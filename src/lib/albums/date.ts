/**
 * Normalize various platform publish fields into YYYY-MM-DD (or YYYY).
 *
 * Epoch-millisecond values are rendered in a FIXED offset (UTC+8, where all five
 * supported platforms publish), not the host's local zone. NetEase returns a bare
 * ms timestamp whose intended calendar date is China local time; reading it with
 * `getFullYear`/`getMonth`/`getDate` shifts the date by one day for any user west
 * of UTC+8 (most of Europe and the Americas), and makes Windows and macOS
 * disagree for users whose OS timezone differs from their app locale.
 *
 * `getUTC*` after adding the offset gives the calendar date the platform meant,
 * on every host.
 */
const PUBLISH_TZ_OFFSET_MIN = 8 * 60

export function formatAlbumDate(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined
  if (typeof raw === "number") {
    // NetEase uses ms; reject epoch-ish placeholders.
    if (raw < 1e11) return undefined
    const shifted = raw + PUBLISH_TZ_OFFSET_MIN * 60_000
    const d = new Date(shifted)
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1970) return undefined
    const m = String(d.getUTCMonth() + 1).padStart(2, "0")
    const day = String(d.getUTCDate()).padStart(2, "0")
    return `${d.getUTCFullYear()}-${m}-${day}`
  }
  const s = String(raw).trim()
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  if (/^\d{4}$/.test(s)) return s
  return undefined
}

export function parseSongCount(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}
