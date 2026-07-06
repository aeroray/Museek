import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { getHotSearch, type HotKeyword } from "@/lib/hotSearch"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Source } from "@/types/music"

// Depth via size + weight + colour temperature + opacity, all keyed to rank
// (0 = hottest). The strong contrast between tiers gives the layered "cloud"
// feel instead of a flat, evenly-sized grid.
function tierOf(rank: number): { size: string; weight: string; color: string; opacity: string } {
  if (rank < 3) return { size: "text-3xl", weight: "font-bold", color: "text-rose-500", opacity: "opacity-100" }
  if (rank < 7) return { size: "text-2xl", weight: "font-semibold", color: "text-orange-500", opacity: "opacity-95" }
  if (rank < 12) return { size: "text-lg", weight: "font-medium", color: "text-amber-500", opacity: "opacity-90" }
  if (rank < 18) return { size: "text-base", weight: "font-normal", color: "text-sky-500", opacity: "opacity-80" }
  return { size: "text-sm", weight: "font-normal", color: "text-muted-foreground", opacity: "opacity-70" }
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
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-10">
        <div className="mb-8 text-center text-sm font-medium text-muted-foreground">
          {t("search.hotTitle", { platform: platformLabel })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : failed || items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("search.hotEmpty")}</p>
        ) : (
          <div className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-4">
            {items.map((it) => {
              const tier = tierOf(it.rank)
              return (
                <button
                  key={it.keyword}
                  onClick={() => onSelect(it.keyword)}
                  title={it.keyword}
                  className={cn(
                    "leading-none transition duration-200 will-change-transform transform-gpu hover:scale-110 hover:opacity-100",
                    tier.size,
                    tier.weight,
                    tier.color,
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
