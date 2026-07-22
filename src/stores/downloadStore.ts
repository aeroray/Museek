import { create } from "zustand"
import { cdnHeadersForUrl } from "@/lib/cdnHeaders"
import { httpFetch as tauriFetch } from "@/lib/http"
import { writeFile } from "@tauri-apps/plugin-fs"
import type { MusicInfo, Quality } from "@/types/music"
import { resolveAdaptiveUrl } from "@/lib/playback"
import { notify, promptDownloadLocation } from "@/lib/notify"
import { useSettingsStore, type NamingScheme } from "@/stores/settingsStore"
import { readData, writeData } from "@/lib/db"
import { t } from "@/lib/i18n"

export type DownloadStatus = "waiting" | "downloading" | "completed" | "error"

export interface DownloadTask {
  id: string
  song: MusicInfo
  quality: Quality
  status: DownloadStatus
  progress: number
  error?: string
  /** Absolute path written on disk when completed (used if delete-with-task is on). */
  filePath?: string
}

interface DownloadState {
  tasks: DownloadTask[]
  addTask: (song: MusicInfo, quality?: Quality) => void
  removeTask: (id: string) => void
  removeTasks: (ids: string[]) => void
  clearCompleted: () => void
  startTask: (id: string) => Promise<void>
  updateProgress: (id: string, progress: number) => void
  updateStatus: (id: string, status: DownloadStatus, error?: string) => void
  // Start queued tasks up to the configured concurrency limit.
  _pump: () => void
  /** Device-local history (not synced). Restores queue across restarts. */
  loadFromDisk: () => Promise<void>
}

const STORE_FILE = "downloads.json"
const STATUSES: DownloadStatus[] = ["waiting", "downloading", "completed", "error"]
const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"]

function sanitize(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim()
}

function buildFilename(song: MusicInfo, scheme: NamingScheme, ext: string): string {
  const name = sanitize(song.name)
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
  return `${base || "audio"}.${ext}`
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function deleteFileIfNeeded(filePath: string | undefined) {
  if (!filePath || !isTauri) return
  if (!useSettingsStore.getState().deleteDownloadFiles) return
  try {
    const { remove, exists } = await import("@tauri-apps/plugin-fs")
    if (await exists(filePath)) await remove(filePath)
  } catch {
    /* ignore — task still removed from the list */
  }
}

function persist(tasks: DownloadTask[]) {
  // Device-local only — deliberately excluded from config sync (see configIO DB_FILES).
  writeData(STORE_FILE, tasks)
}

function isTask(v: unknown): v is DownloadTask {
  if (!v || typeof v !== "object") return false
  const t = v as DownloadTask
  return (
    typeof t.id === "string" &&
    !!t.song &&
    typeof t.song === "object" &&
    typeof t.song.name === "string" &&
    QUALITIES.includes(t.quality) &&
    STATUSES.includes(t.status) &&
    typeof t.progress === "number"
  )
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: [],

  addTask(song, quality) {
    // No download location set yet → prompt the user (with a shortcut to Settings)
    // instead of silently saving somewhere. downloadDir is a device-local setting.
    if (!useSettingsStore.getState().downloadDir) {
      promptDownloadLocation()
      return
    }
    const q = quality ?? useSettingsStore.getState().downloadQuality
    const task: DownloadTask = {
      id: `dl_${Date.now()}_${song.id}`,
      song,
      quality: q,
      status: "waiting",
      progress: 0,
    }
    set((s) => {
      const tasks = [...s.tasks, task]
      persist(tasks)
      return { tasks }
    })
    notify({ message: t("download.added", { name: song.name }), variant: "success" })
    get()._pump()
  },

  removeTask(id) {
    const task = get().tasks.find((t) => t.id === id)
    void deleteFileIfNeeded(task?.filePath)
    set((s) => {
      const tasks = s.tasks.filter((t) => t.id !== id)
      persist(tasks)
      return { tasks }
    })
    get()._pump()
  },

  removeTasks(ids) {
    const idSet = new Set(ids)
    const toDelete = get().tasks.filter((t) => idSet.has(t.id))
    for (const task of toDelete) void deleteFileIfNeeded(task.filePath)
    set((s) => {
      const tasks = s.tasks.filter((t) => !idSet.has(t.id))
      persist(tasks)
      return { tasks }
    })
    get()._pump()
  },

  clearCompleted() {
    const done = get().tasks.filter((t) => t.status === "completed")
    for (const task of done) void deleteFileIfNeeded(task.filePath)
    set((s) => {
      const tasks = s.tasks.filter((t) => t.status !== "completed")
      persist(tasks)
      return { tasks }
    })
  },

  updateProgress(id, progress) {
    // Progress ticks are frequent — keep them in memory only; status changes persist.
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, progress } : t)) }))
  },

  updateStatus(id, status, error) {
    set((s) => {
      const tasks = s.tasks.map((t) => (t.id === id ? { ...t, status, error } : t))
      persist(tasks)
      return { tasks }
    })
  },

  _pump() {
    const { maxConcurrent } = useSettingsStore.getState()
    // startTask flips a task to "downloading" synchronously (before its first
    // await), so this loop can fill all free slots in one pass.
    for (;;) {
      const running = get().tasks.filter((t) => t.status === "downloading").length
      if (running >= maxConcurrent) break
      const next = get().tasks.find((t) => t.status === "waiting")
      if (!next) break
      void get().startTask(next.id)
    }
  },

  async loadFromDisk() {
    const raw = await readData<unknown>(STORE_FILE, [])
    const list = Array.isArray(raw) ? raw.filter(isTask) : []
    const interrupted = list.some((task) => task.status === "downloading")
    // Interrupted mid-download → re-queue so _pump can finish them after launch.
    const tasks = list.map((task) =>
      task.status === "downloading"
        ? { ...task, status: "waiting" as const, progress: 0, error: undefined }
        : task
    )
    set({ tasks })
    if (interrupted) persist(tasks)
    get()._pump()
  },

  async startTask(id) {
    const task = get().tasks.find((t) => t.id === id)
    if (!task || task.status === "downloading" || task.status === "completed") return

    get().updateStatus(id, "downloading")
    get().updateProgress(id, 0)
    try {
      // Resolve URL with auto-downgrade; tell the user if the quality stepped down.
      const { url, quality: actual } = await resolveAdaptiveUrl(task.song, task.quality)
      if (actual !== task.quality) {
        set((s) => {
          const tasks = s.tasks.map((t) => (t.id === id ? { ...t, quality: actual } : t))
          persist(tasks)
          return { tasks }
        })
        notify({
          message: t("download.qualityDowngraded", { name: task.song.name, quality: t(`quality.${actual}`) }),
          variant: "info",
        })
      }

      const res = await tauriFetch(url, { method: "GET", headers: cdnHeadersForUrl(url) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const contentLength = parseInt(res.headers.get("content-length") || "0")
      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const chunks: Uint8Array[] = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (contentLength > 0) get().updateProgress(id, Math.round((received / contentLength) * 100))
      }

      // Merge chunks
      const total = chunks.reduce((s, c) => s + c.length, 0)
      const merged = new Uint8Array(total)
      let offset = 0
      for (const c of chunks) {
        merged.set(c, offset)
        offset += c.length
      }

      const ext = actual === "flac" || actual === "flac24bit" ? "flac" : "mp3"
      const { downloadDir, fileNaming } = useSettingsStore.getState()
      // Guarded at addTask, but a queued task could outlive the user clearing it.
      if (!downloadDir) throw new Error(t("download.noLocationError"))
      const filename = buildFilename(task.song, fileNaming, ext)
      const dir = downloadDir.replace(/[/\\]+$/, "")
      const filePath = `${dir}/${filename}`
      await writeFile(filePath, merged)

      set((s) => {
        const tasks = s.tasks.map((t) =>
          t.id === id ? { ...t, status: "completed" as const, progress: 100, filePath } : t
        )
        persist(tasks)
        return { tasks }
      })
      notify({ message: t("download.complete", { name: task.song.name }), variant: "success" })
    } catch (err) {
      get().updateStatus(id, "error", (err as Error).message)
    } finally {
      // Free slot → kick off the next queued task.
      get()._pump()
    }
  },
}))
