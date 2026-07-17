import { create } from "zustand"
import type { Source } from "@/types/music"

export interface Toast {
  id: number
  message: string
  variant?: "error" | "info" | "success"
  /** Optional action button: navigates to this route when clicked. */
  actionLabel?: string
  actionTo?: string
}

const SIDEBAR_KEY = "museek.sidebarCollapsed"
/** Default on — only "0" means hidden. Synced via configIO prefs. */
const TOP_BAR_LYRICS_KEY = "museek.topBarLyrics"

interface UiState {
  toast: Toast | null
  notify: (toast: Omit<Toast, "id">) => void
  clearToast: () => void
  // Modal shown when a download is attempted with no download location set yet.
  downloadLocationPromptOpen: boolean
  setDownloadLocationPrompt: (open: boolean) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  /** Show the live lyric line in the top bar (default true). */
  topBarLyrics: boolean
  toggleTopBarLyrics: () => void
  // Selected platform per page, kept in memory so switching tabs and coming back
  // preserves the choice (not persisted to disk — that's intentionally cheap).
  chartSource: Source
  chartBoardId: string
  playlistSource: Source
  setChartSource: (s: Source) => void
  setChartBoardId: (id: string) => void
  setPlaylistSource: (s: Source) => void
  // Which Favorites tab is active — kept here so leaving (e.g. opening a
  // favorited playlist) and coming back restores the same tab.
  favoritesTab: "songs" | "playlists"
  setFavoritesTab: (tab: "songs" | "playlists") => void
}

export const useUiStore = create<UiState>((set, get) => ({
  toast: null,
  notify: (toast) => set({ toast: { ...toast, id: Date.now() } }),
  clearToast: () => set({ toast: null }),
  downloadLocationPromptOpen: false,
  setDownloadLocationPrompt: (open) => set({ downloadLocationPromptOpen: open }),
  sidebarCollapsed: localStorage.getItem(SIDEBAR_KEY) === "1",
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0")
    set({ sidebarCollapsed: next })
  },
  topBarLyrics: localStorage.getItem(TOP_BAR_LYRICS_KEY) !== "0",
  toggleTopBarLyrics: () => {
    const next = !get().topBarLyrics
    localStorage.setItem(TOP_BAR_LYRICS_KEY, next ? "1" : "0")
    set({ topBarLyrics: next })
  },
  chartSource: "wy",
  chartBoardId: "",
  playlistSource: "wy",
  setChartSource: (s) => set({ chartSource: s }),
  setChartBoardId: (id) => set({ chartBoardId: id }),
  setPlaylistSource: (s) => set({ playlistSource: s }),
  favoritesTab: "songs",
  setFavoritesTab: (tab) => set({ favoritesTab: tab }),
}))
