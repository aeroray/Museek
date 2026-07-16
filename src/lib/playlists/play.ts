import { getPlaylistDetail, type Playlist } from "./index"
import { usePlayerStore } from "@/stores/playerStore"
import { notify } from "@/lib/notify"
import { t } from "@/lib/i18n"

/**
 * Fetch a playlist's songs, replace the play queue with them, and start playing
 * from the top. Used by the play button on playlist cards (Playlists / Search /
 * Favorites) so "play whole list" is one click without opening the detail.
 */
export async function playPlaylist(pl: Playlist): Promise<void> {
  try {
    const songs = await getPlaylistDetail(pl.source, pl.id)
    if (!songs.length) {
      notify({ message: t("hotPlaylists.playlistEmpty"), variant: "info" })
      return
    }
    usePlayerStore.getState().playAll(songs)
  } catch (e) {
    notify({ message: t("hotPlaylists.playFailed", { msg: (e as Error).message }), variant: "error" })
  }
}
