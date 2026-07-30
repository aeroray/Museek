/** Normalize various platform publish fields into YYYY-MM-DD (or YYYY). */
export function formatAlbumDate(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined
  if (typeof raw === "number") {
    // NetEase uses ms; reject epoch-ish placeholders.
    if (raw < 1e11) return undefined
    const d = new Date(raw)
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 1970) return undefined
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${d.getFullYear()}-${m}-${day}`
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
