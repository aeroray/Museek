import type { MusicInfo } from "@/types/music";
import { fetchKgComments } from "./kg";
import { fetchKwComments } from "./kw";
import { fetchMgComments } from "./mg";
import { fetchTxComments } from "./tx";
import type { CommentPage, CommentSort } from "./types";
import { fetchWyComments } from "./wy";

export type { CommentPage, CommentSort, SongComment } from "./types";

const PAGE_SIZE = 20;

export async function fetchSongComments(
  song: MusicInfo,
  sort: CommentSort,
  page = 1,
  limit = PAGE_SIZE,
  signal?: AbortSignal,
): Promise<CommentPage> {
  if (song.source === "local") {
    return {
      source: "local",
      comments: [],
      total: 0,
      page,
      limit,
      maxPage: 1,
      unsupported: true,
    };
  }

  const songId = song.meta.songId;
  switch (song.source) {
    case "wy":
      return fetchWyComments(songId, sort, page, limit, signal);
    case "kw":
      return fetchKwComments(songId, sort, page, limit, signal);
    case "kg": {
      const hash = song.meta.hash;
      if (!hash) throw new Error("KuGou comments: missing hash");
      return fetchKgComments(hash, sort, page, limit, signal);
    }
    case "tx":
      return fetchTxComments(songId, sort, page, limit, signal);
    case "mg":
      return fetchMgComments(songId, sort, page, limit, signal);
    default:
      return {
        source: "local",
        comments: [],
        total: 0,
        page,
        limit,
        maxPage: 1,
        unsupported: true,
      };
  }
}
