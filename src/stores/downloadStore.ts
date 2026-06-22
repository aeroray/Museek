import { create } from "zustand"
import { httpFetch as tauriFetch } from "@/lib/http"
import { writeFile } from "@tauri-apps/plugin-fs"
import type { MusicInfo, Quality } from "@/types/music"
import { sourceRunner } from "@/lib/sourceRunner"
import { useSettingsStore, type NamingScheme } from "@/stores/settingsStore"
import { useUiStore } from "@/stores/uiStore"
import { t } from "@/lib/i18n"

export type DownloadStatus = "waiting" | "downloading" | "completed" | "error"

export interface DownloadTask {
  id: string
  song: MusicInfo
  quality: Quality
  status: DownloadStatus
  progress: number
  error?: string
}

interface DownloadState {
  tasks: DownloadTask[]
  addTask: (song: MusicInfo, quality?: Quality) => void
  removeTask: (id: string) => void
  clearCompleted: () => void
  startTask: (id: string) => Promise<void>
  updateProgress: (id: string, progress: number) => void
  updateStatus: (id: string, status: DownloadStatus, error?: string) => void
  // Start queued tasks up to the configured concurrency limit.
  _pump: () => void
}

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

export const useDownloadStore = create<DownloadState>((set, get) => ({
  tasks: [],

  addTask(song, quality) {
    // No download location set yet → prompt the user (with a shortcut to Settings)
    // instead of silently saving somewhere. downloadDir is a device-local setting.
    if (!useSettingsStore.getState().downloadDir) {
      useUiStore.getState().setDownloadLocationPrompt(true)
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
    set((s) => ({ tasks: [...s.tasks, task] }))
    useUiStore.getState().notify({ message: t("download.added", { name: song.name }), variant: "success" })
    get()._pump()
  },

  removeTask(id) {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
    get()._pump()
  },

  clearCompleted() {
    set((s) => ({ tasks: s.tasks.filter((t) => t.status !== "completed") }))
  },

  updateProgress(id, progress) {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, progress } : t)) }))
  },

  updateStatus(id, status, error) {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status, error } : t)),
    }))
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

  async startTask(id) {
    const task = get().tasks.find((t) => t.id === id)
    if (!task || task.status === "downloading" || task.status === "completed") return

    get().updateStatus(id, "downloading")
    get().updateProgress(id, 0)
    try {
      // Resolve URL with auto-downgrade; tell the user if the quality stepped down.
      const { url, quality: actual } = await sourceRunner.getMusicUrlAdaptive(task.song, task.quality)
      if (actual !== task.quality) {
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, quality: actual } : t)) }))
        useUiStore.getState().notify({
          message: t("download.qualityDowngraded", { name: task.song.name, quality: t(`quality.${actual}`) }),
          variant: "info",
        })
      }

      const res = await tauriFetch(url, { method: "GET" })
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
      await writeFile(`${dir}/${filename}`, merged)

      get().updateStatus(id, "completed")
      get().updateProgress(id, 100)
      useUiStore.getState().notify({ message: t("download.complete", { name: task.song.name }), variant: "success" })
    } catch (err) {
      get().updateStatus(id, "error", (err as Error).message)
    } finally {
      // Free slot → kick off the next queued task.
      get()._pump()
    }
  },
}))
