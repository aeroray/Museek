import type { SourceScript } from "@/types/source"

/**
 * A portable bundle of source scripts.
 *
 * The bundle is a `.js` file on purpose. Source import only accepts `.js`
 * (the picker filter, the drag-drop path filter and the HTML5 drop filter all
 * agree on that), so a bundle that is not `.js` could not travel through the
 * normal import channel at all. Making it real JavaScript rather than JSON
 * renamed to `.js` also keeps the file honestly openable.
 *
 * The payload is assigned to a global instead of embedded in a comment: source
 * scripts carry their own block-comment header, so any comment-delimited JSON
 * would be truncated by the first closing delimiter inside a bundled script.
 */
const BUNDLE_GLOBAL = "__MUSEEK_SOURCES_BUNDLE__"
const BUNDLE_MARKER = `globalThis.${BUNDLE_GLOBAL} = `
const BUNDLE_FORMAT = "museek-sources"
const BUNDLE_VERSION = 1

export type BundledSource = {
  name: string
  version: string
  author: string
  description: string
  rawScript: string
  enabled: boolean
  /** Original import origin, kept so a re-import on the same machine dedupes. */
  url?: string
  /** Declared platforms, so a disabled entry still renders without loading it. */
  sources?: SourceScript["sources"]
}

export type SourceBundle = {
  format: typeof BUNDLE_FORMAT
  version: number
  exportedAt: string
  count: number
  sources: BundledSource[]
}

/**
 * Serialise the current sources into a bundle script.
 *
 * Order is preserved — it is the dispatch priority, so a restored bundle must
 * come back in the same order. Probe results are deliberately not included:
 * they are device-local observations that go stale, and the user re-tests.
 */
export function buildSourceBundle(
  scripts: SourceScript[],
  exportedAt = new Date().toISOString(),
): string {
  const bundle: SourceBundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt,
    count: scripts.length,
    sources: scripts.map((s) => ({
      name: s.name,
      version: s.version,
      author: s.author,
      description: s.description,
      rawScript: s.rawScript,
      enabled: s.enabled,
      ...(s.url ? { url: s.url } : {}),
      ...(s.sources ? { sources: s.sources } : {}),
    })),
  }

  const header = [
    "/*!",
    " * @name Museek 音源包 · Source bundle",
    ` * @version ${BUNDLE_VERSION}`,
    ` * @description ${bundle.count} 个音源 / source scripts — 在「设置 → 音源管理」中导入`,
    ` * @exportedAt ${exportedAt}`,
    " */",
    "// Written by Museek. Import it from Settings -> Sources; it is recognised",
    "// automatically and each bundled script is restored individually.",
  ].join("\n")

  // JSON.stringify emits a valid JS expression literal; U+2028/2029 are legal
  // inside string literals since ES2019, so no extra escaping is needed.
  return `${header}\n${BUNDLE_MARKER}${JSON.stringify(bundle)};\n`
}

/** Marker check without parsing, for fast rejection on the import path. */
export function looksLikeSourceBundle(text: string): boolean {
  return typeof text === "string" && text.includes(BUNDLE_MARKER + "{")
}

/**
 * Parse a bundle script. Returns `null` when the text is not a bundle at all
 * (so the caller falls through to normal single-script import), and throws a
 * descriptive error when it clearly IS a bundle but is unusable.
 */
export function parseSourceBundle(text: string): BundledSource[] | null {
  if (!looksLikeSourceBundle(text)) return null

  const start = text.indexOf(BUNDLE_MARKER + "{")
  if (start < 0) return null
  const jsonStart = start + BUNDLE_MARKER.length

  const json = sliceBalancedJson(text, jsonStart)
  if (!json) throw new Error("bundle payload is not valid JSON")

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("bundle payload is not valid JSON")
  }

  const bundle = parsed as Partial<SourceBundle>
  if (bundle?.format !== BUNDLE_FORMAT) {
    throw new Error("unrecognised bundle format")
  }
  if (!Array.isArray(bundle.sources)) {
    throw new Error("bundle has no sources")
  }

  const out: BundledSource[] = []
  for (const raw of bundle.sources) {
    if (!raw || typeof raw !== "object") continue
    const s = raw as Partial<BundledSource>
    // A bundled script needs its text; metadata can be re-derived from it.
    if (typeof s.rawScript !== "string" || !s.rawScript.trim()) continue
    out.push({
      name: typeof s.name === "string" ? s.name : "",
      version: typeof s.version === "string" ? s.version : "",
      author: typeof s.author === "string" ? s.author : "",
      description: typeof s.description === "string" ? s.description : "",
      rawScript: s.rawScript,
      enabled: s.enabled !== false,
      ...(typeof s.url === "string" && s.url ? { url: s.url } : {}),
      ...(s.sources && typeof s.sources === "object"
        ? { sources: s.sources as SourceScript["sources"] }
        : {}),
    })
  }

  if (!out.length) throw new Error("bundle contains no usable source")
  return out
}

/**
 * Return the balanced `{...}` starting at `from`, ignoring braces inside
 * strings. A plain `indexOf("}")` would stop at the first brace in a script.
 */
function sliceBalancedJson(text: string, from: number): string | null {
  if (text[from] !== "{") return null
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = from; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return text.slice(from, i + 1)
    }
  }
  return null
}

/** Suggested file name for an export. */
export function bundleFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("")
  return `museek-sources-${stamp}.js`
}
