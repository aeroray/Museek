import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import type { OnlineSource, Source } from "@/types/music"

// Fixed display order across Search / Charts / Playlists:
// NetEase, KuWo, KuGou, QQ Music, Migu. The first entry is the default selection.
// "local" is intentionally excluded — it has its own page.
export const PLATFORM_ORDER: OnlineSource[] = ["wy", "kw", "kg", "tx", "mg"]

const LABEL: Record<OnlineSource, string> = {
  wy: "platform.wy",
  kw: "platform.kw",
  kg: "platform.kg",
  tx: "platform.tx",
  mg: "platform.mg",
}

// A small brand-ish accent dot per platform for visual distinction.
const BRAND: Record<OnlineSource, string> = {
  wy: "#E60026",
  kw: "#F5A623",
  kg: "#2D9CDB",
  tx: "#2BC275",
  mg: "#E54BA0",
}

/**
 * iOS-style segmented control for picking a music platform — a pill track with a
 * raised "active" segment and a brand-colored dot per platform.
 */
export function PlatformTabs({
  value,
  onChange,
  className,
}: {
  value: Source
  onChange: (s: OnlineSource) => void
  className?: string
}) {
  const t = useT()
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-2xl bg-muted/60 p-1 shadow-[var(--shadow-border)]", className)}>
      {PLATFORM_ORDER.map((s) => {
        const active = value === s
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium",
              "transition-[color,background-color,box-shadow,transform] duration-200 ease-out",
              "active:scale-[0.97]",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40"
            )}
          >
            <span
              className="h-1.5 w-1.5 rounded-full transition-transform"
              style={{ backgroundColor: BRAND[s], transform: active ? "scale(1.3)" : "scale(1)" }}
            />
            {t(LABEL[s])}
          </button>
        )
      })}
    </div>
  )
}
