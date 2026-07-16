import { useState, useEffect } from "react"
import { TrendingUp, RotateCw, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { TrackRow } from "@/components/common/TrackRow"
import { ALL_BOARDS, getBoardSongs } from "@/lib/charts"
import { PlatformTabs } from "@/components/common/PlatformTabs"
import { usePlayerStore } from "@/stores/playerStore"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"
import type { MusicInfo, Source } from "@/types/music"
import { cn } from "@/lib/utils"

export function Library() {
  const t = useT()
  const playAll = usePlayerStore((s) => s.playAll)
  // Platform + board live in the UI store so the choice survives leaving and
  // returning to this page. An empty stored board falls back to the platform's first.
  const source = useUiStore((s) => s.chartSource)
  const setChartSource = useUiStore((s) => s.setChartSource)
  const storedBoardId = useUiStore((s) => s.chartBoardId)
  const setChartBoardId = useUiStore((s) => s.setChartBoardId)
  const [songs, setSongs] = useState<MusicInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const boards = ALL_BOARDS[source]
  const boardId = storedBoardId || boards[0]?.id || ""

  // Switch platform + its first board together (one batched update) so the fetch
  // effect below fires exactly once — avoids a wasted request for the old board.
  const selectSource = (s: Source) => {
    if (s === source) return
    setChartSource(s)
    setChartBoardId(ALL_BOARDS[s][0]?.id ?? "")
  }

  // Fetch the selected board's songs.
  useEffect(() => {
    if (!boardId) {
      setSongs([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    getBoardSongs(source, boardId)
      .then((list) => {
        if (!cancelled) {
          setSongs(list)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError((e as Error).message)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [source, boardId, nonce])

  const retry = () => setNonce((n) => n + 1)

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} />
          <h2 className="text-lg font-semibold">{t("library.title")}</h2>
          {songs.length > 0 && !loading && !error && (
            <Button variant="secondary" size="sm" className="h-8 ml-auto" onClick={() => playAll(songs)}>
              <Play size={14} className="mr-1.5" fill="currentColor" strokeWidth={0} />
              {t("common.playAll")}
            </Button>
          )}
        </div>

        {/* Platform selector */}
        <PlatformTabs value={source} onChange={selectSource} />

        {/* Board selector — the active board is highlighted in the theme color */}
        <div className="flex gap-1.5 flex-wrap">
          {boards.map((b) => {
            const active = boardId === b.id
            return (
              <Button
                key={b.id}
                variant={active ? "default" : "ghost"}
                size="sm"
                className={cn("h-7 px-3 text-xs rounded-full", active ? "font-medium shadow-sm" : "text-muted-foreground")}
                onClick={() => setChartBoardId(b.id)}
              >
                {b.name}
              </Button>
            )
          })}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 py-2">
          {loading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton className="h-4 w-4 shrink-0" />
                  <Skeleton className="h-10 w-10 rounded-md shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3 px-4">
              <p className="text-sm text-destructive">{t("library.loadFailed", { msg: error })}</p>
              <Button variant="outline" size="sm" onClick={retry}>
                <RotateCw size={14} className="mr-1.5" />
                {t("common.retry")}
              </Button>
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">{t("library.empty")}</div>
          ) : (
            songs.map((song, i) => <TrackRow key={song.id} song={song} rank={i + 1} />)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
