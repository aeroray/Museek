import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { getHotSearch, type HotKeyword } from "@/lib/hotSearch"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Source } from "@/types/music"

// A filled, gradient flame with a soft glow — nicer than a plain outline icon.
// The gradient is defined once (FlameDefs) and referenced by url(#museek-flame).
function FlameDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="museek-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="55%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function Flame({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
      style={{ filter: "drop-shadow(0 0 3px rgba(251,146,60,0.55))" }}
      aria-hidden
    >
      <path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        fill="url(#museek-flame)"
      />
    </svg>
  )
}

// Depth via size + weight + colour temperature + opacity, all keyed to rank
// (0 = hottest). The strong contrast between tiers gives the layered "cloud"
// feel instead of a flat, evenly-sized grid.
function tierOf(rank: number): { size: string; weight: string; color: string; opacity: string; hot: boolean } {
  if (rank < 3) return { size: "text-3xl", weight: "font-bold", color: "text-rose-500", opacity: "opacity-100", hot: true }
  if (rank < 7) return { size: "text-2xl", weight: "font-semibold", color: "text-orange-500", opacity: "opacity-95", hot: false }
  if (rank < 12) return { size: "text-lg", weight: "font-medium", color: "text-amber-500", opacity: "opacity-90", hot: false }
  if (rank < 18) return { size: "text-base", weight: "font-normal", color: "text-sky-500", opacity: "opacity-80", hot: false }
  return { size: "text-sm", weight: "font-normal", color: "text-muted-foreground", opacity: "opacity-70", hot: false }
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
      <FlameDefs />
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-10">
        <div className="mb-8 flex items-center gap-2 text-muted-foreground">
          <Flame size={16} />
          <span className="text-sm font-medium">{t("search.hotTitle", { platform: platformLabel })}</span>
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
                    "group inline-flex items-baseline gap-1 leading-none transition duration-200 will-change-transform transform-gpu",
                    "hover:scale-110 hover:opacity-100",
                    tier.size,
                    tier.weight,
                    tier.color,
                    tier.opacity,
                  )}
                >
                  <span>{it.keyword}</span>
                  {tier.hot && <Flame size={it.rank === 0 ? 20 : 16} />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
