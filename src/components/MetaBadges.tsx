import { QUALITY_SHORT } from "@/lib/quality"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Quality, Source } from "@/types/music"

// Brand accent per platform (mirrors PlatformTabs' dots) for the platform chip.
export const PLATFORM_BRAND: Record<Source, string> = {
  wy: "#E60026",
  kw: "#F5A623",
  kg: "#2D9CDB",
  tx: "#2BC275",
  mg: "#E54BA0",
}

/** Tiny platform chip: brand dot + platform name. */
export function PlatformBadge({ source, className }: { source: Source; className?: string }) {
  const t = useT()
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 h-4 text-[10px] font-medium leading-none bg-muted/80 text-muted-foreground shrink-0",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: PLATFORM_BRAND[source] }} />
      {t(`platform.${source}`)}
    </span>
  )
}

// Tint by tier so lossless/Hi-Res stand out at a glance.
const QUALITY_TIER: Record<Quality, string> = {
  "128k": "border-border text-muted-foreground",
  "320k": "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  flac: "border-violet-500/40 text-violet-600 dark:text-violet-400",
  flac24bit: "border-amber-500/50 text-amber-600 dark:text-amber-400",
}

/** Tiny quality chip, tinted by tier (128K → muted … Hi-Res → amber). */
export function QualityBadge({ quality, className }: { quality: Quality; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1 h-4 text-[10px] font-semibold leading-none shrink-0",
        QUALITY_TIER[quality],
        className
      )}
    >
      {QUALITY_SHORT[quality]}
    </span>
  )
}
