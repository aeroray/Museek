import { cdnFetchStrategies } from "@/lib/cdnHeaders"
import { hiResCover } from "@/lib/cover"
import { httpFetch } from "@/lib/http"
import { useSettingsStore, type NamingScheme } from "@/stores/settingsStore"
import type { MusicInfo } from "@/types/music"

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

const MAX_COVER_BYTES = 10 * 1024 * 1024

export type SaveCoverResult = "saved" | "cancelled"

function startsWithBytes(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((b, i) => bytes[i] === b)
}

function detectCoverExt(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "jpg"
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "png"
  if (
    bytes.length >= 12 &&
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp"
  }
  if (startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif"
  if (startsWithBytes(bytes, [0x42, 0x4d])) return "bmp"
  return null
}

function sanitize(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim()
}

function coverFileName(
  song: MusicInfo,
  scheme: NamingScheme,
  ext: string,
): string {
  const name = sanitize(song.name) || "cover"
  const singer = sanitize(song.singer)
  let base: string
  switch (scheme) {
    case "name-singer":
      base = singer ? `${name} - ${singer}` : name
      break
    case "name":
      base = name
      break
    case "singer-name":
    default:
      base = singer ? `${singer} - ${name}` : name
  }
  return `${base}.${ext}`
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const url of urls) {
    if (typeof url === "string" && url && !out.includes(url)) out.push(url)
  }
  return out
}

function isRemoteHttp(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host !== "asset.localhost" && host !== "tauri.localhost"
  } catch {
    return false
  }
}

function decodeDataUrl(url: string): Uint8Array | null {
  const match = /^data:image\/[\w+.-]+;base64,(.+)$/i.exec(url)
  if (!match) return null
  const binary = atob(match[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function readLocalCoverRel(rel: string): Promise<Uint8Array | null> {
  try {
    const { readFile, BaseDirectory } = await import("@tauri-apps/plugin-fs")
    const data = await readFile(rel, { baseDir: BaseDirectory.AppData })
    if (!data?.length) return null
    return data instanceof Uint8Array ? data : new Uint8Array(data)
  } catch {
    return null
  }
}

async function fetchRemoteCover(url: string): Promise<Uint8Array | null> {
  for (const headers of cdnFetchStrategies(url)) {
    try {
      const res = await httpFetch(url, {
        method: "GET",
        headers: {
          ...headers,
          Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.5",
        },
      })
      if (!res.ok) continue
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (!bytes.length || bytes.byteLength > MAX_COVER_BYTES) continue
      if (!detectCoverExt(bytes)) continue
      return bytes
    } catch {
      /* try the next header strategy */
    }
  }
  return null
}

async function fetchLocalUrl(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!bytes.length || bytes.byteLength > MAX_COVER_BYTES) return null
    return bytes
  } catch {
    return null
  }
}

async function loadFromUrl(url: string): Promise<Uint8Array | null> {
  if (url.startsWith("data:")) return decodeDataUrl(url)
  if (isRemoteHttp(url)) return fetchRemoteCover(url)
  return fetchLocalUrl(url)
}

async function loadCoverBytes(
  song: MusicInfo,
  displayUrl: string | null,
): Promise<Uint8Array> {
  if (isTauri && song.meta.localCoverRel) {
    const local = await readLocalCoverRel(song.meta.localCoverRel)
    if (local) return local
  }
  const urls = uniqueUrls([
    displayUrl,
    hiResCover(song.meta.picUrl, song.source),
    song.meta.picUrl,
  ])
  for (const url of urls) {
    const bytes = await loadFromUrl(url)
    if (bytes?.length) return bytes
  }
  throw new Error("Could not read cover art")
}

function withExtension(path: string, ext: string): string {
  if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(path)) return path
  return `${path}.${ext}`
}

function defaultSavePath(filename: string): string {
  const dir = useSettingsStore.getState().downloadDir?.replace(/[/\\]+$/, "")
  if (!dir) return filename
  return `${dir}/${filename}`
}

async function writeCoverFile(path: string, bytes: Uint8Array): Promise<void> {
  const payload =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes
      : bytes.slice()
  if (isTauri) {
    const { writeFile } = await import("@tauri-apps/plugin-fs")
    await writeFile(path, payload)
    return
  }
  const ext = detectCoverExt(payload) ?? "jpg"
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/jpeg"
  const blob = new Blob([payload], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = path.split(/[/\\]/).pop() || `cover.${ext}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Ask where to save the lyrics-page cover, then write the image bytes there. */
export async function saveCoverToDisk(args: {
  song: MusicInfo
  displayUrl: string | null
}): Promise<SaveCoverResult> {
  const bytes = await loadCoverBytes(args.song, args.displayUrl)
  const ext = detectCoverExt(bytes) ?? "jpg"
  const filename = coverFileName(
    args.song,
    useSettingsStore.getState().fileNaming,
    ext,
  )

  if (!isTauri) {
    await writeCoverFile(filename, bytes)
    return "saved"
  }

  const { save } = await import("@tauri-apps/plugin-dialog")
  const jpegFilter = { name: "JPEG", extensions: ["jpg", "jpeg"] }
  const pngFilter = { name: "PNG", extensions: ["png"] }
  const filters =
    ext === "png"
      ? [pngFilter, jpegFilter]
      : ext === "webp"
        ? [{ name: "WebP", extensions: ["webp"] }, jpegFilter, pngFilter]
        : ext === "gif"
          ? [{ name: "GIF", extensions: ["gif"] }, jpegFilter, pngFilter]
          : [jpegFilter, pngFilter]
  const path = await save({
    defaultPath: defaultSavePath(filename),
    filters,
  })
  if (!path) return "cancelled"
  await writeCoverFile(withExtension(path, ext), bytes)
  return "saved"
}
