import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { SettingsCard, SettingRow } from "@/components/settings/SettingsCard";
import { LyricColorPicker } from "@/components/settings/LyricColorPicker";
import { useSettingsStore } from "@/stores/settingsStore";
import { useT } from "@/lib/i18n";

export function LyricsSettings() {
  const {
    desktopLyricsCapsuleVisible,
    autoLockDesktopLyrics,
    desktopLyricsTwoLines,
    desktopLyricsColor,
    setDesktopLyricsCapsuleVisible,
    setAutoLockDesktopLyrics,
    setDesktopLyricsTwoLines,
    setDesktopLyricsColor,
  } = useSettingsStore();
  const t = useT();

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 pr-3 pb-4">
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
          <SettingRow
            title={t("lyricsSettings.twoLinesTitle")}
            desc={t("lyricsSettings.twoLinesDesc")}
            control={
              <Switch
                checked={desktopLyricsTwoLines}
                onCheckedChange={setDesktopLyricsTwoLines}
              />
            }
          />
          <SettingRow
            title={t("lyricsSettings.colorTitle")}
            desc={t("lyricsSettings.colorDesc")}
            control={
              <LyricColorPicker
                value={desktopLyricsColor}
                onFollowTheme={() => setDesktopLyricsColor(null)}
                onChange={setDesktopLyricsColor}
              />
            }
          />
        </SettingsCard>
      </div>
    </ScrollArea>
  );
}
