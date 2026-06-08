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
  if (!isTauri) {
    try {
      localStorage.setItem(`${BASE}/${filename}`, JSON.stringify(data))
    } catch {
      // ignore quota / serialization errors in the preview
    }
    return
  }
  await ensureDir()
  await writeTextFile(`${BASE}/${filename}`, JSON.stringify(data, null, 2), {
    baseDir: BaseDirectory.AppData,
  })
}
