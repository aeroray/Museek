import { readData, writeData } from "@/lib/db";

/** Must stay in sync with `--font-system` in index.css. */
export const SYSTEM_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';

const FONTS_FILE = "fonts.json";
const UI_STACK_CACHE_KEY = "museek.font.ui";
const LYRICS_STACK_CACHE_KEY = "museek.font.lyrics";

export type UiFontMode = "system" | "custom";
export type DesktopLyricsFontMode = "follow-app" | "custom";

export type FontPrefs = {
  version: 1;
  ui: { mode: UiFontMode; family: string | null };
  desktopLyrics: { mode: DesktopLyricsFontMode; family: string | null };
};

export const DEFAULT_FONT_PREFS: FontPrefs = {
  version: 1,
  ui: { mode: "system", family: null },
  desktopLyrics: { mode: "follow-app", family: null },
};

export function quoteFontFamily(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][-a-zA-Z0-9]*$/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function stackForFamily(family: string | null | undefined): string {
  const quoted = family ? quoteFontFamily(family) : "";
  return quoted ? `${quoted}, ${SYSTEM_FONT_STACK}` : SYSTEM_FONT_STACK;
}

export function resolveFontStacks(prefs: FontPrefs): {
  ui: string;
  lyrics: string;
} {
  const ui =
    prefs.ui.mode === "custom" ? stackForFamily(prefs.ui.family) : SYSTEM_FONT_STACK;
  const lyrics =
    prefs.desktopLyrics.mode === "custom" && prefs.desktopLyrics.family
      ? stackForFamily(prefs.desktopLyrics.family)
      : ui;
  return { ui, lyrics };
}

export function applyFontStacks(ui: string, lyrics: string): void {
  const root = document.documentElement;
  root.style.setProperty("--font-ui", ui || SYSTEM_FONT_STACK);
  root.style.setProperty("--font-lyrics", lyrics || ui || SYSTEM_FONT_STACK);
}

export function readFontStackCache(): { ui: string; lyrics: string } | null {
  try {
    const ui = localStorage.getItem(UI_STACK_CACHE_KEY);
    const lyrics = localStorage.getItem(LYRICS_STACK_CACHE_KEY);
    if (!ui || !lyrics) return null;
    return { ui, lyrics };
  } catch {
    return null;
  }
}

export function writeFontStackCache(ui: string, lyrics: string): void {
  try {
    localStorage.setItem(UI_STACK_CACHE_KEY, ui);
    localStorage.setItem(LYRICS_STACK_CACHE_KEY, lyrics);
  } catch {
    /* quota */
  }
}

function asMode(value: unknown, allowed: string[]): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function asFamily(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseFontPrefs(raw: unknown): FontPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FONT_PREFS };
  const data = raw as Record<string, unknown>;
  const ui = data.ui && typeof data.ui === "object" ? (data.ui as Record<string, unknown>) : {};
  const lyrics =
    data.desktopLyrics && typeof data.desktopLyrics === "object"
      ? (data.desktopLyrics as Record<string, unknown>)
      : {};
  return {
    version: 1,
    ui: {
      mode: (asMode(ui.mode, ["system", "custom"]) as UiFontMode) ?? "system",
      family: asFamily(ui.family),
    },
    desktopLyrics: {
      mode:
        (asMode(lyrics.mode, ["follow-app", "custom"]) as DesktopLyricsFontMode) ??
        "follow-app",
      family: asFamily(lyrics.family),
    },
  };
}

export async function loadFontPrefs(): Promise<FontPrefs> {
  const raw = await readData<unknown>(FONTS_FILE, DEFAULT_FONT_PREFS);
  return parseFontPrefs(raw);
}

export async function saveFontPrefs(prefs: FontPrefs): Promise<void> {
  await writeData(FONTS_FILE, prefs);
}

function normalizeFamilies(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || name.startsWith("@")) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

export async function listInstalledFontFamilies(): Promise<string[]> {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const native = await invoke<string[]>("list_font_families");
      if (Array.isArray(native) && native.length > 0) {
        return normalizeFamilies(native.filter((name) => typeof name === "string"));
      }
    } catch {
      /* fall through to Local Font Access */
    }
  }
  try {
    const query = (
      window as Window & {
        queryLocalFonts?: () => Promise<Array<{ family: string }>>;
      }
    ).queryLocalFonts;
    if (!query) return [];
    const fonts = await query();
    return normalizeFamilies(fonts.map((font) => font.family));
  } catch {
    return [];
  }
}

/** Drop a saved family only when we know the OS list and it is gone. */
export function dropMissingFamilies(
  prefs: FontPrefs,
  installed: string[],
): FontPrefs {
  if (installed.length === 0) return prefs;
  const known = new Set(installed.map((name) => name.toLowerCase()));
  const keep = (family: string | null) =>
    family && known.has(family.toLowerCase()) ? family : null;
  const uiFamily = keep(prefs.ui.family);
  const lyricsFamily = keep(prefs.desktopLyrics.family);
  return {
    version: 1,
    ui: {
      mode: prefs.ui.mode === "custom" && uiFamily ? "custom" : "system",
      family: uiFamily,
    },
    desktopLyrics: {
      mode:
        prefs.desktopLyrics.mode === "custom" && lyricsFamily
          ? "custom"
          : "follow-app",
      family: lyricsFamily,
    },
  };
}
