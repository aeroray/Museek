import { ScrollArea } from "@/components/ui/scroll-area"
import { SettingsCard } from "@/components/settings/SettingsCard"
import { useT } from "@/lib/i18n"

export function ShortcutsSettings() {
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
        <p className="text-sm text-muted-foreground">{t("shortcuts.desc")}</p>
        <SettingsCard>
          {rows.map((r) => (
            <div key={r.action} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm">{r.action}</span>
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
        </SettingsCard>
      </div>
    </ScrollArea>
  )
}
