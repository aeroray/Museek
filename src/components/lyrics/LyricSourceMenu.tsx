import { useEffect, useState } from "react"
import { ListMusic, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PLATFORM_ORDER } from "@/components/common/PlatformTabs"
import { applyLyricInfo } from "@/lib/lyric/loadLyric"
import {
  listPlatformLyrics,
  loadPlatformLyric,
  selectedLyricSource,
  type PlatformLyricOption,
} from "@/lib/lyrics/sources"
import { useT } from "@/lib/i18n"
import { usePlayerStore } from "@/stores/playerStore"
import type { MusicInfo, OnlineSource } from "@/types/music"

type Props = {
  song: MusicInfo | null
}

export function LyricSourceMenu({ song }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [applying, setApplying] = useState<OnlineSource | null>(null)
  const [options, setOptions] = useState<PlatformLyricOption[]>([])
  const songKey = song ? `${song.source}:${song.meta.songId}` : ""
  const selected = song ? selectedLyricSource(song) : null

  useEffect(() => {
    setOptions([])
    setApplying(null)
    setOpen(false)
  }, [songKey])

  useEffect(() => {
    if (!open || !song) return
    let cancelled = false
    setOptions(
      PLATFORM_ORDER.map((source) => ({
        source,
        status: "pending" as const,
        wordByWord: false,
      })),
    )
    void listPlatformLyrics(song, (next) => {
      if (!cancelled) setOptions(next)
    })
      .then((next) => {
        if (!cancelled) setOptions(next)
      })
    return () => {
      cancelled = true
    }
  }, [open, song, songKey])

  const pick = async (platform: OnlineSource) => {
    if (!song) return
    setApplying(platform)
    try {
      const info = await loadPlatformLyric(song, platform)
      if (!info) return
      const lines = await applyLyricInfo(song, info)
      usePlayerStore.setState({
        lyricLines: lines,
        lyricsLoading: false,
        ...(lines.length === 0 ? { showLyrics: false } : {}),
      })
      setOpen(false)
    } finally {
      setApplying(null)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground/55 hover:text-muted-foreground icon-hover-lyric-source"
          disabled={!song}
          title={t("lyrics.chooseSource")}
          aria-label={t("lyrics.chooseSource")}
        >
          <ListMusic size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="left"
        align="center"
        className="min-w-[15rem] max-h-80 overflow-y-auto"
      >
        {options.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-2.5 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            {t("lyrics.sourceLoading")}
          </div>
        ) : (
          options.map((opt) => {
            const ok = opt.status === "ok"
            const pending = opt.status === "pending"
            return (
              <DropdownMenuCheckboxItem
                key={opt.source}
                checked={selected === opt.source}
                showUncheckedIndicator
                disabled={!ok || applying !== null}
                onCheckedChange={() => {
                  if (!ok) return
                  void pick(opt.source)
                }}
              >
                <span className="flex w-full min-w-0 items-center justify-between gap-2">
                  <span className="truncate">{t(`platform.${opt.source}`)}</span>
                  {applying === opt.source ? (
                    <Loader2 size={13} className="shrink-0 animate-spin text-muted-foreground" />
                  ) : pending ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 size={11} className="animate-spin" />
                      {t("lyrics.sourceSearching")}
                    </span>
                  ) : ok ? (
                    opt.wordByWord ? (
                      <Badge
                        variant="secondary"
                        className="h-5 shrink-0 px-1.5 text-[10px] font-medium"
                      >
                        {t("lyrics.wordByWord")}
                      </Badge>
                    ) : (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {t("lyrics.plainLyric")}
                      </span>
                    )
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {opt.status === "error"
                        ? t("lyrics.fetchFailed")
                        : t("lyrics.noLyric")}
                    </span>
                  )}
                </span>
              </DropdownMenuCheckboxItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
