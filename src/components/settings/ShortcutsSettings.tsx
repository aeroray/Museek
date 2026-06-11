import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SettingHeader } from "@/components/settings/SettingHeader"
import { useSettingsStore } from "@/stores/settingsStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function ShortcutsSettings() {
  const { shortcutsEnabled, setShortcutsEnabled } = useSettingsStore()
  const t = useT()
  const rows = [
    { keys: ["Space"], action: t("shortcuts.playPause") },
    { keys: ["←", "→"], action: t("shortcuts.seek") },
    { keys: ["Ctrl/⌘ + ←", "Ctrl/⌘ + →"], action: t("shortcuts.prevNext") },
    { keys: ["↑", "↓"], action: t("shortcuts.volume") },
    { keys: ["M"], action: t("shortcuts.mute") },
    { keys: ["L"], action: t("shortcuts.lyrics") },
  ]

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 pr-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <SettingHeader title={t("shortcuts.title")} desc={t("shortcuts.desc")} />
          <Switch checked={shortcutsEnabled} onCheckedChange={setShortcutsEnabled} className="shrink-0" />
        </div>
        <div className={cn("rounded-lg border border-border divide-y divide-border", !shortcutsEnabled && "opacity-50")}>
          {rows.map((r) => (
            <div key={r.action} className="flex items-center justify-between gap-4 px-3 py-2.5">
              <span className="text-sm text-muted-foreground">{r.action}</span>
              <span className="flex items-center gap-1.5">
                {r.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-medium text-foreground/80"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
