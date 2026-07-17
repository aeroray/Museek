import { useEffect } from "react"
import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { PlayerBar } from "@/components/player/PlayerBar"
import { PlayQueue } from "@/components/queue/PlayQueue"
import { LyricsPanel } from "@/components/lyrics/LyricsPanel"
import { Toaster } from "@/components/ui/toaster"
import { DownloadLocationDialog } from "@/components/DownloadLocationDialog"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Keep CSS window chrome (radius / shadow) in sync with maximize state. */
function useWindowChrome() {
  useEffect(() => {
    if (!isTauri) return
    let unlisten: (() => void) | undefined
    let cancelled = false

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      const win = getCurrentWindow()
      const sync = async () => {
        const maximized = await win.isMaximized()
        const fullscreen = await win.isFullscreen()
        document.documentElement.dataset.maximized = maximized || fullscreen ? "true" : "false"
      }
      await sync()
      if (cancelled) return
      unlisten = await win.onResized(() => {
        void sync()
      })
    })()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}

export function RootLayout() {
  useWindowChrome()

  return (
    <div className="app-shell">
      <div className="relative flex flex-col h-full overflow-hidden bg-background">
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden flex flex-col app-ambient min-w-0">
            <TopBar />
            <div className="flex-1 min-h-0 flex flex-col">
              <Outlet />
            </div>
          </main>
        </div>
        <PlayerBar />
        <PlayQueue />
        <LyricsPanel />
        <Toaster />
        <DownloadLocationDialog />
      </div>
    </div>
  )
}
