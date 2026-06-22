import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SettingHeader } from "@/components/settings/SettingHeader"
import { useSettingsStore } from "@/stores/settingsStore"
import { useT } from "@/lib/i18n"
import type { Quality } from "@/types/music"

const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"]

export function PlaybackSettings() {
  const {
    playQuality,
    preventSleepWhilePlaying,
    closeBehavior,
    setPlayQuality,
    setPreventSleepWhilePlaying,
    setCloseBehavior,
  } = useSettingsStore()
  const t = useT()

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 pr-3 pb-4">
        {/* Playback quality */}
        <section className="space-y-3">
          <SettingHeader title={t("playback.playQualityTitle")} desc={t("playback.playQualityDesc")} />
          <div className="flex flex-wrap gap-2">
            {QUALITIES.map((q) => (
              <Button
                key={q}
                variant={playQuality === q ? "default" : "outline"}
                size="sm"
                onClick={() => setPlayQuality(q)}
              >
                {t(`quality.${q}`)}
              </Button>
            ))}
          </div>
        </section>

        {/* Prevent system sleep while playing */}
        <section className="space-y-2.5">
          <SettingHeader title={t("playback.preventSleepTitle")} desc={t("playback.preventSleepDesc")} />
          <Switch checked={preventSleepWhilePlaying} onCheckedChange={setPreventSleepWhilePlaying} />
        </section>

        {/* Close-button behavior */}
        <section className="space-y-3">
          <SettingHeader title={t("close.behaviorTitle")} desc={t("close.behaviorDesc")} />
          <div className="flex flex-wrap gap-2">
            {(["exit", "tray"] as const).map((b) => (
              <Button
                key={b}
                variant={closeBehavior === b ? "default" : "outline"}
                size="sm"
                onClick={() => setCloseBehavior(b)}
              >
                {t(`close.opt.${b}`)}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
  )
}
