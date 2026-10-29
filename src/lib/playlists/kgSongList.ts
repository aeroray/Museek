/**
 * Response-shape rules for KuGou's `special/song_v2`.
 *
 * Extracted from `playlists/kg.ts` so the distinction that broke external
 * playlists can be pinned without the network: that module imports the Tauri
 * fetch and five platform adapters.
 *
 * ## The bug
 *
 * Shared KuGou collections (`collection_<uid>_<listid>_<type>` — what share links
 * and 外部歌单 resolve to) are read through `mobiles.kugou.com/api/v5/special/song_v2`.
 * With `appid=1058` that endpoint answers, for every request and regardless of
 * how long you wait:
 *
 *   {"errcode":20028,"status":0,"error":"您操作太频繁了，请稍后再试"}
 *
 * The old code did `json.data?.info ?? []`, so a rate-limit rejection became an
 * empty song list. The collection's name and cover still loaded (they come from a
 * different endpoint), so the UI showed a real playlist title above "暂无数据" —
 * which is exactly what users reported. `appid=1005` returns the same payload
 * with the full track list and pages correctly.
 *
 * The durable rule is not "use 1005": it is that an error envelope must never be
 * read as an empty result, because "this list has no songs" and "the request was
 * rejected" need different handling and look identical to the user.
 */

export interface KgSongPageEnvelope {
  errcode?: number
  status?: number
  error?: string
  data?: { total?: number; info?: unknown[] }
}

/** True when the envelope carries an error rather than a result. */
export function isKgErrorEnvelope(json: KgSongPageEnvelope | null | undefined): boolean {
  if (!json) return true
  if (json.errcode != null && json.errcode !== 0) return true
  // `status` is 1 for success and 0 for failure on these endpoints; an absent
  // status is tolerated because not every KuGou endpoint sends one.
  if (json.status != null && json.status !== 1 && json.status !== 0) return true
  if (json.status === 0 && (json.error ?? "").trim().length > 0) return true
  return false
}

/**
 * Songs in one page, or `null` when the envelope is an error.
 *
 * `null` and `[]` are deliberately different: `[]` means the page is genuinely
 * past the end, `null` means the request failed and the caller should surface it
 * rather than render an empty list.
 */
export function kgSongPageItems(
  json: KgSongPageEnvelope | null | undefined,
): unknown[] | null {
  if (isKgErrorEnvelope(json)) return null
  return json?.data?.info ?? []
}

/** Total track count reported by a page, when present and sane. */
export function kgSongPageTotal(
  json: KgSongPageEnvelope | null | undefined,
): number | null {
  const total = json?.data?.total
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) return null
  return total
}

/**
 * Page numbers still to fetch, given what the first page reported.
 *
 * Returns `[]` for a single-page collection. `pagesize` is the endpoint's
 * accepted page size (300); `knownCount` is a fallback total for envelopes that
 * omit one.
 */
export function kgSongPageNumbers(
  total: number | null,
  knownCount: number,
  itemsOnFirstPage: number,
  pagesize: number,
): number[] {
  if (pagesize <= 0) return []
  const effective = Math.max(total ?? knownCount ?? 0, itemsOnFirstPage)
  if (itemsOnFirstPage === 0 || effective <= pagesize) return []
  const pageCount = Math.ceil(effective / pagesize)
  const pages: number[] = []
  for (let page = 2; page <= pageCount; page++) pages.push(page)
  return pages
}

/**
 * `appid` for `special/song_v2`.
 *
 * 1058 is rejected with 20028 (see the module comment); 1005 is accepted and is
 * the same appid the rest of the KuGou code already uses for search, comments
 * and album requests.
 */
export const KG_SONG_LIST_APPID = "1005"
/** Page size the endpoint accepts; larger values are ignored or rejected. */
export const KG_SONG_LIST_PAGE_SIZE = 300
