import { useEffect, useState } from "react"
import { Flame, Loader2 } from "lucide-react"
import { getHotSearch, type HotKeyword } from "@/lib/hotSearch"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Source } from "@/types/music"

// Size + heat-color tier by rank (0 = hottest). Encoding heat as both font size
// and colour temperature (warm → cool) gives the varied "word cloud" look and a
// meaningful at-a-glance sense of what's trending — no layout library needed.
function tierOf(rank: number): { size: string; color: string; hot: boolean } {
  if (rank < 3) return { size: "text-[1.7rem] leading-tight font-bold", color: "text-rose-500", hot: true }
  if (rank < 7) return { size: "text-xl font-semibold", color: "text-orange-500", hot: false }
  if (rank < 12) return { size: "text-lg font-medium", color: "text-amber-500", hot: false }
  if (rank < 18) return { size: "text-base", color: "text-sky-500", hot: false }
  return { size: "text-sm", color: "text-muted-foreground", hot: false }
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
        <div className="mb-7 flex items-center gap-2 text-muted-foreground">
          <Flame size={16} className="text-orange-500" />
          <span className="text-sm font-medium">{t("search.hotTitle", { platform: platformLabel })}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : failed || items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("search.hotEmpty")}</p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3.5">
            {items.map((it) => {
              const tier = tierOf(it.rank)
              return (
                <button
                  key={it.keyword}
                  onClick={() => onSelect(it.keyword)}
                  title={it.keyword}
                  className={cn(
                    "group inline-flex items-center gap-1 transition-transform duration-150 hover:scale-110",
                    tier.size,
                    tier.color,
                  )}
                >
                  <span className="underline-offset-4 group-hover:underline">{it.keyword}</span>
                  {tier.hot && <Flame size={it.rank === 0 ? 18 : 15} className="shrink-0 text-orange-500" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
