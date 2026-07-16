import { NavLink } from "react-router-dom"
import { Search, ListMusic, TrendingUp, Heart, Download, Settings, AudioLines } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { useUiStore } from "@/stores/uiStore"
import { SidebarUpdateCard } from "@/components/layout/SidebarUpdateCard"

// Settings is rendered separately at the bottom; these fill the main nav.
const navItems = [
  { to: "/search", icon: Search, labelKey: "nav.search", iconHover: "icon-hover-search" },
  { to: "/hot-playlists", icon: ListMusic, labelKey: "nav.playlists", iconHover: "icon-hover-list" },
  { to: "/library", icon: TrendingUp, labelKey: "nav.library", iconHover: "icon-hover-trend" },
  { to: "/favorites", icon: Heart, labelKey: "nav.favorites", iconHover: "icon-hover-heart" },
  { to: "/downloads", icon: Download, labelKey: "nav.downloads", iconHover: "icon-hover-download" },
]

const navLinkClass =
  (collapsed: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium",
      "transition-[color,background-color,transform] duration-200 ease-out",
      "active:scale-[0.98]",
      collapsed && "justify-center px-0",
      isActive
        ? "bg-primary/10 text-foreground"
        : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
    )

export function Sidebar() {
  const t = useT()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)

  return (
    <aside
      className={cn(
        "shrink-0 flex flex-col h-full bg-sidebar transition-[width] duration-200 ease-out",
        "border-r border-border/60",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Header: logo + brand — also a window drag handle (frameless window). */}
      <div
        data-tauri-drag-region
        className={cn(
          "px-3 pt-3.5 pb-2 flex items-center gap-3 [&>*]:pointer-events-none",
          collapsed && "justify-center px-2"
        )}
      >
        <div
          className={cn(
            "h-10 w-10 rounded-2xl bg-primary text-primary-foreground",
            "flex items-center justify-center shrink-0",
            "shadow-[var(--shadow-elevated)] ring-1 ring-black/5 dark:ring-white/10"
          )}
        >
          <AudioLines size={20} strokeWidth={2.25} className="icon-audio-pulse" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <h1 className="text-[15px] font-semibold tracking-tight leading-none truncate text-balance">
              {t("app.name")}
            </h1>
            <p className="text-[11px] text-muted-foreground leading-none mt-1.5 truncate font-medium">
              {t("app.tagline")}
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1">
        {navItems.map(({ to, icon: Icon, labelKey, iconHover }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? t(labelKey) : undefined}
            className={({ isActive }) => cn(navLinkClass(collapsed)({ isActive }), iconHover)}
          >
            {({ isActive }) => (
              <>
                {isActive && !collapsed && (
                  <span
                    aria-hidden
                    className="nav-active-bar absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-primary"
                  />
                )}
                <Icon size={18} strokeWidth={isActive ? 2.25 : 2} className="shrink-0" />
                {!collapsed && <span className="truncate">{t(labelKey)}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 p-2 pt-0 pb-3">
        <SidebarUpdateCard />
        <NavLink
          to="/settings"
          title={collapsed ? t("nav.settings") : undefined}
          className={({ isActive }) => cn(navLinkClass(collapsed)({ isActive }), "icon-hover-settings")}
        >
          {({ isActive }) => (
            <>
              {isActive && !collapsed && (
                <span
                  aria-hidden
                  className="nav-active-bar absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-primary"
                />
              )}
              <Settings size={18} strokeWidth={isActive ? 2.25 : 2} className="shrink-0" />
              {!collapsed && <span className="truncate">{t("nav.settings")}</span>}
            </>
          )}
        </NavLink>
      </div>
    </aside>
  )
}
