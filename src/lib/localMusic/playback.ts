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

/**
 * Load a local audio file into a blob: URL for the HTML audio element.
 */
export async function localFileToObjectUrl(filePath: string): Promise<string> {
  if (!isTauri) throw new Error("Local playback requires the desktop app")
  const { readFile, exists } = await import("@tauri-apps/plugin-fs")
  if (!(await exists(filePath))) throw new Error("File not found")
  const bytes = await readFile(filePath)
  return URL.createObjectURL(new Blob([bytes], { type: mimeForExt(extOf(filePath)) }))
}

/** Reveal the file in the OS file manager (selects the file when supported). */
export async function revealLocalFile(filePath: string): Promise<void> {
  if (!isTauri) return
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener")
  await revealItemInDir(filePath)
}
