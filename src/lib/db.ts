import { BaseDirectory, readTextFile, writeTextFile, mkdir } from "@tauri-apps/plugin-fs"

const BASE = "museek"

// In the Tauri window we persist to the app-data dir. In the browser preview
// (no Tauri IPC bridge) the fs plugin would throw "...reading 'invoke'", so we
// fall back to localStorage there — keeps the preview fully functional.
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function ensureDir() {
  try {
    await mkdir(BASE, { baseDir: BaseDirectory.AppData, recursive: true })
  } catch {
    // already exists
  }
}

export async function readData<T>(filename: string, fallback: T): Promise<T> {
  if (!isTauri) {
    try {
      const text = localStorage.getItem(`${BASE}/${filename}`)
      return text ? (JSON.parse(text) as T) : fallback
    } catch {
      return fallback
    }
  }
  try {
    const text = await readTextFile(`${BASE}/${filename}`, { baseDir: BaseDirectory.AppData })
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export async function writeData<T>(filename: string, data: T): Promise<void> {
  return writeDataWith(filename, data, true)
}

/**
 * Same as `writeData` but without indentation.
 *
 * Use for append-mostly logs where a human never reads the file: pretty-printing
 * roughly doubles the bytes on disk for no benefit, and the listen log holds
 * thousands of song snapshots.
 */
export async function writeDataCompact<T>(
  filename: string,
  data: T,
): Promise<void> {
  return writeDataWith(filename, data, false)
}

async function writeDataWith<T>(
  filename: string,
  data: T,
  pretty: boolean,
): Promise<void> {
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  if (!isTauri) {
    try {
      localStorage.setItem(`${BASE}/${filename}`, text)
    } catch {
      // ignore quota / serialization errors in the preview
    }
    return
  }
  await ensureDir()
  await writeTextFile(`${BASE}/${filename}`, text, {
    baseDir: BaseDirectory.AppData,
  })
}
