import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { AlertCircle, Info, CheckCircle2, X } from "lucide-react"
import { useUiStore } from "@/stores/uiStore"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Toaster() {
  const { toast, clearToast } = useUiStore()
  const navigate = useNavigate()

  // Auto-dismiss informational/plain toasts; keep actionable ones until dismissed.
  useEffect(() => {
    if (!toast || toast.actionTo) return
    const id = window.setTimeout(clearToast, 4500)
    return () => window.clearTimeout(id)
  }, [toast, clearToast])

  if (!toast) return null

  const variant = toast.variant ?? "info"

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-top-2">
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border bg-popover/95 backdrop-blur px-4 py-3 shadow-lg",
          variant === "error"
            ? "border-destructive/40"
            : variant === "success"
            ? "border-emerald-500/40"
            : "border-border"
        )}
      >
        {variant === "error" ? (
          <AlertCircle size={18} className="text-destructive shrink-0" />
        ) : variant === "success" ? (
          <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
        ) : (
          <Info size={18} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-sm flex-1 min-w-0">{toast.message}</span>
        {toast.actionTo && toast.actionLabel && (
          <Button
            size="sm"
            className="h-7 shrink-0"
            onClick={() => {
              navigate(toast.actionTo!)
              clearToast()
            }}
          >
            {toast.actionLabel}
          </Button>
        )}
        <button
          onClick={clearToast}
          className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-[0.96]"
          aria-label="close"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
