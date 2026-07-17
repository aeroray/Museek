import type { ReactNode } from "react"
import { RefreshCw, Loader2, Download, ExternalLink, Github, Globe, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SettingsCard } from "@/components/settings/SettingsCard"
import { useUpdateStore } from "@/stores/updateStore"
import { useT } from "@/lib/i18n"
import { RELEASES_URL } from "@/lib/updater"
import { cn } from "@/lib/utils"

const GITHUB_URL = "https://github.com/aeroray/Museek"
const WEBSITE_URL = "https://aeroray.github.io/Museek/"

async function openExternal(url: string): Promise<void> {
  try {
    const { open } = await import("@tauri-apps/plugin-shell")
    await open(url)
  } catch {
    window.open(url, "_blank")
  }
}

function formatCheckedAt(ts: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}

function ExternalLinkRow({
  icon,
  title,
  desc,
  href,
}: {
  icon: ReactNode
  title: string
  desc: string
  href: string
}) {
  return (
    <button
      type="button"
      onClick={() => void openExternal(href)}
      className={cn(
        "group flex w-full items-center gap-3.5 p-4 text-left",
        "transition-[background-color,transform] duration-200 ease-out",
        "hover:bg-muted/45 active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          "bg-primary/10 text-primary ring-1 ring-primary/10",
          "transition-colors duration-200 group-hover:bg-primary/15",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-sm font-medium tracking-tight text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{desc}</span>
      </span>
      <ChevronRight
        size={16}
        strokeWidth={2}
        className={cn(
          "shrink-0 text-muted-foreground/50",
          "transition-[color,transform] duration-200",
          "group-hover:translate-x-0.5 group-hover:text-muted-foreground",
        )}
        aria-hidden
      />
    </button>
  )
}

export function AboutSettings() {
  const t = useT()
  const available = useUpdateStore((s) => s.available)
  const checking = useUpdateStore((s) => s.checking)
  const lastCheckedAt = useUpdateStore((s) => s.lastCheckedAt)
  const phase = useUpdateStore((s) => s.phase)
  const progress = useUpdateStore((s) => s.progress)
  const installError = useUpdateStore((s) => s.installError)
  const checkNow = useUpdateStore((s) => s.checkNow)
  const install = useUpdateStore((s) => s.install)
  const isUpdating = phase === "downloading" || phase === "installing"

  const canShowInstall = !!(available?.canInstall)
  const showMirrorFallback = !!(available && !available.canInstall && !isUpdating)

  const onPrimary = () => {
    if (canShowInstall && !isUpdating) {
      void install()
      return
    }
    void checkNow().catch(() => {
      /* toast already shown */
    })
  }

  const locale = typeof navigator !== "undefined" && navigator.language.startsWith("zh") ? "zh-CN" : "en"

  return (
    <ScrollArea className="h-full">
      <div className="pr-3 pb-4">
        <SettingsCard>
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="space-y-1.5 text-sm min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <p className="text-base font-semibold truncate">{t("app.name")}</p>
                <Badge
                  variant="secondary"
                  className="shrink-0 rounded-md px-1.5 py-0 text-[11px] font-medium tabular-nums"
                >
                  v{__APP_VERSION__}
                </Badge>
              </div>
              <p className="text-muted-foreground">{t("settings.about.description")}</p>
              {available?.canInstall && (
                <p className="text-xs text-primary font-medium">
                  {t("about.updateDescInstall", { version: available.version })}
                </p>
              )}
              {showMirrorFallback && (
                <p className="text-xs text-muted-foreground">
                  {t("about.updateDescMirror", { version: available.version })}
                </p>
              )}
              {installError && (
                <p className="text-xs text-destructive">{t("about.updateFailed", { msg: installError })}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Button
                variant={canShowInstall ? "default" : "outline"}
                size="sm"
                onClick={onPrimary}
                disabled={checking || isUpdating}
                className="shrink-0"
              >
                {checking || isUpdating ? (
                  <Loader2 size={15} className="mr-2 animate-spin" />
                ) : canShowInstall ? (
                  <Download size={15} className="mr-2" />
                ) : (
                  <RefreshCw size={15} className="mr-2" />
                )}
                {isUpdating
                  ? progress?.percent != null
                    ? t("about.updatingPercent", { percent: progress.percent })
                    : t("about.updating")
                  : canShowInstall
                    ? t("about.installUpdate")
                    : t("about.checkUpdate")}
              </Button>
              {lastCheckedAt != null && (
                <p className="text-[11px] text-muted-foreground/80 tabular-nums">
                  {t("about.lastChecked", { time: formatCheckedAt(lastCheckedAt, locale) })}
                </p>
              )}
              {showMirrorFallback && (
                <div className="flex flex-wrap justify-end gap-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void openExternal(available.downloadUrl || RELEASES_URL)}
                  >
                    <ExternalLink size={13} className="mr-1.5" />
                    {t("about.mirrorDownload")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void openExternal(RELEASES_URL)}
                  >
                    {t("about.openReleases")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </SettingsCard>

        <SettingsCard className="mt-4 overflow-hidden">
          <ExternalLinkRow
            icon={<Github size={18} strokeWidth={2} />}
            title={t("about.githubTitle")}
            desc={t("about.githubDesc")}
            href={GITHUB_URL}
          />
          <ExternalLinkRow
            icon={<Globe size={18} strokeWidth={2} />}
            title={t("about.websiteTitle")}
            desc={t("about.websiteDesc")}
            href={WEBSITE_URL}
          />
        </SettingsCard>

        <SettingsCard className="mt-4">
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <img
              src="/gzh/qrcode.webp"
              alt={t("about.gzhTitle")}
              className={cn(
                "h-40 w-40 rounded-xl bg-white object-contain",
                "outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
              )}
            />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{t("about.gzhTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("about.gzhHint")}</p>
            </div>
          </div>
        </SettingsCard>
      </div>
    </ScrollArea>
  )
}
