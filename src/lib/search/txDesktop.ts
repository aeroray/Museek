import { httpFetch as tauriFetch } from "@/lib/http"

// Shared QQ Music Desktop search (signed musics.fcg).
// search_type: 0 song · 3 playlist — mirrors lx-music after Mobile wind-control fixes.

const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19]
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
const SCRAMBLE_VALUES = [
  89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179,
]

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function hashSHA1(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest("SHA-1", data)
  return bytesToHex(digest)
}

function pickHashByIdx(hash: string, indexes: number[]): string {
  return indexes.map((idx) => hash[idx]).join("")
}

function base64Encode(bytes: number[]): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b & 0xff)
  return btoa(binary).replace(/[/+=]/g, "")
}

async function zzcSign(text: string): Promise<string> {
  const hash = await hashSHA1(text)
  const part1 = pickHashByIdx(hash, PART_1_INDEXES)
  const part2 = pickHashByIdx(hash, PART_2_INDEXES)
  const part3 = SCRAMBLE_VALUES.map((value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16))
  const b64Part = base64Encode(part3)
  return `zzc${part1}${b64Part}${part2}`.toLowerCase()
}

/** PC-client-shaped searchid: 32 hex chars + 5 zero-padded digits. */
function getSearchId(): string {
  let guid = ""
  for (let i = 0; i < 32; i++) guid += Math.floor(Math.random() * 16).toString(16)
  return guid.toUpperCase() + String(Math.floor(Math.random() * 100000)).padStart(5, "0")
}

export interface QqSearchData {
  body?: Record<string, unknown>
  meta?: { sum?: number; estimate_sum?: number; query?: string }
}

interface QqSearchEnvelope {
  code?: number
  req?: { code?: number; data?: QqSearchData }
  "music.search.SearchCgiService"?: { code?: number; data?: QqSearchData }
}

const MAX_RETRIES = 5

/**
 * Signed Desktop search. Retries on wind-control / bad envelopes (lx-music pattern).
 * @param searchType 0 = songs, 3 = playlists
 */
export async function qqDesktopSearch(
  query: string,
  page: number,
  limit: number,
  searchType: 0 | 3,
  retryNum = 0
): Promise<QqSearchData> {
  if (retryNum > MAX_RETRIES) throw new Error("QQ search failed")

  const reqBody = {
    comm: {
      _channelid: "0",
      _os_version: "6.2.9200-2",
      ct: "19",
      cv: "2151",
      guid: "1F70E520B2EAA7D25E11760783C53CA9",
      patch: "118",
      psrf_access_token_expiresAt: 0,
      psrf_qqaccess_token: "",
      psrf_qqopenid: "",
      psrf_qqunionid: "",
      tmeAppID: "qqmusic",
      tmeLoginType: 0,
      uin: "0",
      wid: "7223299733393904640",
    },
    "music.search.SearchCgiService": {
      module: "music.search.SearchCgiService",
      method: "DoSearchForQQMusicDesktop",
      param: {
        grp: 1,
        num_per_page: limit,
        page_num: page,
        query,
        remoteplace: "txt.newclient.top",
        search_type: searchType,
        searchid: getSearchId(),
      },
    },
  }

  const bodyStr = JSON.stringify(reqBody)
  const sign = await zzcSign(bodyStr)

  const res = await tauriFetch(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://y.qq.com/",
      "Content-Type": "application/json",
    },
    body: bodyStr,
  })

  if (!res.ok) {
    return qqDesktopSearch(query, page, limit, searchType, retryNum + 1)
  }

  const data = (await res.json()) as QqSearchEnvelope
  const req = data["music.search.SearchCgiService"] ?? data.req
  if (!req || data.code !== 0 || req.code !== 0 || !req.data) {
    return qqDesktopSearch(query, page, limit, searchType, retryNum + 1)
  }
  return req.data
}
