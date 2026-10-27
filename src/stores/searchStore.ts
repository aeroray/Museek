import { create } from "zustand";
import { searchKuwo } from "@/lib/search/kuwo";
import { searchKugou } from "@/lib/search/kg";
import { searchTx } from "@/lib/search/tx";
import { searchWangyi } from "@/lib/search/wy";
import { searchMigu } from "@/lib/search/mg";
import { readData, writeData } from "@/lib/db";
import { createAsyncCache } from "@/lib/cache";
import { PLATFORM_ORDER } from "@/components/common/PlatformTabs";
import { searchPlaylists, PLAYLIST_SEARCH_LIMIT } from "@/lib/playlists/search";
import { searchAlbums } from "@/lib/albums";
import { ALBUM_SEARCH_LIMIT, mergeAlbums } from "@/lib/albums";
import type { Album } from "@/lib/albums";
import type { Playlist } from "@/lib/playlists";
import { mergePlaylists } from "@/lib/playlists";
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

/**
 * Dedupe songs by id across pages, reporting how many rows were actually new.
 *
 * The `added` count is what tells the caller whether another page can exist: a
 * later page that contributes nothing means the source has run dry, or is
 * ignoring `page` and replaying the same rows. Same contract as `mergePlaylists`.
 */
function mergeSongsById(
  prev: MusicInfo[],
  next: MusicInfo[],
): { list: MusicInfo[]; added: number } {
  const seen = new Set(prev.map((s) => s.id));
  const list = [...prev];
  let added = 0;
  for (const song of next) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    list.push(song);
    added++;
  }
  return { list, added };
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
        const list = await searchPlaylists(
          platform,
          q,
          page,
          PLAYLIST_SEARCH_LIMIT,
        );
        if (
          get().searchGeneration !== generation ||
          get().scope !== scope ||
          get().platform !== platform
        )
          return;
        set((s) => {
          // Page 1 replaces (a new query); later pages append.
          const { list: merged, added } = mergePlaylists(
            page === 1 ? [] : s.playlistResults,
            list,
          );
          // A full page implies there may be another. From page 2 on it must
          // also have contributed something new: a platform that ignores `page`
          // replays the same rows, and offering "load more" there would be a
          // button that never changes anything.
          const full = list.length >= PLAYLIST_SEARCH_LIMIT;
          const more = page === 1 ? full : full && added > 0;
          return {
            playlistResults: merged,
            albumResults: [],
            isLoading: false,
            page,
            allPage: more ? page + 1 : page,
          };
        });
        get().addToHistory(q);
        return;
      }
      if (scope === "album") {
        const list = await searchAlbums(platform, q, page, ALBUM_SEARCH_LIMIT);
        if (
          get().searchGeneration !== generation ||
          get().scope !== scope ||
          get().platform !== platform
        )
          return;
        set((s) => {
          // Page 1 replaces (a new query); later pages append.
          const { list: merged, added } = mergeAlbums(
            page === 1 ? [] : s.albumResults,
            list,
          );
          const full = list.length >= ALBUM_SEARCH_LIMIT;
          const more = page === 1 ? full : full && added > 0;
          return {
            albumResults: merged,
            playlistResults: [],
            isLoading: false,
            page,
            allPage: more ? page + 1 : page,
          };
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
      set((s) => {
        // Page 1 replaces (a new query); later pages append.
        const { list: merged, added } = mergeSongsById(
          page === 1 ? [] : s.results,
          result.list,
        );
        // Same rule the playlist/album branches use: from page 2 on a page must
        // also have contributed something new, otherwise a platform that ignores
        // `page` replays the same rows forever.
        //
        // This used to trust the source's `allPage` verbatim, which broke song
        // search after page 2 on every source that only reports a total on the
        // first page. NetEase is one: `wy.ts` sends `total: page === 1`, so page
        // 2 comes back with totalCount 0 → allPage 0 → `hasMore` false, and
        // infinite scroll dead-ended at 60 of 300 results.
        const full = result.list.length >= result.limit;
        const more = page === 1 ? full : full && added > 0;
        return {
          results: merged,
          // Keep a total learned on page 1: later pages legitimately omit it.
          total: result.total > 0 ? result.total : s.total,
          page,
          // Never let a later page's missing total erase a known page count, and
          // fall back to the "there is at least one more" rule when the source
          // reports none. `page` means "stop here"; `page + 1` means "ask again".
          allPage: Math.max(result.allPage, more ? page + 1 : page),
          isLoading: false,
        };
      });
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
