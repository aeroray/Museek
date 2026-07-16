import { useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowRight, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WindowControls } from "./WindowControls"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"

/**
 * Slim top toolbar: sidebar collapse/expand toggle on the left, browser-style
 * back / forward navigation on the right.
 */
export function TopBar() {
  const navigate = useNavigate()
  const { sidebarCollapsed, toggleSidebar } = useUiStore()
  const t = useT()

  return (
    <div
      data-tauri-drag-region
      className="h-10 shrink-0 flex items-center justify-between gap-0.5 pl-2 pr-1 border-b border-border/50"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground icon-hover-panel"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
      >
        <span key={sidebarCollapsed ? "open" : "close"} className="icon-pop-in">
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </span>
      </Button>

      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground icon-hover-arrow-left"
            onClick={() => navigate(-1)}
            title={t("nav.back")}
          >
            <ArrowLeft size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground icon-hover-arrow-right"
            onClick={() => navigate(1)}
            title={t("nav.forward")}
          >
            <ArrowRight size={16} />
          </Button>
        </div>
        <WindowControls />
      </div>
    </div>
  )
}
