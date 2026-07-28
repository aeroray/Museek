import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDownloadStore } from "@/stores/downloadStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { MusicInfo, Quality } from "@/types/music"

/**
 * Quality picker that queues a download for an online song.
 * Hidden for local files (already on disk).
 */
export function DownloadSongButton({
  song,
  className,
  side = "top",
  align = "end",
}: {
  song: MusicInfo | null | undefined
  className?: string
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
}) {
  const addTask = useDownloadStore((s) => s.addTask)
  const t = useT()

  if (!song || song.source === "local") return null

  const qualities = song.meta.qualitys?.length
    ? song.meta.qualitys
    : [{ type: "128k" as Quality, size: null }]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("shrink-0 icon-hover-download", className)}
          title={t("common.download")}
          disabled={!song}
        >
          <Download size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="min-w-[11rem]">
        {qualities.map((q) => (
          <DropdownMenuItem
            key={q.type}
            onClick={() => addTask(song, q.type as Quality)}
            className="justify-between gap-8"
          >
            <span>{t("search.download", { quality: q.type })}</span>
            {q.size && <span className="text-muted-foreground text-xs tabular-nums">{q.size}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
