import { Link } from "react-router-dom"
import { ArrowUpCircle, X } from "lucide-react"
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
            "flex h-10 w-full items-center justify-center rounded-lg",
            "bg-primary/12 text-primary transition-colors duration-200 ease-out",
            "hover:bg-primary/20 active:scale-[0.96]",
          )}
        >
          <ArrowUpCircle size={18} className="shrink-0" />
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full pb-1">
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl border border-primary/25 bg-primary/10 p-2.5",
          "shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]",
        )}
      >
        <button
          type="button"
          onClick={dismiss}
          className={cn(
            "absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground",
            "active:scale-[0.96]",
          )}
          aria-label={t("update.dismiss")}
        >
          <X size={14} />
        </button>
        <div className="flex w-full items-start gap-2 pr-5">
          <ArrowUpCircle size={18} className="mt-px shrink-0 text-primary" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="truncate text-[15px] font-semibold leading-[18px] text-foreground">
              {t("update.cardTitle", { version: available.version })}
            </p>
            <Link
              to="/settings?tab=about"
              className={cn(
                "inline-flex h-8 w-full items-center justify-center rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground",
                "transition-transform duration-150 ease-out hover:opacity-95 active:scale-[0.96]",
              )}
            >
              {t("update.goUpdate")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
