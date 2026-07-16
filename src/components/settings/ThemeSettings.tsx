import { Sun, Moon, Monitor, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SettingsCard, SettingRow } from "@/components/settings/SettingsCard"
import { useThemeStore, PALETTES, type ThemeMode } from "@/stores/themeStore"
import { useLangStore, useT, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const MODES: { id: ThemeMode; labelKey: string; icon: typeof Sun }[] = [
  { id: "system", labelKey: "theme.mode.system", icon: Monitor },
  { id: "light", labelKey: "theme.mode.light", icon: Sun },
  { id: "dark", labelKey: "theme.mode.dark", icon: Moon },
]

// Distinct glyphs so the two language options read at a glance.
const LANGS: { id: Lang; labelKey: string; glyph: string }[] = [
  { id: "zh", labelKey: "lang.zh", glyph: "中" },
  { id: "en", labelKey: "lang.en", glyph: "EN" },
]

export function ThemeSettings() {
  const { mode, palette, setMode, setPalette } = useThemeStore()
  const { lang, setLang } = useLangStore()
  const t = useT()

  return (
    <ScrollArea className="h-full">
      <div className="pr-3 pb-4">
        <SettingsCard>
          <SettingRow title={t("theme.modeTitle")} desc={t("theme.modeDesc")}>
            <div className="flex gap-2">
              {MODES.map((m) => {
                const Icon = m.icon
                return (
                  <Button
                    key={m.id}
                    variant={mode === m.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMode(m.id)}
                    className={
                      m.id === "light" ? "icon-hover-sun" : m.id === "dark" ? "icon-hover-moon" : "icon-hover-settings"
                    }
                  >
                    <Icon size={15} className="mr-2" />
                    {t(m.labelKey)}
                  </Button>
                )
              })}
            </div>
          </SettingRow>

          <SettingRow title={t("lang.title")} desc={t("lang.desc")}>
            <div className="flex gap-2">
              {LANGS.map((l) => (
                <Button
                  key={l.id}
                  variant={lang === l.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLang(l.id)}
                >
                  <span className="mr-2 inline-flex w-5 justify-center text-xs font-semibold tabular-nums">{l.glyph}</span>
                  {t(l.labelKey)}
                </Button>
              ))}
            </div>
          </SettingRow>

          <SettingRow title={t("theme.paletteTitle")} desc={t("theme.paletteDesc")}>
            <div className="flex flex-wrap gap-4">
              {PALETTES.map((p) => {
                const active = palette === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setPalette(p.id)}
                    className="flex flex-col items-center gap-1.5 group"
                    title={t(`palette.${p.id}`)}
                  >
                    <span
                      className={cn(
                        "h-9 w-9 rounded-2xl flex items-center justify-center ring-offset-2 ring-offset-background transition-transform duration-200",
                        active ? "ring-2 ring-ring scale-105" : "group-hover:scale-110"
                      )}
                      style={{ backgroundColor: p.color }}
                    >
                      {active && <Check size={15} className="text-white drop-shadow icon-pop-in" strokeWidth={2.5} />}
                    </span>
                    <span className={cn("text-xs", active ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {t(`palette.${p.id}`)}
                    </span>
                  </button>
                )
              })}
            </div>
          </SettingRow>
        </SettingsCard>
      </div>
    </ScrollArea>
  )
}
