import type { Album } from "./index"
import { playAllSongs } from "@/lib/playback/playAllPort"
import { notify } from "@/lib/notify"
import { t } from "@/lib/i18n"
import { loadFavoriteDetail } from "@/lib/playlists/favoriteCache"

/** Fetch album tracks and replace the queue (same UX as playPlaylist). */
export async function playAlbum(album: Album): Promise<void> {
  try {
    const { songs } = await loadFavoriteDetail("album", album.source, album.id)
    if (!songs.length) {
      notify({ message: t("hotPlaylists.playlistEmpty"), variant: "info" })
      return
    }
    playAllSongs(songs)
  } catch (e) {
    notify({
      message: t("hotPlaylists.playFailed", { msg: (e as Error).message }),
      variant: "error",
    })
  }
}
