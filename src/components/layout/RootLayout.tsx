import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { TopBar } from "./TopBar"
import { PlayerBar } from "@/components/player/PlayerBar"
import { PlayQueue } from "@/components/queue/PlayQueue"
import { LyricsPanel } from "@/components/lyrics/LyricsPanel"
import { Toaster } from "@/components/ui/toaster"
import { DownloadLocationDialog } from "@/components/DownloadLocationDialog"

export function RootLayout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
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
  )
}
