/**
 * How Last.fm payloads are read.
 *
 * Every scalar arrives as a string, lists arrive wrapped in an object keyed by
 * the singular name, and "no value" is expressed three different ways (absent,
 * `""`, or a nested `{"#text": ""}`). These helpers are the single place that
 * knows all of that, so a new endpoint cannot invent its own reading of it.
 *
 * Pure and free of store/network imports, so the shaping can be checked
 * directly.
 */

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Last.fm returns every scalar as a string, so numbers are parsed explicitly. */
export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Optional string: keeps `undefined` distinct from `""` for `image`. */
export function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/**
 * Pick the best image Last.fm offers.
 *
 * The docs only guarantee `small`/`medium`/`large`; `extralarge` and `mega`
 * appear in real responses but are undocumented, so they are preferred when
 * present and simply skipped when not. An empty `#text` is Last.fm's way of
 * saying "no image", which must not be treated as a URL.
 */
export function pickImage(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  const bySize = new Map<string, string>();
  for (const entry of images) {
    const r = asRecord(entry);
    const size = str(r.size);
    const text = str(r["#text"]).trim();
    if (size && text) bySize.set(size, text);
  }
  for (const size of ["mega", "extralarge", "large", "medium", "small"]) {
    const hit = bySize.get(size);
    if (hit) return hit;
  }
  return undefined;
}
