import { useEffect } from "react"
import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { PlayerBar } from "@/components/player/PlayerBar"
import { PlayQueue } from "@/components/queue/PlayQueue"
import { LyricsPanel } from "@/components/lyrics/LyricsPanel"
import { MiniPlayer } from "@/components/miniPlayer/MiniPlayer"
import { Toaster } from "@/components/ui/toaster"
import { DownloadLocationDialog } from "@/components/DownloadLocationDialog"
import { isMacOs } from "@/lib/os"
import { revealOrHideOnLaunch } from "@/lib/showWindow"
import { usePlayerStore } from "@/stores/playerStore"
import { cn } from "@/lib/utils"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Keep CSS window chrome in sync with OS + maximize state; reveal window when ready. */
function useWindowChrome() {
  useEffect(() => {
    // macOS Overlay windows use system corner radius; Windows/Linux stay CSS-clipped.
    // Mini mode overrides this via data-mini (see index.css).
    if (!document.documentElement.dataset.mini) {
      document.documentElement.dataset.os = isMacOs() ? "macos" : "other"
    }

    // Windows: show after first paint (avoids decorated/white flash), unless
    // silent login autostart — then stay in the tray.
    // macOS: already shown from Rust when not silent; this ensures focus or hide.
    void revealOrHideOnLaunch()

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
  const miniMode = usePlayerStore((s) => s.miniMode)
  const miniMorphing = usePlayerStore((s) => s.miniMorphing)
  const miniPeek = usePlayerStore((s) => s.miniPeek)

  return (
    <div className="app-shell">
      <div
        className={cn(
          "relative flex h-full flex-col",
          miniPeek ? "overflow-visible bg-transparent" : "overflow-hidden bg-background",
          "transition-opacity duration-150 ease-out",
          miniMorphing && "mini-morph-veil",
        )}
      >
        {miniMode ? (
          <MiniPlayer />
        ) : (
          <>
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <Sidebar />
              <main className="app-ambient flex min-w-0 flex-1 flex-col overflow-hidden">
                <TopBar />
                <div className="flex min-h-0 flex-1 flex-col">
                  <Outlet />
                </div>
              </main>
            </div>
            <PlayerBar />
            <PlayQueue />
            <LyricsPanel />
          </>
        )}
        <Toaster />
        <DownloadLocationDialog />
      </div>
    </div>
  )
}
