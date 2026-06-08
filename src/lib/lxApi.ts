import { httpFetch as tauriFetch } from "@/lib/http"
import * as md5Lib from "js-md5"
import * as pako from "pako"
import * as aesjs from "aes-js"
import forge from "node-forge"
import type { LxRequestResult } from "@/types/source"

// js-md5 CommonJS/ESM interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const md5 = ((md5Lib as any).default ?? md5Lib) as (str: string) => string

export interface LxApiOptions {
  scriptInfo: { name: string; version: string; author: string; rawScript: string; description: string }
  onRequestRegister: (handler: (payload: unknown) => Promise<LxRequestResult>) => void
  onInited: (sourceInfo: Record<string, unknown>) => void
  onUpdateAlert?: (info: unknown) => void
}

function uint8ToBase64(buf: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

function base64ToUint8(str: string): Uint8Array {
  const binary = atob(str)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf
}

function hexToUint8(hex: string): Uint8Array {
  const buf = new Uint8Array(hex.length / 2)
  for (let i = 0; i < buf.length; i++) buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return buf
}

function uint8ToHex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function toUint8(val: unknown): Uint8Array {
  if (val instanceof Uint8Array) return val
  if (Array.isArray(val)) return new Uint8Array(val as number[])
  if (typeof val === "string") return new TextEncoder().encode(val)
  return new Uint8Array()
}

function aesEncrypt(buf: Uint8Array, mode: string, key: Uint8Array, iv?: Uint8Array): Uint8Array {
  const keyBytes = Array.from(key)
  if (mode.includes("ecb")) {
    const cipher = new aesjs.ModeOfOperation.ecb(keyBytes)
    const padded = aesjs.padding.pkcs7.pad(buf)
    return cipher.encrypt(padded)
  }
  if (mode.includes("cbc") && iv) {
    const ivBytes = Array.from(iv)
    const cipher = new aesjs.ModeOfOperation.cbc(keyBytes, ivBytes)
    const padded = aesjs.padding.pkcs7.pad(buf)
    return cipher.encrypt(padded)
  }
  throw new Error(`Unsupported AES mode: ${mode}`)
}

function rsaEncrypt(buf: Uint8Array, publicKeyPem: string): Uint8Array {
  const key = forge.pki.publicKeyFromPem(publicKeyPem)
  const encrypted = key.encrypt(forge.util.createBuffer(buf).getBytes(), "RSAES-PKCS1-V1_5")
  return new TextEncoder().encode(forge.util.encode64(encrypted))
}

export function createLxApi(options: LxApiOptions) {
  const { scriptInfo, onRequestRegister, onInited, onUpdateAlert } = options

  const lxObj = {
    EVENT_NAMES: {
      request: "request",
      inited: "inited",
      updateAlert: "updateAlert",
    },
    version: "2.0.0",
    env: "desktop",
    currentScriptInfo: {
      name: scriptInfo.name,
      version: scriptInfo.version,
      author: scriptInfo.author,
      rawScript: scriptInfo.rawScript,
    },

    request(
      url: string,
      opts: {
        method?: string
        timeout?: number
        headers?: Record<string, string>
        body?: string
        form?: Record<string, string>
      },
      callback: (err: Error | null, response: unknown, body: unknown) => void
    ): () => void {
      const controller = new AbortController()
      // Use script-specified timeout, or default 15s. Original lx-music defaults to 60s
      // but we want faster failure so .finally() runs before our inited timeout.
      const ms = opts.timeout && opts.timeout > 0 ? Math.min(opts.timeout, 60_000) : 15_000
      const timer = setTimeout(() => controller.abort(), ms)

      const fetchOpts: RequestInit = {
        method: (opts.method || "GET").toUpperCase(),
        headers: opts.headers || {},
        signal: controller.signal,
      }

      if (opts.body) fetchOpts.body = opts.body
      if (opts.form) {
        const params = new URLSearchParams(opts.form)
        fetchOpts.body = params.toString()
        ;(fetchOpts.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded"
      }

      tauriFetch(url, fetchOpts)
        .then(async (res) => {
          clearTimeout(timer)
          const rawText = await res.text()
          let body: unknown
          try {
            body = JSON.parse(rawText)
          } catch {
            body = rawText
          }
          const rawBytes = new TextEncoder().encode(rawText)
          const response = {
            statusCode: res.status,
            statusMessage: res.statusText,
            headers: Object.fromEntries(res.headers.entries()),
            body,
            // raw mimics Node.js Buffer: .toString() returns the UTF-8 string
            raw: Object.assign(rawBytes, { toString: () => rawText }),
            bytes: rawBytes.length,
          }
          callback(null, response, body)
        })
        .catch((err: Error) => {
          clearTimeout(timer)
          // Always call callback (including AbortError) so script promises can resolve
          callback(err, null, null)
        })

      return () => {
        clearTimeout(timer)
        controller.abort()
      }
    },

    on(eventName: string, handler: (payload: unknown) => Promise<LxRequestResult>): Promise<void> {
      if (eventName === "request") {
        onRequestRegister(handler)
        return Promise.resolve()
      }
      return Promise.reject(new Error("The event is not supported: " + eventName))
    },

    send(eventName: string, data: unknown): Promise<void> {
      if (eventName === "inited") {
        onInited(data as Record<string, unknown>)
      } else if (eventName === "updateAlert") {
        onUpdateAlert?.(data)
      }
      return Promise.resolve()
    },

    utils: {
      crypto: {
        md5(str: string): string {
          return md5(str)
        },
        aesEncrypt(
          buf: Uint8Array | number[],
          mode: string,
          key: Uint8Array | number[],
          iv?: Uint8Array | number[]
        ): Uint8Array {
          return aesEncrypt(toUint8(buf), mode, toUint8(key), iv ? toUint8(iv) : undefined)
        },
        rsaEncrypt(buf: Uint8Array | number[], publicKeyPem: string): Uint8Array {
          return rsaEncrypt(toUint8(buf), publicKeyPem)
        },
        randomBytes(n: number): Uint8Array {
          return crypto.getRandomValues(new Uint8Array(n))
        },
      },
      buffer: {
        from(val: string | number[] | ArrayBuffer, encoding?: string): Uint8Array {
          if (typeof val === "string") {
            if (encoding === "base64") return base64ToUint8(val)
            if (encoding === "hex") return hexToUint8(val)
            return new TextEncoder().encode(val)
          }
          if (val instanceof ArrayBuffer) return new Uint8Array(val)
          return new Uint8Array(val)
        },
        bufToString(buf: Uint8Array | number[], encoding?: string): string {
          const u8 = toUint8(buf)
          if (encoding === "base64") return uint8ToBase64(u8)
          if (encoding === "hex") return uint8ToHex(u8)
          return new TextDecoder().decode(u8)
        },
      },
      zlib: {
        inflate(buf: Uint8Array | number[]): Promise<Uint8Array> {
          return Promise.resolve(pako.inflate(toUint8(buf)))
        },
        deflate(data: Uint8Array | string): Promise<Uint8Array> {
          return Promise.resolve(pako.deflate(toUint8(data as Uint8Array | number[])))
        },
      },
    },
  }

  return lxObj
}

export type LxApiInstance = ReturnType<typeof createLxApi>

// Parse JSDoc metadata from top of script
export function parseScriptMeta(rawScript: string): {
  name: string
  version: string
  author: string
  description: string
} {
  const commentMatch = /^\/\*[\S\s]+?\*\//.exec(rawScript)
  const comment = commentMatch?.[0] ?? ""
  const get = (key: string) => {
    const m = new RegExp(`@${key}\\s+(.+)`).exec(comment)
    return m?.[1]?.trim().slice(0, 56) ?? ""
  }
  return {
    name: get("name") || "Unknown Source",
    version: get("version") || "0.0.0",
    author: get("author") || "",
    description: get("description") || "",
  }
}
