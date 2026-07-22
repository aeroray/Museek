/**
 * NetEase (wy) platform module — crypto locality lives here; feature folders
 * re-export specific ops so existing import paths keep working.
 */
export { eapi, eapiParams } from "./eapi"
export { searchWangyi } from "@/lib/search/wy"
export { wyBoards, getWyBoardSongs } from "@/lib/charts/wy"
export { getWyHotSearch } from "@/lib/hotSearch/wy"
export {
  getWyPlaylistTags,
  getWyHotPlaylists,
  getWyPlaylistDetail,
} from "@/lib/playlists/wy"
export { getWyBuiltinMusicUrl } from "@/lib/playlists/wyUrl"
