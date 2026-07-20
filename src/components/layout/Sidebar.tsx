import { NavLink } from "react-router-dom"
import { Search, ListMusic, TrendingUp, Heart, HardDrive, Download, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { isMacOs } from "@/lib/os"
import { useT } from "@/lib/i18n"
import { useUiStore } from "@/stores/uiStore"
import { usePlayerStore } from "@/stores/playerStore"
import { SidebarUpdateCard } from "@/components/layout/SidebarUpdateCard"
import { BrandMark } from "@/components/brand/BrandMark"

// Settings is rendered separately at the bottom; these fill the main nav.
const navItems = [
  { to: "/search", icon: Search, labelKey: "nav.search", iconHover: "icon-hover-search" },
  { to: "/hot-playlists", icon: ListMusic, labelKey: "nav.playlists", iconHover: "icon-hover-list" },
  { to: "/library", icon: TrendingUp, labelKey: "nav.library", iconHover: "icon-hover-trend" },
  { to: "/favorites", icon: Heart, labelKey: "nav.favorites", iconHover: "icon-hover-heart" },
  { to: "/local", icon: HardDrive, labelKey: "nav.local", iconHover: "icon-hover-list" },
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
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const mac = isMacOs()

  return (
    <aside
      className={cn(
        "shrink-0 flex flex-col h-full bg-sidebar transition-[width] duration-200 ease-out",
        "border-r border-border/60",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* macOS: reserve space for native traffic lights (titleBarStyle Overlay). */}
      {mac && <div data-tauri-drag-region className="h-9 shrink-0" />}

      {/* Header: logo + brand — also a window drag handle (frameless window). */}
      <div
        data-tauri-drag-region
        className={cn(
          "brand-mark-hot px-3 pb-2 flex items-center gap-3",
          mac ? "pt-1" : "pt-3.5",
          collapsed && "justify-center px-2"
        )}
      >
        {/* Logo keeps pointer events so hover can drive the eq animation;
            text stays non-interactive so the drag region still works. */}
        <div className="pointer-events-auto h-9 w-9 shrink-0 drop-shadow-sm">
          <BrandMark live={isPlaying} className="h-full w-full" title={t("app.name")} />
        </div>
        {!collapsed && (
          <div className="pointer-events-none min-w-0 flex-1 flex flex-col justify-center">
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
