import type { MusicInfo, Source } from "@/types/music"
import { createAsyncCache } from "@/lib/cache"
import { kwBoards, getKwBoardSongs } from "./kw"
import { kgBoards, getKgBoardSongs } from "./kg"
import { txBoards, getTxBoardSongs } from "./tx"
import { wyBoards, getWyBoardSongs } from "./wy"
import { mgBoards, getMgBoardSongs } from "./mg"

export interface ChartBoard {
  id: string
  name: string
}

// Static chart/leaderboard metadata per platform.
export const ALL_BOARDS: Record<Source, ChartBoard[]> = {
  kw: kwBoards,
  kg: kgBoards,
  tx: txBoards,
  wy: wyBoards,
  mg: mgBoards,
}

function fetchBoardSongs(source: Source, boardId: string, page: number): Promise<MusicInfo[]> {
  switch (source) {
    case "kw":
      return getKwBoardSongs(boardId, page)
    case "kg":
      return getKgBoardSongs(boardId, page)
    case "tx":
      return getTxBoardSongs(boardId, page)
    case "wy":
      return getWyBoardSongs(boardId, page)
    case "mg":
      return getMgBoardSongs(boardId, page)
    default:
      return Promise.resolve([])
  }
}

// Charts change slowly — cache board songs for 5 minutes so revisiting a board
// (or re-selecting a platform) is instant and doesn't re-hit the API.
const boardCache = createAsyncCache<MusicInfo[]>(5 * 60_000)

/**
 * Fetch the songs of a chart board for the given platform (cached).
 */
export function getBoardSongs(
  source: Source,
  boardId: string,
  page = 1
): Promise<MusicInfo[]> {
  return boardCache(`${source}:${boardId}:${page}`, () => fetchBoardSongs(source, boardId, page))
}
