import { create } from "zustand"
import { httpFetch as tauriFetch } from "@/lib/http"
import { parseScriptMeta } from "@/lib/lxApi"
import { sourceRunner, bindSourceRegistry } from "@/lib/sourceRunner"
import { readData, writeData } from "@/lib/db"
import { t } from "@/lib/i18n"
import type { SourceScript } from "@/types/source"

interface SourceState {
  scripts: SourceScript[]
  isLoading: boolean
  error: string | null

  importScript: (rawScript: string, url?: string) => Promise<void>
  importScriptFromUrl: (url: string) => Promise<void>
  removeScript: (id: string) => void
  toggleEnabled: (id: string) => Promise<void>
  reorderScripts: (from: number, to: number) => void
  setScriptSources: (id: string, sources: unknown) => void
  loadFromDisk: () => Promise<void>
  clearError: () => void
}

function generateId(): string {
  return `user_api_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

export const useSourceStore = create<SourceState>((set, get) => ({
  scripts: [],
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  async importScript(rawScript, url) {
    const meta = parseScriptMeta(rawScript)
    // Dedupe: re-importing the same URL (or byte-identical content) updates the
    // existing entry in place instead of adding a duplicate.
    const existing = get().scripts.find((s) => (url && s.url === url) || s.rawScript === rawScript)
    const script: SourceScript = {
      id: existing?.id ?? generateId(),
      ...meta,
      rawScript,
      enabled: existing?.enabled ?? true,
      url,
    }

    // Validate by loading it
    set({ isLoading: true, error: null })
    try {
      // loadScript returns the `sources` from the script's `inited` event — attach
      // them now so the platform list shows immediately (the script isn't in the
      // store yet when `inited` fires, so setScriptSources alone would be lost).
      const sources = await sourceRunner.loadScript(script)
      if (sources) script.sources = sources as SourceScript["sources"]
      set((s) => {
        // Any import (new OR re-import) moves the entry to the TOP so the most
        // recently imported source is always first (and tried first in failover).
        const scripts = existing
          ? [script, ...s.scripts.filter((x) => x.id !== existing.id)]
          : [script, ...s.scripts]
        writeData("sources.json", scripts)
        return { scripts, isLoading: false }
      })
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message })
      throw err
    }
  },

  async importScriptFromUrl(url) {
    set({ isLoading: true, error: null })
    let rawScript: string
    try {
      const res = await tauriFetch(url, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      })
      if (!res.ok) throw new Error(t("sources.err.downloadHttp", { status: res.status }))
      rawScript = await res.text()
    } catch (err) {
      const message = t("sources.err.downloadFailed", { msg: (err as Error).message })
      set({ isLoading: false, error: message })
      throw new Error(message)
    }

    // Guard against fetching an HTML error page instead of a script
    if (!rawScript.trim() || /^\s*</.test(rawScript)) {
      const message = t("sources.err.notAScript")
      set({ isLoading: false, error: message })
      throw new Error(message)
    }

    // importScript handles validation, persistence and isLoading from here
    await get().importScript(rawScript, url)
  },

  removeScript(id) {
    sourceRunner.unloadScript(id)
    set((s) => {
      const scripts = s.scripts.filter((x) => x.id !== id)
      writeData("sources.json", scripts)
      return { scripts }
    })
  },

  async toggleEnabled(id) {
    const script = get().scripts.find((s) => s.id === id)
    if (!script) return
    const willEnable = !script.enabled

    // Persist the new enabled flag immediately.
    set((s) => {
      const scripts = s.scripts.map((x) => (x.id === id ? { ...x, enabled: willEnable } : x))
      writeData("sources.json", scripts)
      return { scripts }
    })

    if (willEnable) {
      // Load it so it can join the failover rotation.
      set({ isLoading: true, error: null })
      try {
        await sourceRunner.loadScript(script)
        set({ isLoading: false })
      } catch (err) {
        set({ isLoading: false, error: t("sources.err.loadFailed", { name: script.name, msg: (err as Error).message }) })
      }
    } else {
      sourceRunner.unloadScript(id)
    }
  },

  reorderScripts(from, to) {
    set((s) => {
      const n = s.scripts.length
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return {}
      const scripts = [...s.scripts]
      const [moved] = scripts.splice(from, 1)
      scripts.splice(to, 0, moved)
      writeData("sources.json", scripts)
      return { scripts }
    })
  },

  setScriptSources(id, sources) {
    set((s) => ({
      scripts: s.scripts.map((x) =>
        x.id === id ? { ...x, sources: sources as SourceScript["sources"] } : x
      ),
    }))
  },

  async loadFromDisk() {
    const scripts = await readData<SourceScript[]>("sources.json", [])
    set({ scripts })
    // Load every enabled source (sequentially — they share globalThis.lx while
    // executing) so they can all participate in failover. Tolerate individual
    // init failures: a source that fails to load just won't be tried.
    for (const script of scripts) {
      if (!script.enabled) continue
      try {
        await sourceRunner.loadScript(script)
      } catch {
        // skip sources that fail to load/init
      }
    }
  },
}))

// Break the sourceStore ↔ sourceRunner cycle: runner reads scripts via this port.
bindSourceRegistry({
  getScripts: () => useSourceStore.getState().scripts,
  setScriptSources: (id, sources) => useSourceStore.getState().setScriptSources(id, sources),
})
