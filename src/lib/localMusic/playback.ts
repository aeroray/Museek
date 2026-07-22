import { t } from "@/lib/i18n"
import { extOf } from "./tags"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

function mimeForExt(ext: string): string {
  switch (ext) {
    case "flac":
      return "audio/flac"
    case "m4a":
    case "aac":
      return "audio/mp4"
    case "ogg":
      return "audio/ogg"
    case "wav":
      return "audio/wav"
    default:
      return "audio/mpeg"
  }
}

/** Map raw FS / path errors to a short user-facing local-playback message. */
export function mapLocalPlayError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "")
  if (
    raw === t("local.fileMissing") ||
    raw === t("local.fileUnreadable") ||
    raw === t("local.missingPath") ||
    raw === t("local.desktopOnly")
  ) {
    return raw
  }
  if (
    /file not found|not found|os error 2|cannot find the (file|path)|系统找不到|找不到指定的文件|No such file/i.test(
      raw
    )
  ) {
    return t("local.fileMissing")
  }
  if (/permission|access is denied|拒绝访问|EACCES|EPERM/i.test(raw)) {
    return t("local.fileUnreadable")
  }
  return t("local.fileUnreadable")
}

/**
 * Load a local audio file into a blob: URL for the HTML audio element.
 */
export async function localFileToObjectUrl(filePath: string): Promise<string> {
  if (!isTauri) throw new Error(t("local.desktopOnly"))
  const { readFile, exists } = await import("@tauri-apps/plugin-fs")
  try {
    if (!(await exists(filePath))) throw new Error(t("local.fileMissing"))
    const bytes = await readFile(filePath)
    return URL.createObjectURL(new Blob([bytes], { type: mimeForExt(extOf(filePath)) }))
  } catch (err) {
    if (err instanceof Error && err.message === t("local.fileMissing")) throw err
    if (err instanceof Error && err.message === t("local.desktopOnly")) throw err
    throw new Error(mapLocalPlayError(err))
  }
}

/** Reveal the file in the OS file manager (selects the file when supported). */
export async function revealLocalFile(filePath: string): Promise<void> {
  if (!isTauri) return
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener")
  await revealItemInDir(filePath)
}
