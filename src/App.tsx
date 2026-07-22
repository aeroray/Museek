import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { RootLayout } from "@/components/layout/RootLayout"
import { Search } from "@/routes/Search"
import { HotPlaylists } from "@/routes/HotPlaylists"
import { Library } from "@/routes/Library"
import { Favorites } from "@/routes/Favorites"
import { LocalMusic } from "@/routes/LocalMusic"
import { Playlist } from "@/routes/Playlist"
import { Downloads } from "@/routes/Downloads"
import { Settings } from "@/routes/Settings"
import { useSourceStore } from "@/stores/sourceStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useSearchStore } from "@/stores/searchStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { useUiStore } from "@/stores/uiStore"
import { usePlayerStore } from "@/stores/playerStore"
import { bindNotify, bindDownloadLocationPrompt } from "@/lib/notify"
import { bindPlayAll } from "@/lib/playback/playAllPort"
import { enforceLimit } from "@/lib/mediaCache"
import { setTrayVisible } from "@/lib/power"
import { maybeAutoImport } from "@/lib/sync"
import { useGlobalShortcuts } from "@/lib/shortcuts"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CloseGuard } from "@/components/CloseGuard"
import { useDownloadStore } from "@/stores/downloadStore"
import { useLocalMusicStore } from "@/stores/localMusicStore"
import { useUpdateStore } from "@/stores/updateStore"

// Wire UI ports once — stores/lib never import uiStore.
bindNotify((payload) => useUiStore.getState().notify(payload))
bindDownloadLocationPrompt(() => useUiStore.getState().setDownloadLocationPrompt(true))
bindPlayAll((songs) => usePlayerStore.getState().playAll(songs))

function AppInit() {
  const { loadFromDisk: loadSources } = useSourceStore()
  const { loadFromDisk: loadPlaylists } = usePlaylistStore()
  const { loadHistory } = useSearchStore()
  const { loadFromDisk: loadSettings } = useSettingsStore()
  const { loadFromDisk: loadDownloads } = useDownloadStore()
  const { loadFromDisk: loadLocalMusic } = useLocalMusicStore()

  // Global media keyboard shortcuts (space / arrows / M / L), gated by settings.
  useGlobalShortcuts()

  useEffect(() => {
    // First: silent sync-folder import. If a newer config is found it applies it
    // and reloads, so skip the rest of init in that case.
    maybeAutoImport().then((reloading) => {
      if (reloading) return
      loadSources()
      loadPlaylists()
      loadHistory()
      // After settings load, trim the cache in case the limit was lowered.
      // Downloads need downloadDir from settings before unfinished tasks resume.
      loadSettings().then(() => {
        const s = useSettingsStore.getState()
        enforceLimit(s.maxCacheMB * 1024 * 1024)
        // Show the tray icon only if the saved close-behavior is "hide to tray".
        setTrayVisible(s.closeBehavior === "tray")
        void loadDownloads()
        void loadLocalMusic()
      })
    })

    // One automatic update check per launch (after first paint).
    const timer = window.setTimeout(() => {
      void useUpdateStore.getState().checkOnStartup()
    }, 2500)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export default function App() {
  return (
    <TooltipProvider>
      <CloseGuard />
      <BrowserRouter>
        <AppInit />
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<Navigate to="/search" replace />} />
            <Route path="/search" element={<Search />} />
            <Route path="/hot-playlists" element={<HotPlaylists />} />
            <Route path="/library" element={<Library />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/local" element={<LocalMusic />} />
            <Route path="/playlist/:id" element={<Playlist />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
