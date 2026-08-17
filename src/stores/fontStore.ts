import { create } from "zustand";
import {
  applyFontStacks,
  DEFAULT_FONT_PREFS,
  dropMissingFamilies,
  listInstalledFontFamilies,
  loadFontPrefs,
  readFontStackCache,
  resolveFontStacks,
  saveFontPrefs,
  writeFontStackCache,
  type DesktopLyricsFontMode,
  type FontPrefs,
  type UiFontMode,
} from "@/lib/uiFonts";

interface FontState extends FontPrefs {
  families: string[];
  familiesStatus: "idle" | "loading" | "ready";
  ready: boolean;
  ensureFamilies: () => void;
  setUiMode: (mode: UiFontMode) => void;
  setUiFamily: (family: string) => void;
  setDesktopLyricsMode: (mode: DesktopLyricsFontMode) => void;
  setDesktopLyricsFamily: (family: string) => void;
}

let familiesPromise: Promise<void> | null = null;

function publish(prefs: FontPrefs, persist: boolean) {
  const stacks = resolveFontStacks(prefs);
  applyFontStacks(stacks.ui, stacks.lyrics);
  writeFontStackCache(stacks.ui, stacks.lyrics);
  if (persist) void saveFontPrefs(prefs);
}

export const useFontStore = create<FontState>((set, get) => ({
  ...DEFAULT_FONT_PREFS,
  families: [],
  familiesStatus: "idle",
  ready: false,
  ensureFamilies() {
    if (get().familiesStatus === "ready" || familiesPromise) return;
    set({ familiesStatus: "loading" });
    familiesPromise = (async () => {
      try {
        const families = await listInstalledFontFamilies();
        const current = get();
        const prefs = dropMissingFamilies(
          { version: 1, ui: current.ui, desktopLyrics: current.desktopLyrics },
          families,
        );
        if (JSON.stringify(prefs) !== JSON.stringify({ version: 1, ui: current.ui, desktopLyrics: current.desktopLyrics })) {
          void saveFontPrefs(prefs);
          publish(prefs, false);
        }
        set({
          ...prefs,
          families,
          familiesStatus: "ready",
        });
      } catch {
        set({ families: [], familiesStatus: "ready" });
      } finally {
        familiesPromise = null;
      }
    })();
  },
  setUiMode(mode) {
    const prefs: FontPrefs = {
      version: 1,
      ui: { ...get().ui, mode },
      desktopLyrics: get().desktopLyrics,
    };
    set({ ui: prefs.ui });
    publish(prefs, true);
  },
  setUiFamily(family) {
    const prefs: FontPrefs = {
      version: 1,
      ui: { mode: "custom", family },
      desktopLyrics: get().desktopLyrics,
    };
    set({ ui: prefs.ui });
    publish(prefs, true);
  },
  setDesktopLyricsMode(mode) {
    const prefs: FontPrefs = {
      version: 1,
      ui: get().ui,
      desktopLyrics: { ...get().desktopLyrics, mode },
    };
    set({ desktopLyrics: prefs.desktopLyrics });
    publish(prefs, true);
  },
  setDesktopLyricsFamily(family) {
    const prefs: FontPrefs = {
      version: 1,
      ui: get().ui,
      desktopLyrics: { mode: "custom", family },
    };
    set({ desktopLyrics: prefs.desktopLyrics });
    publish(prefs, true);
  },
}));

export function currentFontStacks(): { ui: string; lyrics: string } {
  const { ui, desktopLyrics } = useFontStore.getState();
  return resolveFontStacks({ version: 1, ui, desktopLyrics });
}

/**
 * Apply cached stacks before paint, then hydrate from device-local fonts.json.
 */
export function initFonts(useLocalCache = true) {
  if (useLocalCache) {
    const cached = readFontStackCache();
    if (cached) applyFontStacks(cached.ui, cached.lyrics);
  }
  void (async () => {
    const loaded = await loadFontPrefs();
    useFontStore.setState({
      ...loaded,
      ready: true,
    });
    publish(loaded, false);
  })();
}
