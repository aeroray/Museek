import { Link } from "react-router-dom"
import { ArrowUp, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { useUpdateStore } from "@/stores/updateStore"
import { useUiStore } from "@/stores/uiStore"

/** Compact banner above Settings — only when a newer release was found. */
export function SidebarUpdateCard() {
  const t = useT()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const available = useUpdateStore((s) => s.available)
  const dismissed = useUpdateStore((s) => s.dismissed)
  const dismiss = useUpdateStore((s) => s.dismiss)

  if (!available || dismissed) return null

  if (collapsed) {
    return (
      <div className="w-full pb-1">
        <Link
          to="/settings?tab=about"
          title={t("update.cardTitle", { version: available.version })}
          className={cn(
            "flex size-10 mx-auto items-center justify-center rounded-xl",
            "bg-primary/10 text-primary ring-1 ring-primary/15",
            "transition-[background-color,transform] duration-200 ease-out",
            "hover:bg-primary/15 active:scale-[0.96]",
          )}
        >
          <ArrowUp size={16} strokeWidth={2.25} className="shrink-0" />
        </Link>
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
            <ArrowUp size={15} strokeWidth={2.25} className="shrink-0" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium tracking-tight text-foreground">
              {t("update.cardTitle", { version: available.version })}
            </p>
            <Link
              to="/settings?tab=about"
              className={cn(
                "mt-0.5 inline-flex items-center text-xs font-medium text-primary",
                "transition-opacity duration-150 hover:opacity-80",
              )}
            >
              {t("update.goUpdate")}
              <span aria-hidden className="ml-0.5">
                →
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
