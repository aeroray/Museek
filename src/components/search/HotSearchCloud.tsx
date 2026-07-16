import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { getHotSearch, type HotKeyword } from "@/lib/hotSearch"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Source } from "@/types/music"

type HeatTier = {
  size: string
  weight: string
  /** CSS variable name for the heat colour (see index.css --heat-*) */
  heat: "--heat-1" | "--heat-2" | "--heat-3" | "--heat-4" | "--heat-5"
  opacity: string
}

/**
 * Heat ladder: rose → coral → amber → teal → slate.
 * Size + weight reinforce rank; colour carries the “temperature” metaphor.
 */
function tierOf(rank: number): HeatTier {
  if (rank < 3) return { size: "text-3xl", weight: "font-semibold", heat: "--heat-1", opacity: "opacity-100" }
  if (rank < 7) return { size: "text-2xl", weight: "font-semibold", heat: "--heat-2", opacity: "opacity-95" }
  if (rank < 12) return { size: "text-lg", weight: "font-medium", heat: "--heat-3", opacity: "opacity-90" }
  if (rank < 18) return { size: "text-base", weight: "font-medium", heat: "--heat-4", opacity: "opacity-85" }
  return { size: "text-sm", weight: "font-normal", heat: "--heat-5", opacity: "opacity-70" }
}

export function HotSearchCloud({
  platform,
  platformLabel,
  onSelect,
}: {
  platform: Source
  platformLabel: string
  onSelect: (keyword: string) => void
}) {
  const t = useT()
  const [items, setItems] = useState<HotKeyword[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    getHotSearch(platform)
      .then((list) => {
        if (!alive) return
        setItems(list)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setFailed(true)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [platform])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-12">
        <div className="mb-10 text-center space-y-3">
          <p className="text-sm font-medium tracking-tight text-muted-foreground">
            {t("search.hotTitle", { platform: platformLabel })}
          </p>
          {/* Compact heat legend — readable without competing with the cloud */}
          <div
            className="flex items-center justify-center gap-1.5"
            aria-hidden
            title="热度由高到低"
          >
            {(["--heat-1", "--heat-2", "--heat-3", "--heat-4", "--heat-5"] as const).map((h, i) => (
              <span
                key={h}
                className="h-1 rounded-full transition-opacity"
                style={{
                  width: `${18 - i * 2}px`,
                  backgroundColor: `hsl(var(${h}))`,
                  opacity: 1 - i * 0.08,
                }}
              />
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : failed || items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("search.hotEmpty")}</p>
        ) : (
          <div className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-4">
            {items.map((it, index) => {
              const tier = tierOf(it.rank)
              return (
                <button
                  key={it.keyword}
                  onClick={() => onSelect(it.keyword)}
                  title={it.keyword}
                  style={{
                    color: `hsl(var(${tier.heat}))`,
                    animationDelay: `${Math.min(index, 20) * 28}ms`,
                  }}
                  className={cn(
                    "hot-cloud-word leading-none tracking-tight will-change-transform transform-gpu",
                    "transition-[transform,filter,opacity] duration-200 ease-out",
                    "hover:scale-110 hover:brightness-110 hover:opacity-100",
                    "active:scale-95",
                    tier.size,
                    tier.weight,
                    tier.opacity,
                  )}
                >
                  {it.keyword}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
