import { httpFetch as tauriFetch } from "@/lib/http"
import * as pako from "pako"
import type { LyricInfo, MusicInfo } from "@/types/music"
import { getTxLyric, getWyLyric, getKgLyric, getMgLyric } from "@/lib/lyric/extra"

// Built-in lyric fetching, fetched directly from each platform's public API
// (like built-in search) rather than relying on source scripts — most lx-music
// source scripts only implement `musicUrl` and reply "lyric not support".

function fmtLrcTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(2).padStart(5, "0")
  return `${String(m).padStart(2, "0")}:${s}`
}

interface KwLrcResponse {
  status?: number
  data?: {
    lrclist?: { time: string; lineLyric: string }[]
  }
}

// --- kw mobile H5 endpoint -----------------------------------------------
// Returns a plain {time(seconds), lineLyric} list. Fast but unreliable — it
// intermittently rate-limits with `{status:301}` and no lyric, so it's only the
// first try; getKwLyricEncrypted below is the fallback.
async function getKwLyricH5(songId: string): Promise<LyricInfo | null> {
  const res = await tauriFetch(`http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${songId}`, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  })
  if (!res.ok) return null
  const data = (await res.json()) as KwLrcResponse
  const list = data.data?.lrclist
  if (!list?.length) return null
  const lyric = list
    .map((l) => `[${fmtLrcTime(parseFloat(l.time))}]${l.lineLyric ?? ""}`)
    .join("\n")
  if (!lyric.trim()) return null
  return { lyric }
}

// --- kw official encrypted endpoint --------------------------------------
// Ported from lx-music-desktop kw/lyric.js (active getLyric) + kw/util.js
// (decodeLyric) + main/.../kw_decodeLyric.ts. The request params are XOR-ed
// byte-by-byte with the 7-byte key "yeelion" then base64-encoded; the response
// is a binary blob: `tp=content...\r\n\r\n<zlib-deflated body>`. We inflate the
// body and (for the non-lyricx form) gb18030-decode it directly into plain LRC.

const KW_KEY = new TextEncoder().encode("yeelion") // 7 bytes

// XOR `params` with the rolling "yeelion" key, base64-encode (buildParams).
function kwBuildParams(id: string): string {
  // isGetLyricx omitted (=> plain LRC form; see kwDecodeLyric).
  const params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${id}`
  const src = new TextEncoder().encode(params)
  const out = new Uint8Array(src.length)
  let i = 0
  while (i < src.length) {
    let j = 0
    while (j < KW_KEY.length && i < src.length) {
      out[i] = KW_KEY[j] ^ src[i]
      i++
      j++
    }
  }
  // base64-encode raw bytes
  let binary = ""
  for (let k = 0; k < out.length; k++) binary += String.fromCharCode(out[k])
  return btoa(binary)
}

// Decode the raw response bytes -> plain LRC text. Mirrors kw_decodeLyric.ts
// with isGetLyricx=false: require the `tp=content` marker, drop the header up to
// the blank line, zlib-inflate, then gb18030-decode. Returns "" on any mismatch.
function kwDecodeLyric(buf: Uint8Array): string {
  if (buf.length < 10) return ""
  // First 10 bytes must be the ASCII marker "tp=content".
  const head = new TextDecoder("utf-8").decode(buf.subarray(0, 10))
  if (head !== "tp=content") return ""
  // Find the "\r\n\r\n" separator and inflate everything after it.
  const sep = [0x0d, 0x0a, 0x0d, 0x0a]
  let idx = -1
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] === sep[0] && buf[i + 1] === sep[1] && buf[i + 2] === sep[2] && buf[i + 3] === sep[3]) {
      idx = i
      break
    }
  }
  if (idx < 0) return ""
  const body = buf.subarray(idx + 4)
  let inflated: Uint8Array
  try {
    inflated = pako.inflate(body)
  } catch {
    return ""
  }
  // gb18030 -> text (Chromium/WebView2 supports it). Fall back to gbk, then
  // utf-8, so a missing-encoding environment still yields something.
  for (const enc of ["gb18030", "gbk", "utf-8"]) {
    try {
      return new TextDecoder(enc).decode(inflated)
    } catch {
      // try next encoding
    }
  }
  return ""
}

// Split parsed LRC lines into lyric + translation. Mirrors kw/lyric.js
// sortLrcArr: lines that repeat an already-seen timestamp are treated as the
// translation of the previous line. Throws on a failed heuristic (mirrors ref).
function kwSortLrc(arr: { time: string; text: string }[]): {
  lrc: { time: string; text: string }[]
  lrcT: { time: string; text: string }[]
} {
  const seen = new Set<string>()
  const lrc: { time: string; text: string }[] = []
  const lrcT: { time: string; text: string }[] = []
  let isLyricx = false
  const lyricxTag = /^<-?\d+,-?\d+>/
  for (const item of arr) {
    if (seen.has(item.time)) {
      if (lrc.length < 2) continue
      const t = lrc.pop()!
      t.time = lrc[lrc.length - 1].time
      lrcT.push(t)
      lrc.push(item)
    } else {
      lrc.push(item)
      seen.add(item.time)
    }
    if (!isLyricx && lyricxTag.test(item.text)) isLyricx = true
  }
  if (!isLyricx && lrcT.length > lrc.length * 0.3 && lrc.length - lrcT.length > 6) {
    throw new Error("failed")
  }
  return { lrc, lrcT }
}

const KW_TIME_EXP = /^\[([\d:.]*)\]/
const KW_EXIST_TIME_EXP = /\[\d{1,2}:.*\d{1,4}\]/
const KW_WORD_TIME_ALL = /<(-?\d+),(-?\d+)(?:,-?\d+)?>/g

// Parse plain LRC text into { lyric, tlyric }. Mirrors kw/lyric.js parseLrc +
// transformLrc, but emits only timestamped lines (no [ti:]/[ar:] tags needed).
function kwParseLrc(text: string): LyricInfo | null {
  const lines = text.split(/\r\n|\r|\n/)
  const lrcArr: { time: string; text: string }[] = []
  for (const raw of lines) {
    const line = raw.trim()
    const m = KW_TIME_EXP.exec(line)
    if (!m) continue
    let time = m[1]
    if (/\.\d\d$/.test(time)) time += "0"
    const body = line.replace(KW_TIME_EXP, "").trim()
    lrcArr.push({ time, text: body })
  }
  if (!lrcArr.length) return null

  let parts: ReturnType<typeof kwSortLrc>
  try {
    parts = kwSortLrc(lrcArr)
  } catch {
    return null
  }

  const toText = (list: { time: string; text: string }[]): string =>
    list.map((l) => `[${l.time}]${l.text}`).join("\n")

  let lyric = toText(parts.lrc).replace(KW_WORD_TIME_ALL, "")
  if (!KW_EXIST_TIME_EXP.test(lyric)) return null
  let tlyric = parts.lrcT.length ? toText(parts.lrcT).replace(KW_WORD_TIME_ALL, "") : ""
  lyric = lyric.trim()
  tlyric = tlyric.trim()
  return { lyric, tlyric: tlyric || null }
}

async function getKwLyricEncrypted(songId: string): Promise<LyricInfo | null> {
  const res = await tauriFetch(`http://newlyric.kuwo.cn/newlyric.lrc?${kwBuildParams(songId)}`, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
    },
  })
  if (!res.ok) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  const text = kwDecodeLyric(buf)
  if (!text) return null
  return kwParseLrc(text)
}

// KuWo lyric: try the fast (but rate-limited) H5 endpoint first, then fall back
// to the official encrypted endpoint lx-music uses. song.meta.songId is the id.
async function getKwLyric(songId: string): Promise<LyricInfo | null> {
  if (!songId) return null
  try {
    const h5 = await getKwLyricH5(songId)
    if (h5) return h5
  } catch {
    // ignore -> fall through to encrypted endpoint
  }
  try {
    return await getKwLyricEncrypted(songId)
  } catch {
    return null
  }
}

/**
 * Fetch lyrics for a song directly from its platform. Returns null when the
 * platform isn't supported yet or has no lyrics — callers can then fall back
 * to a source script.
 */
export async function getBuiltinLyric(song: MusicInfo): Promise<LyricInfo | null> {
  try {
    switch (song.source) {
      case "kw":
        return await getKwLyric(song.meta.songId)
      case "tx":
        return await getTxLyric(song)
      case "wy":
        return await getWyLyric(song)
      case "kg":
        return await getKgLyric(song)
      case "mg":
        return await getMgLyric(song)
      default:
        return null
    }
  } catch {
    return null
  }
}
