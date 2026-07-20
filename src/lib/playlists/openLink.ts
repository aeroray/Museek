import { httpFetch } from "@/lib/http"
import type { OnlineSource } from "@/types/music"
import { t } from "@/lib/i18n"

// Parse a pasted playlist URL or raw ID into the id form each platform's
// getXxPlaylistDetail expects — mirrors lx-music songList.js getListId.

const LOOKS_LIKE_URL = /[?&:/]/

const PATTERNS: Record<
  OnlineSource,
  { primary: RegExp; secondary?: RegExp; /** How to turn a captured group into store id */ format?: (id: string) => string }
> = {
  // https://y.qq.com/n/yqq/playlist/7217720898.html
  // https://i.y.qq.com/n2/m/share/details/taoge.html?id=7217720898
  tx: {
    primary: /\/playlist\/(\d+)/,
    secondary: /[?&]id=(\d+)/,
  },
  // http://www.kuwo.cn/playlist_detail/2886046289
  // https://m.kuwo.cn/h5app/playlist/2736267853?t=qqfriend
  kw: {
    primary: /\/playlist(?:_detail)?\/(\d+)(?:\?.*|&.*$|#.*$|$)/,
  },
  // https://www.kugou.com/yy/special/single/1067062.html
  kg: {
    primary: /\/(\d+)\.html(?:\?.*|&.*$|#.*$|$)/,
    format: (id) => (id.startsWith("id_") ? id : `id_${id}`),
  },
  // https://music.163.com/#/playlist?id=11332
  // https://music.163.com/playlist/11332/xxxxx
  wy: {
    primary: /[?&]id=(\d+)(?:&.*$|#.*$|$)/,
    secondary: /\/playlist\/(\d+)\/\d+/,
  },
  // https://music.migu.cn/v3/music/playlist/161044573
  mg: {
    primary: /\/playlist\/(\d+)(?:\?.*|&.*$|#.*$|$)/,
  },
}

function isPlainId(s: string, source: OnlineSource): boolean {
  const trimmed = s.trim()
  if (source === "kg" && /^id_\d+$/i.test(trimmed)) return true
  return /^\d+$/.test(trimmed)
}

function normalizePlainId(s: string, source: OnlineSource): string {
  const trimmed = s.trim()
  if (source === "kg") {
    return trimmed.startsWith("id_") ? trimmed : `id_${trimmed}`
  }
  return trimmed
}

/** Follow one redirect hop when the paste is a short/share link. */
async function resolveRedirect(link: string, tryNum = 0): Promise<string> {
  if (tryNum > 2) return link
  try {
    const res = await httpFetch(link, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })
    const loc = res.headers.get("location") ?? res.headers.get("Location")
    if (loc) {
      try {
        return new URL(loc, link).href
      } catch {
        return loc
      }
    }
    // Plugin may have followed redirects — prefer final URL when present.
    const finalUrl = (res as Response & { url?: string }).url
    if (typeof finalUrl === "string" && finalUrl && finalUrl !== link) return finalUrl
  } catch {
    /* keep original */
  }
  return link
}

function matchId(input: string, source: OnlineSource): string | null {
  const { primary, secondary, format } = PATTERNS[source]
  let m = primary.exec(input)
  if (!m && secondary) m = secondary.exec(input)
  if (!m?.[1]) return null
  return format ? format(m[1]) : m[1]
}

/**
 * Resolve a pasted playlist link or raw ID for `source`.
 * Throws with a localized message when the input cannot be parsed.
 */
export async function parsePlaylistLink(source: OnlineSource, raw: string): Promise<string> {
  let input = raw.trim()
  if (!input) throw new Error(t("playlists.openEmpty"))

  // Strip accidental wrapping quotes / whitespace from share sheets.
  input = input.replace(/^['"]+|['"]+$/g, "").trim()

  if (isPlainId(input, source)) {
    return normalizePlainId(input, source)
  }

  if (!LOOKS_LIKE_URL.test(input)) {
    throw new Error(t("playlists.openInvalid"))
  }

  let id = matchId(input, source)
  if (!id) {
    // Short links / share pages often need one redirect before the id appears.
    const resolved = await resolveRedirect(input)
    id = matchId(resolved, source)
  }

  if (!id) throw new Error(t("playlists.openInvalid"))
  return id
}
