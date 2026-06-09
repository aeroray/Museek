import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { RootLayout } from "@/components/layout/RootLayout"
import { Search } from "@/routes/Search"
import { HotPlaylists } from "@/routes/HotPlaylists"
import { Library } from "@/routes/Library"
import { Favorites } from "@/routes/Favorites"
import { Playlist } from "@/routes/Playlist"
import { Downloads } from "@/routes/Downloads"
import { Settings } from "@/routes/Settings"
import { useSourceStore } from "@/stores/sourceStore"
import { usePlaylistStore } from "@/stores/playlistStore"
import { useSearchStore } from "@/stores/searchStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { enforceLimit } from "@/lib/mediaCache"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CloseGuard } from "@/components/CloseGuard"

function AppInit() {
  const { loadFromDisk: loadSources } = useSourceStore()
  const { loadFromDisk: loadPlaylists } = usePlaylistStore()
  const { loadHistory } = useSearchStore()
  const { loadFromDisk: loadSettings } = useSettingsStore()

  useEffect(() => {
    loadSources()
    loadPlaylists()
    loadHistory()
    // After settings load, trim the cache in case the limit was lowered.
    loadSettings().then(() => {
      enforceLimit(useSettingsStore.getState().maxCacheMB * 1024 * 1024)
    })
  }, [loadSources, loadPlaylists, loadHistory, loadSettings])

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
            <Route path="/playlist/:id" element={<Playlist />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
