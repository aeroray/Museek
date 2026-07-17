import { ArrowDownToLine, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { useUpdateStore } from "@/stores/updateStore"
import { useUiStore } from "@/stores/uiStore"

/** Circular progress ring — percent or indeterminate spin. */
function ProgressRing({
  percent,
  size = 36,
  stroke = 3,
  indeterminate = false,
}: {
  percent: number | null
  size?: number
  stroke?: number
  indeterminate?: boolean
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = percent != null ? Math.min(100, Math.max(0, percent)) : 0
  const offset = c - (p / 100) * c

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0 -rotate-90", indeterminate && "animate-spin")}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-primary/15"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={indeterminate ? c * 0.75 : offset}
        className="text-primary transition-[stroke-dashoffset] duration-300 ease-out"
      />
    </svg>
  )
}

/** Compact banner above Settings — available update or live install progress. */
export function SidebarUpdateCard() {
  const t = useT()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const available = useUpdateStore((s) => s.available)
  const dismissed = useUpdateStore((s) => s.dismissed)
  const phase = useUpdateStore((s) => s.phase)
  const progress = useUpdateStore((s) => s.progress)
  const dismiss = useUpdateStore((s) => s.dismiss)
  const install = useUpdateStore((s) => s.install)

  const updating = phase === "downloading" || phase === "installing"
  if (!available && !updating) return null
  if (!updating && dismissed) return null

  const percent = progress?.percent ?? null
  const indeterminate = updating && percent == null

  if (updating) {
    if (collapsed) {
      return (
        <div className="w-full pb-1" title={t("update.downloading")}>
          <div className="mx-auto flex size-10 items-center justify-center">
            <ProgressRing percent={percent} size={32} stroke={3} indeterminate={indeterminate} />
          </div>
        </div>
      )
    }

    return (
      <div className="w-full pb-1">
        <div
          className={cn(
            "relative overflow-hidden rounded-xl",
            "border border-primary/20 bg-card/70 p-3",
            "shadow-[var(--shadow-border)]",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex size-11 shrink-0 items-center justify-center">
              <ProgressRing percent={percent} size={44} stroke={3.5} indeterminate={indeterminate} />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-primary">
                {percent != null ? `${percent}` : "…"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium tracking-tight text-foreground">
                {phase === "installing" ? t("update.installing") : t("update.downloading")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {percent != null
                  ? t("update.downloadPercent", { percent })
                  : t("about.updating")}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Available — not yet installing
  if (collapsed) {
    return (
      <div className="w-full pb-1">
        <button
          type="button"
          onClick={() => void install()}
          title={t("update.cardTitle", { version: available!.version })}
          className={cn(
            "flex size-10 mx-auto items-center justify-center rounded-xl",
            "bg-primary/10 text-primary ring-1 ring-primary/15",
            "transition-[background-color,transform] duration-200 ease-out",
            "hover:bg-primary/15 active:scale-[0.96]",
          )}
        >
          <ArrowDownToLine size={16} strokeWidth={2.25} className="shrink-0" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-full pb-1">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl",
          "border border-border/70 bg-card/70 p-3",
          "shadow-[var(--shadow-border)]",
        )}
      >
        <button
          type="button"
          onClick={dismiss}
          className={cn(
            "absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md",
            "text-muted-foreground/70 transition-colors",
            "hover:bg-muted hover:text-foreground active:scale-[0.96]",
          )}
          aria-label={t("update.dismiss")}
        >
          <X size={14} />
        </button>

        <div className="flex items-center gap-2.5 pr-6">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              "bg-primary/10 text-primary ring-1 ring-primary/10",
            )}
            aria-hidden
          >
            <ArrowDownToLine size={15} strokeWidth={2.25} className="shrink-0" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium tracking-tight text-foreground">
              {t("update.cardTitle", { version: available!.version })}
            </p>
            <button
              type="button"
              onClick={() => void install()}
              className={cn(
                "mt-0.5 inline-flex items-center text-xs font-medium text-primary",
                "transition-opacity duration-150 hover:opacity-80",
              )}
            >
              {t("update.installNow")}
              <span aria-hidden className="ml-0.5">
                →
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
