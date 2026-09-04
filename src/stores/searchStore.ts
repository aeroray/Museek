import { create } from "zustand";
import { searchKuwo } from "@/lib/search/kuwo";
import { searchKugou } from "@/lib/search/kg";
import { searchTx } from "@/lib/search/tx";
import { searchWangyi } from "@/lib/search/wy";
import { searchMigu } from "@/lib/search/mg";
import { readData, writeData } from "@/lib/db";
import { createAsyncCache } from "@/lib/cache";
import { PLATFORM_ORDER } from "@/components/common/PlatformTabs";
import { searchPlaylists } from "@/lib/playlists/search";
import { searchAlbums } from "@/lib/albums";
import type { Album } from "@/lib/albums";
import type { Playlist } from "@/lib/playlists";
import type { MusicInfo, OnlineSource, SearchResult } from "@/types/music";

export type SearchScope = "song" | "album" | "playlist";

type SearchFn = (
  query: string,
  page?: number,
  limit?: number,
) => Promise<SearchResult>;

const searchFns: Record<OnlineSource, SearchFn> = {
  kw: searchKuwo,
  kg: searchKugou,
  tx: searchTx,
  wy: searchWangyi,
  mg: searchMigu,
};

// Cache search responses for 3 minutes, keyed by platform+query+page. Repeating
// a query, paging back, or toggling platforms back and forth then reuses the
// result instead of re-hitting the API (and de-dupes rapid identical calls).
const searchCache = createAsyncCache<SearchResult>(3 * 60_000);

function mergeSongsById(prev: MusicInfo[], next: MusicInfo[]): MusicInfo[] {
  const seen = new Set(prev.map((s) => s.id));
  const out = [...prev];
  for (const song of next) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    out.push(song);
  }
  return out;
}

interface SearchState {
  searchGeneration: number;
  query: string;
  platform: OnlineSource;
  scope: SearchScope;
  results: MusicInfo[];
  playlistResults: Playlist[];
  albumResults: Album[];
  total: number;
  page: number;
  allPage: number;
  isLoading: boolean;
  error: string | null;
  searchHistory: string[];

  search: (query: string, page?: number) => Promise<void>;
  setPlatform: (platform: OnlineSource) => void;
  setScope: (scope: SearchScope) => void;
  /** Jump straight to a song search on a specific platform (e.g. from the player
   *  bar's "search this song on another platform" for VIP tracks). */
  searchOnPlatform: (platform: OnlineSource, query: string) => void;
  clearResults: () => void;
  addToHistory: (query: string) => void;
  removeHistoryItem: (query: string) => void;
  clearHistory: () => void;
  loadHistory: () => Promise<void>;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  searchGeneration: 0,
  query: "",
  // Fixed order; the first platform (NetEase) is the default. Not persisted.
  platform: PLATFORM_ORDER[0],
  scope: "song",
  results: [],
  playlistResults: [],
  albumResults: [],
  total: 0,
  page: 1,
  allPage: 1,
  isLoading: false,
  error: null,
  searchHistory: [],

  async search(query, page = 1) {
    const q = query.trim();
    if (!q) return;
    const generation = get().searchGeneration + 1;
    const { platform, scope } = get();
    set((s) => ({
      searchGeneration: generation,
      isLoading: true,
      error: null,
      query: q,
      results: scope === "song" && page > 1 ? s.results : [],
      playlistResults:
        scope === "playlist" && page > 1 ? s.playlistResults : [],
      albumResults: scope === "album" && page > 1 ? s.albumResults : [],
    }));
    try {
      if (scope === "playlist") {
        const list = await searchPlaylists(platform, q, page);
        if (
          get().searchGeneration !== generation ||
          get().scope !== scope ||
          get().platform !== platform
        )
          return;
        set({
          playlistResults: list,
          albumResults: [],
          isLoading: false,
          page,
          allPage: 1,
        });
        get().addToHistory(q);
        return;
      }
      if (scope === "album") {
        const list = await searchAlbums(platform, q, page);
        if (
          get().searchGeneration !== generation ||
          get().scope !== scope ||
          get().platform !== platform
        )
          return;
        set({
          albumResults: list,
          playlistResults: [],
          isLoading: false,
          page,
          allPage: 1,
        });
        get().addToHistory(q);
        return;
      }
      const result = await searchCache(`${platform}:${q}:${page}`, () =>
        searchFns[platform](q, page),
      );
      if (
        get().searchGeneration !== generation ||
        get().scope !== scope ||
        get().platform !== platform
      )
        return;
      set((s) => ({
        results:
          page === 1 ? result.list : mergeSongsById(s.results, result.list),
        total: result.total,
        page: result.page,
        allPage: result.allPage,
        isLoading: false,
      }));
      get().addToHistory(q);
    } catch (err) {
      if (
        get().searchGeneration !== generation ||
        get().scope !== scope ||
        get().platform !== platform
      )
        return;
      set((s) => ({
        isLoading: false,
        error: (err as Error).message,
        results: page === 1 ? [] : s.results,
      }));
    }
  },

  setPlatform(platform) {
    if (platform === get().platform) return;
    const searchGeneration = get().searchGeneration + 1;
    set({
      searchGeneration,
      platform,
      results: [],
      playlistResults: [],
      albumResults: [],
      page: 1,
      allPage: 1,
      isLoading: false,
      error: null,
    });
    // Re-run the current query against the newly selected platform.
    const q = get().query;
    if (q.trim()) get().search(q, 1);
  },

  setScope(scope) {
    if (scope === get().scope) return;
    const searchGeneration = get().searchGeneration + 1;
    set({
      searchGeneration,
      scope,
      results: [],
      playlistResults: [],
      albumResults: [],
      page: 1,
      allPage: 1,
      isLoading: false,
      error: null,
    });
    const q = get().query;
    if (q.trim()) get().search(q, 1);
  },

  searchOnPlatform(platform, query) {
    // Set platform + song scope directly (avoid setPlatform's auto re-search of
    // the OLD query), then search the new query against it.
    const searchGeneration = get().searchGeneration + 1;
    set({
      searchGeneration,
      platform,
      scope: "song",
      results: [],
      playlistResults: [],
      albumResults: [],
      page: 1,
      allPage: 1,
      isLoading: false,
      error: null,
    });
    if (query.trim()) get().search(query, 1);
  },

  clearResults() {
    const searchGeneration = get().searchGeneration + 1;
    set({
      searchGeneration,
      results: [],
      playlistResults: [],
      albumResults: [],
      total: 0,
      page: 1,
      allPage: 1,
      isLoading: false,
      query: "",
      error: null,
    });
  },

  addToHistory(query) {
    const history = [
      query,
      ...get().searchHistory.filter((h) => h !== query),
    ].slice(0, 20);
    set({ searchHistory: history });
    writeData("searchHistory.json", history);
  },

  removeHistoryItem(query) {
    const history = get().searchHistory.filter((h) => h !== query);
    set({ searchHistory: history });
    writeData("searchHistory.json", history);
  },

  clearHistory() {
    set({ searchHistory: [] });
    writeData("searchHistory.json", []);
  },

  async loadHistory() {
    const history = await readData<string[]>("searchHistory.json", []);
    if (history.length) set({ searchHistory: history });
  },
}));
