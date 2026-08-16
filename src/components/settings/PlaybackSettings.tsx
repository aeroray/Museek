import {
  Search,
  ListMusic,
  Disc3,
  TrendingUp,
  Heart,
  HardDrive,
  Fingerprint,
  Download,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { SettingsCard, SettingRow } from "@/components/settings/SettingsCard";
import {
  useSettingsStore,
  STARTUP_PAGES,
  type StartupPage,
} from "@/stores/settingsStore";
import { useT } from "@/lib/i18n";
import type { Quality } from "@/types/music";

const QUALITIES: Quality[] = ["128k", "320k", "flac", "flac24bit"];

const STARTUP_META: Record<
  StartupPage,
  { labelKey: string; icon: LucideIcon }
> = {
  search: { labelKey: "nav.search", icon: Search },
  "hot-playlists": { labelKey: "nav.playlists", icon: ListMusic },
  "hot-albums": { labelKey: "nav.albums", icon: Disc3 },
  library: { labelKey: "nav.library", icon: TrendingUp },
  favorites: { labelKey: "nav.favorites", icon: Heart },
  local: { labelKey: "nav.local", icon: HardDrive },
  recognize: { labelKey: "nav.recognize", icon: Fingerprint },
  downloads: { labelKey: "nav.downloads", icon: Download },
};

export function PlaybackSettings() {
  const {
    playQuality,
    preventSleepWhilePlaying,
    closeBehavior,
    openAtLogin,
    startHiddenToTray,
    startupPage,
    setPlayQuality,
    setPreventSleepWhilePlaying,
    setCloseBehavior,
    setOpenAtLogin,
    setStartHiddenToTray,
    setStartupPage,
  } = useSettingsStore();
  const t = useT();
  const selected = STARTUP_META[startupPage];
  const SelectedIcon = selected.icon;

  return (
    <ScrollArea className="h-full">
      <div className="pr-3 pb-4">
        <SettingsCard>
          <SettingRow
            title={t("playback.playQualityTitle")}
            desc={t("playback.playQualityDesc")}
          >
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
          </SettingRow>

          <SettingRow
            title={t("playback.preventSleepTitle")}
            desc={t("playback.preventSleepDesc")}
            control={
              <Switch
                checked={preventSleepWhilePlaying}
                onCheckedChange={setPreventSleepWhilePlaying}
              />
            }
          />

          <SettingRow
            title={t("playback.startupPageTitle")}
            desc={t("playback.startupPageDesc")}
            control={
              <Select
                value={startupPage}
                onValueChange={(value) =>
                  setStartupPage(value as StartupPage)
                }
              >
                <SelectTrigger
                  className="w-fit"
                  aria-label={t("playback.startupPageTitle")}
                >
                  <span className="flex items-center gap-2">
                    <SelectedIcon size={16} />
                    <span>{t(selected.labelKey)}</span>
                  </span>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectGroup>
                    {STARTUP_PAGES.map((page) => {
                      const { labelKey, icon: Icon } = STARTUP_META[page];
                      return (
                        <SelectItem key={page} value={page}>
                          <Icon size={16} />
                          {t(labelKey)}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            }
          />

          <SettingRow
            title={t("playback.openAtLoginTitle")}
            desc={t("playback.openAtLoginDesc")}
            control={
              <Switch checked={openAtLogin} onCheckedChange={setOpenAtLogin} />
            }
          />

          <SettingRow
            title={t("playback.startHiddenToTrayTitle")}
            desc={t("playback.startHiddenToTrayDesc")}
            control={
              <Switch
                checked={startHiddenToTray}
                disabled={!openAtLogin}
                onCheckedChange={setStartHiddenToTray}
              />
            }
          />

          <SettingRow
            title={t("close.behaviorTitle")}
            desc={t("close.behaviorDesc")}
          >
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
          </SettingRow>
        </SettingsCard>
      </div>
    </ScrollArea>
  );
}
