import { httpFetch as tauriFetch } from "@/lib/http"
import * as md5Lib from "js-md5"
import * as aesjs from "aes-js"

// Ported from lx-music-desktop: src/renderer/utils/musicSdk/wy/hotSearch.js
// NetEase hot-search keywords via the eapi gateway (same signing as charts/wy.ts).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string

const EAPI_KEY = "e82ckenh8dichen8"

function bytesToHexUpper(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
}

function aesEcbEncrypt(text: string, key: string): Uint8Array {
  const keyBytes = aesjs.utils.utf8.toBytes(key)
  const cipher = new aesjs.ModeOfOperation.ecb(keyBytes)
  const padded = aesjs.padding.pkcs7.pad(aesjs.utils.utf8.toBytes(text))
  return cipher.encrypt(padded)
}

function eapi(url: string, object: unknown): { params: string } {
  const text = typeof object === "object" ? JSON.stringify(object) : String(object)
  const message = `nobody${url}use${text}md5forencrypt`
  const digest = md5(message)
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
  return { params: bytesToHexUpper(aesEcbEncrypt(data, EAPI_KEY)) }
}

interface WyHotResponse {
  code?: number
  data?: { itemList?: { searchWord?: string }[] }
}

export async function getWyHotSearch(): Promise<string[]> {
  const form = eapi("/api/search/chart/detail", { id: "HOT_SEARCH_SONG#@#" })
  const body = new URLSearchParams(form).toString()

  const res = await tauriFetch("http://interface.music.163.com/eapi/batch", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36",
      origin: "https://music.163.com",
    },
    body,
  })

  if (!res.ok) throw new Error(`NetEase hot search failed: ${res.status}`)
  const data = (await res.json()) as WyHotResponse
  return (data.data?.itemList ?? []).map((i) => i.searchWord ?? "").filter(Boolean)
}
