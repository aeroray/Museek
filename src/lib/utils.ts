import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a duration in seconds as `m:ss`.
 *
 * Non-finite input yields `"0:00"` rather than the literal string `"NaN:NaN"`.
 * That string reached the UI because some platforms return a `"mm:ss"` string
 * and the call site did `formatDuration(Number(raw.duration))`; `Number("3:45")`
 * is NaN. Returning a neutral value keeps a missing/odd duration from looking
 * like corruption on screen.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * Parse a platform duration that may be plain seconds, a `"mm:ss"` string, or a
 * millisecond number, returning whole seconds (0 when unusable).
 */
export function parseDurationSeconds(raw: unknown): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return 0
    // Heuristic: anything this large is milliseconds, not seconds (14 digit ms
    // values exceed any real track length when read as seconds).
    return Math.round(raw > 100_000 ? raw / 1000 : raw)
  }
  if (typeof raw !== "string") return 0
  const text = raw.trim()
  if (!text) return 0
  const clock = /^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/.exec(text)
  if (clock) {
    const a = Number(clock[1])
    const b = Number(clock[2])
    const c = clock[3] != null ? Number(clock[3]) : null
    return c != null ? a * 3600 + b * 60 + c : a * 60 + b
  }
  const n = Number(text)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

/**
 * Coerce an id field from an untrusted platform response to a string, treating
 * "the field was not there" as empty.
 *
 * `String(undefined)` is the *truthy* string `"undefined"`, so a bare
 * `String(raw.someId)` slipped past every `if (!songId) continue` guard and
 * produced track ids like `kg_undefined`. Those rows then deduped into a single
 * card, so the visible symptom was "a search result that vanishes".
 *
 * Platform APIs change shape without notice and routinely omit fields, so this
 * has to be explicit rather than relying on the declared types. Use it for every
 * id read out of a remote payload.
 */
export function remoteId(value: unknown): string {
  if (value == null) return ""
  const text = typeof value === "string" ? value : String(value)
  return text === "undefined" || text === "null" ? "" : text
}
