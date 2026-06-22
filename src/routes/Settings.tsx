import { Settings as SettingsIcon } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SourceManager } from "@/components/settings/SourceManager"
import { PlaybackSettings } from "@/components/settings/PlaybackSettings"
import { ThemeSettings } from "@/components/settings/ThemeSettings"
import { DataSettings } from "@/components/settings/DataSettings"
import { ShortcutsSettings } from "@/components/settings/ShortcutsSettings"
import { AboutSettings } from "@/components/settings/AboutSettings"
import { useT } from "@/lib/i18n"

const TAB_VALUES = ["sources", "playback", "shortcuts", "appearance", "data", "about"]

export function Settings() {
  const t = useT()
  // Tab is driven by ?tab= so it can be deep-linked (e.g. the "go to settings"
  // shortcut in the download-location prompt) and stays correct even when Settings
  // is already mounted. Normal tab clicks update the query (replace, no history spam).
  const [params, setParams] = useSearchParams()
  const requested = params.get("tab")
  const tab = requested && TAB_VALUES.includes(requested) ? requested : "sources"
  const setTab = (v: string) => setParams(v === "sources" ? {} : { tab: v }, { replace: true })
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <SettingsIcon size={20} />
        <h2 className="text-lg font-semibold">{t("settings.title")}</h2>
      </div>
      <div className="flex-1 min-h-0 p-4">
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col h-full">
          <TabsList className="shrink-0 self-start">
            <TabsTrigger value="sources">{t("settings.tab.sources")}</TabsTrigger>
            <TabsTrigger value="playback">{t("settings.tab.playback")}</TabsTrigger>
            <TabsTrigger value="shortcuts">{t("settings.tab.shortcuts")}</TabsTrigger>
            <TabsTrigger value="appearance">{t("settings.tab.appearance")}</TabsTrigger>
            <TabsTrigger value="data">{t("settings.tab.data")}</TabsTrigger>
            <TabsTrigger value="about">{t("settings.tab.about")}</TabsTrigger>
          </TabsList>

          <TabsContent value="sources" className="mt-4 flex-1 min-h-0">
            <SourceManager />
          </TabsContent>

          <TabsContent value="playback" className="mt-4 flex-1 min-h-0">
            <PlaybackSettings />
          </TabsContent>

          <TabsContent value="shortcuts" className="mt-4 flex-1 min-h-0">
            <ShortcutsSettings />
          </TabsContent>

          <TabsContent value="appearance" className="mt-4 overflow-auto">
            <ThemeSettings />
          </TabsContent>

          <TabsContent value="data" className="mt-4 flex-1 min-h-0">
            <DataSettings />
          </TabsContent>

          <TabsContent value="about" className="mt-4 flex-1 min-h-0">
            <AboutSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
