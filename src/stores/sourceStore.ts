import { create } from "zustand";
import { parseScriptMeta } from "@/lib/lxApi";
import {
  sourceRunner,
  loadSourceScripts,
  saveSourceScripts,
  loadSourceProbeResults,
  saveSourceProbeResults,
} from "@/lib/sources";
import { t } from "@/lib/i18n";
import type { SourceScript } from "@/types/source";
import type { SourceProbeResult } from "@/lib/sources/probe";
import { rankSources } from "@/lib/sources/rank";
import { type BundledSource } from "@/lib/sources/bundle";

interface SourceState {
  scripts: SourceScript[];
  isLoading: boolean;
  error: string | null;
  probeResults: Record<string, SourceProbeResult>;

  /** @returns whether this created a new entry or refreshed a duplicate */
  importScript: (
    rawScript: string,
    url?: string,
  ) => Promise<"added" | "updated">;
  /**
   * Restore every source in a bundle file in one pass.
   *
   * Unlike `importScript` this does not validate by loading: a disabled bundled
   * source is written back disabled and must not be started just to import it.
   */
  importBundle: (
    sources: BundledSource[],
  ) => { added: number; updated: number; enabled: number };
  removeScript: (id: string) => void;
  toggleEnabled: (id: string) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  reorderScripts: (from: number, to: number) => void;
  /** Reorder every source best-first by probe result. @returns whether the order changed */
  sortByQuality: () => boolean;
  setScriptSources: (id: string, sources: unknown) => void;
  setProbeResult: (id: string, result: SourceProbeResult) => void;
  loadFromDisk: () => Promise<void>;
  clearError: () => void;
}

function generateId(): string {
  return `user_api_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export const useSourceStore = create<SourceState>((set, get) => ({
  scripts: [],
  isLoading: false,
  error: null,
  probeResults: {},

  clearError: () => set({ error: null }),

  async importScript(rawScript, url) {
    const meta = parseScriptMeta(rawScript);
    // Dedupe: re-importing the same origin (or byte-identical content) updates the
    // existing entry in place instead of adding a duplicate.
    const existing = get().scripts.find(
      (s) => (url && s.url === url) || s.rawScript === rawScript,
    );
    const script: SourceScript = {
      id: existing?.id ?? generateId(),
      ...meta,
      rawScript,
      enabled: existing?.enabled ?? true,
      url,
    };

    // Validate by loading it
    set({ isLoading: true, error: null });
    try {
      // loadScript returns the `sources` from the script's `inited` event — attach
      // them now so the platform list shows immediately (the script isn't in the
      // store yet when `inited` fires, so setScriptSources alone would be lost).
      const sources = await sourceRunner.loadScript(script);
      if (sources) script.sources = sources as SourceScript["sources"];
      set((s) => {
        // Any import (new OR re-import) moves the entry to the TOP so the most
        // recently imported source is always first (and tried first in failover).
        const scripts = existing
          ? [script, ...s.scripts.filter((x) => x.id !== existing.id)]
          : [script, ...s.scripts];
        sourceRunner.setScripts(scripts);
        saveSourceScripts(scripts);
        return { scripts, isLoading: false };
      });
      return existing ? "updated" : "added";
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message });
      throw err;
    }
  },

  removeScript(id) {
    sourceRunner.unloadScript(id);
    set((s) => {
      const scripts = s.scripts.filter((x) => x.id !== id);
      const probeResults = { ...s.probeResults };
      delete probeResults[id];
      sourceRunner.setScripts(scripts);
      saveSourceScripts(scripts);
      saveSourceProbeResults(probeResults);
      return { scripts, probeResults };
    });
  },

  importBundle(bundled) {
    const { scripts: current } = get();
    const byOrigin = new Map(current.map((s) => [s.url ?? "", s] as const));
    const byText = new Map(current.map((s) => [s.rawScript, s] as const));

    let added = 0;
    let updated = 0;
    let enabled = 0;

    // Bundled order is the exported dispatch priority, so rebuild it in place
    // rather than appending: the restored list should look like the original.
    const restored: SourceScript[] = [];
    for (const item of bundled) {
      const existing =
        (item.url ? byOrigin.get(item.url) : undefined) ??
        byText.get(item.rawScript);

      const script: SourceScript = {
        id: existing?.id ?? generateId(),
        name: item.name || existing?.name || "Unknown Source",
        version: item.version || existing?.version || "0.0.0",
        author: item.author || existing?.author || "",
        description: item.description || existing?.description || "",
        rawScript: item.rawScript,
        enabled: item.enabled,
        ...(item.url ? { url: item.url } : {}),
        ...(item.sources
          ? { sources: item.sources }
          : existing?.sources
            ? { sources: existing.sources }
            : {}),
      };
      if (existing) updated++;
      else added++;
      if (script.enabled) enabled++;
      restored.push(script);
    }

    // Keep every source that was NOT in the bundle, after the restored ones, so
    // importing a partial bundle never silently deletes the rest.
    const restoredIds = new Set(restored.map((s) => s.id));
    const restoredText = new Set(restored.map((s) => s.rawScript));
    const untouched = current.filter(
      (s) => !restoredIds.has(s.id) && !restoredText.has(s.rawScript),
    );
    const scripts = [...restored, ...untouched];

    set({ scripts, error: null });
    sourceRunner.setScripts(scripts);
    saveSourceScripts(scripts);

    // Start only what the bundle says is enabled. Failures are tolerated: one
    // broken script must not abort the import of the others.
    void (async () => {
      for (const script of restored) {
        if (!script.enabled) continue;
        try {
          const sources = await sourceRunner.loadScript(script);
          if (sources) get().setScriptSources(script.id, sources);
        } catch {
          // leave it listed; the user can test and disable it
        }
      }
    })();

    return { added, updated, enabled };
  },

  async setEnabled(id, enabled) {
    const script = get().scripts.find((s) => s.id === id);
    if (!script || script.enabled === enabled) return;

    set((s) => {
      const scripts = s.scripts.map((x) =>
        x.id === id ? { ...x, enabled } : x,
      );
      sourceRunner.setScripts(scripts);
      saveSourceScripts(scripts);
      return { scripts };
    });

    if (enabled) {
      set({ isLoading: true, error: null });
      try {
        const sources = await sourceRunner.loadScript(script);
        if (sources) get().setScriptSources(id, sources);
        set({ isLoading: false });
      } catch (err) {
        set({
          isLoading: false,
          error: t("sources.err.loadFailed", {
            name: script.name,
            msg: (err as Error).message,
          }),
        });
      }
    } else {
      sourceRunner.unloadScript(id);
    }
  },

  async toggleEnabled(id) {
    const script = get().scripts.find((s) => s.id === id);
    if (!script) return;
    await get().setEnabled(id, !script.enabled);
  },

  reorderScripts(from, to) {
    set((s) => {
      const n = s.scripts.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return {};
      const scripts = [...s.scripts];
      const [moved] = scripts.splice(from, 1);
      scripts.splice(to, 0, moved);
      sourceRunner.setScripts(scripts);
      saveSourceScripts(scripts);
      return { scripts };
    });
  },

  sortByQuality() {
    const s = get();
    // Rank from the probe snapshot, never from `enabled`: ordering decides
    // dispatch priority, and re-ordering must not double as an on/off action.
    const ranked = rankSources(s.scripts, s.probeResults);
    const changed = ranked.some((x, i) => x.id !== s.scripts[i].id);
    if (!changed) return false;
    set({ scripts: ranked });
    sourceRunner.setScripts(ranked);
    saveSourceScripts(ranked);
    return true;
  },

  setScriptSources(id, sources) {
    set((s) => {
      const scripts = s.scripts.map((x) =>
        x.id === id ? { ...x, sources: sources as SourceScript["sources"] } : x,
      );
      sourceRunner.setScripts(scripts);
      return { scripts };
    });
  },

  setProbeResult(id, result) {
    set((s) => {
      const probeResults = { ...s.probeResults, [id]: result };
      saveSourceProbeResults(probeResults);
      return { probeResults };
    });
  },

  async loadFromDisk() {
    const [scripts, storedProbe] = await Promise.all([
      loadSourceScripts(),
      loadSourceProbeResults(),
    ]);
    const known = new Set(scripts.map((s) => s.id));
    const probeResults = Object.fromEntries(
      Object.entries(storedProbe).filter(([id]) => known.has(id)),
    );
    if (Object.keys(probeResults).length !== Object.keys(storedProbe).length) {
      saveSourceProbeResults(probeResults);
    }
    set({ scripts, probeResults });
    sourceRunner.setScripts(scripts);
    // Load every enabled source (each in its own Worker). Tolerate individual
    // init failures: a source that fails to load just won't be tried.
    for (const script of scripts) {
      if (!script.enabled) continue;
      try {
        const sources = await sourceRunner.loadScript(script);
        if (sources) get().setScriptSources(script.id, sources);
      } catch {
        // skip sources that fail to load/init
      }
    }
  },
}));
