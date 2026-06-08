import { NavLink } from "react-router-dom"
import { Search, ListMusic, TrendingUp, Heart, Download, Settings, AudioLines } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { useUiStore } from "@/stores/uiStore"

// Settings is rendered separately at the bottom; these fill the main nav.
const navItems = [
  { to: "/search", icon: Search, labelKey: "nav.search" },
  { to: "/hot-playlists", icon: ListMusic, labelKey: "nav.playlists" },
  { to: "/library", icon: TrendingUp, labelKey: "nav.library" },
  { to: "/favorites", icon: Heart, labelKey: "nav.favorites" },
  { to: "/downloads", icon: Download, labelKey: "nav.downloads" },
]

const navLinkClass =
  (collapsed: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
      collapsed && "justify-center px-0",
      isActive
        ? "bg-accent text-accent-foreground font-medium"
        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
    )

export function Sidebar() {
  const t = useT()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)

  return (
    <aside
      className={cn(
        "shrink-0 flex flex-col border-r border-border bg-card h-full transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-52"
      )}
    >
      {/* Header: logo + brand. The collapse/expand toggle lives in the TopBar. */}
      <div className={cn("p-3 flex items-center gap-2.5", collapsed && "justify-center")}>
        <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
          <AudioLines size={20} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <h1 className="text-base font-bold leading-none truncate">{t("app.name")}</h1>
            <p className="text-[11px] text-muted-foreground leading-none mt-2 truncate">{t("app.tagline")}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <NavLink key={to} to={to} title={collapsed ? t(labelKey) : undefined} className={navLinkClass(collapsed)}>
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{t(labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: Settings */}
      <div className="p-2">
        <NavLink
          to="/settings"
          title={collapsed ? t("nav.settings") : undefined}
          className={navLinkClass(collapsed)}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span className="truncate">{t("nav.settings")}</span>}
        </NavLink>
      </div>
    </aside>
  )
}
