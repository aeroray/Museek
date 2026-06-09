import { create } from "zustand"
import { searchKuwo } from "@/lib/search/kuwo"
import { searchKugou } from "@/lib/search/kg"
import { searchTx } from "@/lib/search/tx"
import { searchWangyi } from "@/lib/search/wy"
import { searchMigu } from "@/lib/search/mg"
import { readData, writeData } from "@/lib/db"
import { createAsyncCache } from "@/lib/cache"
import { PLATFORM_ORDER } from "@/components/common/PlatformTabs"
import { searchPlaylists } from "@/lib/playlists/search"
import type { Playlist } from "@/lib/playlists"
import type { MusicInfo, SearchResult, Source } from "@/types/music"

export type SearchScope = "song" | "playlist"

type SearchFn = (query: string, page?: number, limit?: number) => Promise<SearchResult>

const searchFns: Record<Source, SearchFn> = {
  kw: searchKuwo,
  kg: searchKugou,
  tx: searchTx,
  wy: searchWangyi,
  mg: searchMigu,
}

// Cache search responses for 3 minutes, keyed by platform+query+page. Repeating
// a query, paging back, or toggling platforms back and forth then reuses the
// result instead of re-hitting the API (and de-dupes rapid identical calls).
const searchCache = createAsyncCache<SearchResult>(3 * 60_000)

interface SearchState {
  query: string
  platform: Source
  scope: SearchScope
  results: MusicInfo[]
  playlistResults: Playlist[]
  total: number
  page: number
  allPage: number
  isLoading: boolean
  error: string | null
  searchHistory: string[]

  search: (query: string, page?: number) => Promise<void>
  setPlatform: (platform: Source) => void
  setScope: (scope: SearchScope) => void
  /** Jump straight to a song search on a specific platform (e.g. from the player
   *  bar's "search this song on another platform" for VIP tracks). */
  searchOnPlatform: (platform: Source, query: string) => void
  clearResults: () => void
  addToHistory: (query: string) => void
  removeHistoryItem: (query: string) => void
  clearHistory: () => void
  loadHistory: () => Promise<void>
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  // Fixed order; the first platform (NetEase) is the default. Not persisted.
  platform: PLATFORM_ORDER[0],
  scope: "song",
  results: [],
  playlistResults: [],
  total: 0,
  page: 1,
  allPage: 1,
  isLoading: false,
  error: null,
  searchHistory: [],

  async search(query, page = 1) {
    if (!query.trim()) return
    const { platform, scope } = get()
    set({ isLoading: true, error: null, query })
    try {
      const q = query.trim()
      if (scope === "playlist") {
        const list = await searchPlaylists(platform, q, page)
        set({ playlistResults: list, isLoading: false, page, allPage: 1 })
        get().addToHistory(q)
        return
      }
      const result = await searchCache(`${platform}:${q}:${page}`, () => searchFns[platform](q, page))
      set((s) => ({
        results: page === 1 ? result.list : [...s.results, ...result.list],
        total: result.total,
        page: result.page,
        allPage: result.allPage,
        isLoading: false,
      }))
      get().addToHistory(q)
    } catch (err) {
      set((s) => ({
        isLoading: false,
        error: (err as Error).message,
        results: page === 1 ? [] : s.results,
      }))
    }
  },

  setPlatform(platform) {
    if (platform === get().platform) return
    set({ platform })
    // Re-run the current query against the newly selected platform.
    const q = get().query
    if (q.trim()) get().search(q, 1)
  },

  setScope(scope) {
    if (scope === get().scope) return
    set({ scope, results: [], playlistResults: [], page: 1, allPage: 1, error: null })
    const q = get().query
    if (q.trim()) get().search(q, 1)
  },

  searchOnPlatform(platform, query) {
    // Set platform + song scope directly (avoid setPlatform's auto re-search of
    // the OLD query), then search the new query against it.
    set({ platform, scope: "song" })
    if (query.trim()) get().search(query, 1)
  },

  clearResults() {
    set({ results: [], total: 0, page: 1, allPage: 1, query: "" })
  },

  addToHistory(query) {
    const history = [query, ...get().searchHistory.filter((h) => h !== query)].slice(0, 20)
    set({ searchHistory: history })
    writeData("searchHistory.json", history)
  },

  removeHistoryItem(query) {
    const history = get().searchHistory.filter((h) => h !== query)
    set({ searchHistory: history })
    writeData("searchHistory.json", history)
  },

  clearHistory() {
    set({ searchHistory: [] })
    writeData("searchHistory.json", [])
  },

  async loadHistory() {
    const history = await readData<string[]>("searchHistory.json", [])
    if (history.length) set({ searchHistory: history })
  },
}))
