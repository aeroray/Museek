/**
 * Hotlink-sensitive CDNs reject (or return HTML 403 pages for) requests that
 * carry the wrong Referer. WebView `audio.src = url` sends the app origin unless
 * the document uses referrerpolicy=no-referrer (see index.html).
 */

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ""
  }
}

export function isNetEaseCdnUrl(url: string): boolean {
  const host = hostOf(url)
  return (
    host.includes("126.net") ||
    host.includes("163.com") ||
    host.includes("netease") ||
    host.includes("lazyaudio")
  )
}

/** Default headers when probing / downloading a play URL. */
export function cdnHeadersForUrl(url: string): Record<string, string> {
  const host = hostOf(url)
  if (!host) return {}

  if (isNetEaseCdnUrl(url)) {
    // Prefer Referer without Origin — Origin alone has caused CDNs to return HTML.
    return {
      Referer: "https://music.163.com/",
      "User-Agent": CHROME_UA,
    }
  }

  if (host.includes("qq.com") || host.includes("gtimg.cn") || host.includes("tencentmusic")) {
    return { Referer: "https://y.qq.com/", "User-Agent": CHROME_UA }
  }

  if (host.includes("kuwo") || host.includes("koowo")) {
    return { Referer: "https://www.kuwo.cn/", "User-Agent": CHROME_UA }
  }

  if (host.includes("kugou") || host.includes("kgimg")) {
    return { Referer: "https://www.kugou.com/", "User-Agent": CHROME_UA }
  }

  if (host.includes("migu") || host.includes("nf.migu")) {
    return { Referer: "https://music.migu.cn/", "User-Agent": CHROME_UA }
  }

  return { "User-Agent": CHROME_UA }
}

/**
 * Header strategies to try when downloading NetEase (and similar) audio.
 * Empty-Referer often works (same idea as meta referrer=no-referrer);
 * X-Real-IP helps some overseas exits that get geo HTML pages.
 */
export function cdnFetchStrategies(url: string): Record<string, string>[] {
  if (!isNetEaseCdnUrl(url)) {
    return [cdnHeadersForUrl(url)]
  }
  return [
    {
      Referer: "https://music.163.com/",
      "User-Agent": CHROME_UA,
    },
    {
      "User-Agent": CHROME_UA,
    },
    {
      Referer: "https://music.163.com/",
      "User-Agent": CHROME_UA,
      "X-Real-IP": "211.161.244.70",
      "X-Forwarded-For": "211.161.244.70",
    },
  ]
}
