import * as md5Lib from "js-md5"
import * as aesjs from "aes-js"

/**
 * NetEase Cloud Music eapi signing — single copy for search / charts / playlists / hotSearch.
 * Ported from lx-music-desktop wy/utils/crypto.js.
 */

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

/** Build `{ params }` form body for NetEase `/eapi/*` gateways. */
export function eapi(url: string, object: unknown): { params: string } {
  const text = typeof object === "object" ? JSON.stringify(object) : String(object)
  const message = `nobody${url}use${text}md5forencrypt`
  const digest = md5(message)
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
  return {
    params: bytesToHexUpper(aesEcbEncrypt(data, EAPI_KEY)),
  }
}

/** Same signing, returns only the params hex string. */
export function eapiParams(url: string, object: unknown): string {
  return eapi(url, object).params
}
