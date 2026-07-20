import { Infinity as InfinityIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SettingsCard, SettingRow } from "@/components/settings/SettingsCard"
import { useSettingsStore } from "@/stores/settingsStore"
import { useT } from "@/lib/i18n"

/** 0–2 finite; -1 = unlimited */
const DEPTHS = [0, 1, 2, -1] as const

export function LocalSettings() {
  const { localScanDepth, deleteLocalFiles, setLocalScanDepth, setDeleteLocalFiles } = useSettingsStore()
  const t = useT()

  return (
    <ScrollArea className="h-full">
      <div className="pr-3 pb-4">
        <SettingsCard>
          <SettingRow title={t("local.settings.depthTitle")} desc={t("local.settings.depthDesc")}>
            <div className="flex flex-wrap gap-2">
              {DEPTHS.map((d) => (
                <Button
                  key={d}
                  variant={localScanDepth === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setLocalScanDepth(d)}
                  aria-label={d < 0 ? t("local.settings.depthUnlimited") : undefined}
                >
                  {d < 0 ? <InfinityIcon size={16} strokeWidth={2} /> : d}
                </Button>
              ))}
            </div>
          </SettingRow>

          <SettingRow title={t("local.settings.deleteFilesTitle")} desc={t("local.settings.deleteFilesDesc")}>
            <Switch checked={deleteLocalFiles} onCheckedChange={setDeleteLocalFiles} />
          </SettingRow>
        </SettingsCard>
      </div>
    </ScrollArea>
  )
}
