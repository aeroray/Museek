import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { SettingsCard, SettingRow } from "@/components/settings/SettingsCard";
import { useSettingsStore } from "@/stores/settingsStore";
import { useT } from "@/lib/i18n";

export function LyricsSettings() {
  const {
    desktopLyricsCapsuleVisible,
    autoLockDesktopLyrics,
    setDesktopLyricsCapsuleVisible,
    setAutoLockDesktopLyrics,
  } = useSettingsStore();
  const t = useT();

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 pr-3 pb-4">
        <p className="text-sm text-muted-foreground">
          {t("lyricsSettings.desc")}
        </p>
        <SettingsCard>
          <SettingRow
            title={t("lyricsSettings.capsuleTitle")}
            desc={t("lyricsSettings.capsuleDesc")}
            control={
              <Switch
                checked={desktopLyricsCapsuleVisible}
                onCheckedChange={setDesktopLyricsCapsuleVisible}
              />
            }
          />
          <SettingRow
            title={t("lyricsSettings.autoLockTitle")}
            desc={t("lyricsSettings.autoLockDesc")}
            control={
              <Switch
                checked={autoLockDesktopLyrics}
                onCheckedChange={setAutoLockDesktopLyrics}
              />
            }
          />
        </SettingsCard>
      </div>
    </ScrollArea>
  );
}
