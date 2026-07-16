import { create } from "zustand"

export type ThemeMode = "light" | "dark" | "system"
export type Palette = "default" | "violet" | "blue" | "emerald" | "rose" | "amber"

export const PALETTES: { id: Palette; name: string; color: string }[] = [
  { id: "default", name: "石墨", color: "hsl(30 10% 14%)" },
  { id: "violet", name: "紫罗兰", color: "hsl(262 48% 52%)" },
  { id: "blue", name: "海蓝", color: "hsl(212 52% 48%)" },
  { id: "emerald", name: "翡翠", color: "hsl(158 42% 36%)" },
  { id: "rose", name: "玫瑰", color: "hsl(350 48% 48%)" },
  { id: "amber", name: "琥珀金", color: "hsl(34 68% 46%)" },
]

const MODE_KEY = "museek.theme.mode"
const PALETTE_KEY = "museek.theme.palette"

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
}

function applyToDom(mode: ThemeMode, palette: Palette) {
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark())
  const root = document.documentElement
  root.classList.toggle("dark", dark)
  if (palette === "default") root.removeAttribute("data-palette")
  else root.setAttribute("data-palette", palette)
}

function readMode(): ThemeMode {
  const v = localStorage.getItem(MODE_KEY)
  return v === "light" || v === "dark" || v === "system" ? v : "system"
}

function readPalette(): Palette {
  const v = localStorage.getItem(PALETTE_KEY) as Palette | null
  return v && PALETTES.some((p) => p.id === v) ? v : "default"
}

interface ThemeState {
  mode: ThemeMode
  palette: Palette
  setMode: (m: ThemeMode) => void
  setPalette: (p: Palette) => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readMode(),
  palette: readPalette(),
  setMode(mode) {
    localStorage.setItem(MODE_KEY, mode)
    set({ mode })
    applyToDom(mode, get().palette)
  },
  setPalette(palette) {
    localStorage.setItem(PALETTE_KEY, palette)
    set({ palette })
    applyToDom(get().mode, palette)
  },
}))

/**
 * Apply the saved theme to the DOM immediately (call before React renders to
 * avoid a flash) and keep "system" mode in sync with OS appearance changes.
 */
export function initTheme() {
  applyToDom(readMode(), readPalette())
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => {
      const { mode, palette } = useThemeStore.getState()
      if (mode === "system") applyToDom(mode, palette)
    })
}
