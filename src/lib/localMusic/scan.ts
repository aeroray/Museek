import { isUnlimitedLocalScanDepth, normalizeLocalScanDepth } from "./depth"
import { LOCAL_AUDIO_EXTS, isLocalAudioPath } from "./tags"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * Pick one or more audio files via the native dialog.
 */
export async function pickLocalAudioFiles(): Promise<string[]> {
  if (!isTauri) return []
  const { open } = await import("@tauri-apps/plugin-dialog")
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [
      {
        name: "Audio",
        extensions: [...LOCAL_AUDIO_EXTS],
      },
    ],
  })
  if (!selected) return []
  const paths = Array.isArray(selected) ? selected : [selected]
  return paths.filter((p) => typeof p === "string" && isLocalAudioPath(p)) as string[]
}

/**
 * Pick a folder and collect audio files up to `maxDepth` levels below it.
 * Depth 0 = only files directly in the chosen folder.
 * Depth < 0 (-1) = unlimited.
 */
export async function pickLocalAudioFolder(maxDepth: number): Promise<string[]> {
  if (!isTauri) return []
  const { open } = await import("@tauri-apps/plugin-dialog")
  const dir = await open({ directory: true, multiple: false })
  if (typeof dir !== "string" || !dir) return []
  return collectAudioFiles(dir, normalizeLocalScanDepth(maxDepth))
}

async function collectAudioFiles(root: string, maxDepth: number): Promise<string[]> {
  const { readDir } = await import("@tauri-apps/plugin-fs")
  const { join } = await import("@tauri-apps/api/path")
  const unlimited = isUnlimitedLocalScanDepth(maxDepth)

  const out: string[] = []
  const seen = new Set<string>()

  async function walk(dir: string, depth: number) {
    let entries
    try {
      entries = await readDir(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const name = entry.name
      if (!name || name.startsWith(".")) continue
      const full = await join(dir, name)
      if (entry.isDirectory) {
        if (unlimited || depth < maxDepth) await walk(full, depth + 1)
        continue
      }
      if (entry.isFile && isLocalAudioPath(full)) {
        const key = full.replace(/\\/g, "/").toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(full)
      }
    }
  }

  await walk(root, 0)
  return out
}
