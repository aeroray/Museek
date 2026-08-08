import {
  Settings as SettingsIcon,
  Plug,
  Play,
  Download,
  HardDrive,
  Database,
  Keyboard,
  Palette,
  FolderSync,
  Info,
} from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SourceManager } from "@/components/settings/SourceManager"
import { PlaybackSettings } from "@/components/settings/PlaybackSettings"
import { DownloadSettings } from "@/components/settings/DownloadSettings"
import { LocalSettings } from "@/components/settings/LocalSettings"
import { CacheSettings } from "@/components/settings/CacheSettings"
import { ThemeSettings } from "@/components/settings/ThemeSettings"
import { DataSettings } from "@/components/settings/DataSettings"
import { ShortcutsSettings } from "@/components/settings/ShortcutsSettings"
import { AboutSettings } from "@/components/settings/AboutSettings"
import { useT } from "@/lib/i18n"

const TAB_VALUES = ["sources", "playback", "download", "local", "cache", "shortcuts", "appearance", "data", "about"] as const

const SETTINGS_TABS: {
  value: (typeof TAB_VALUES)[number]
  labelKey: string
  icon: typeof Plug
}[] = [
  { value: "sources", labelKey: "settings.tab.sources", icon: Plug },
  { value: "playback", labelKey: "settings.tab.playback", icon: Play },
  { value: "download", labelKey: "settings.tab.download", icon: Download },
  { value: "local", labelKey: "settings.tab.local", icon: HardDrive },
  { value: "cache", labelKey: "settings.tab.cache", icon: Database },
  { value: "shortcuts", labelKey: "settings.tab.shortcuts", icon: Keyboard },
  { value: "appearance", labelKey: "settings.tab.appearance", icon: Palette },
  { value: "data", labelKey: "settings.tab.data", icon: FolderSync },
  { value: "about", labelKey: "settings.tab.about", icon: Info },
]

export function Settings() {
  const t = useT()
  // Tab is driven by ?tab= so it can be deep-linked (e.g. the "go to settings"
  // shortcut in the download-location prompt) and stays correct even when Settings
  // is already mounted. Normal tab clicks update the query (replace, no history spam).
  const [params, setParams] = useSearchParams()
  const requested = params.get("tab")
  const tab = requested && (TAB_VALUES as readonly string[]).includes(requested) ? requested : "sources"
  const setTab = (v: string) => setParams(v === "sources" ? {} : { tab: v }, { replace: true })
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <SettingsIcon size={20} />
        <h2 className="text-lg font-semibold">{t("settings.title")}</h2>
      </div>
      <div className="flex-1 min-h-0 p-4">
        <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="flex gap-4 h-full">
          <TabsList className="flex-col h-auto w-40 shrink-0 items-stretch justify-start gap-0.5 bg-muted/60 p-1.5">
            {SETTINGS_TABS.map((tabItem) => {
              const Icon = tabItem.icon
              return (
                <TabsTrigger
                  key={tabItem.value}
                  value={tabItem.value}
                  className="w-full justify-start gap-2 px-2.5"
                >
                  <Icon size={15} strokeWidth={2} className="shrink-0" aria-hidden />
                  <span className="leading-none">{t(tabItem.labelKey)}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          <TabsContent value="sources" className="mt-0 flex-1 min-h-0">
            <SourceManager />
          </TabsContent>

          <TabsContent value="playback" className="mt-0 flex-1 min-h-0">
            <PlaybackSettings />
          </TabsContent>

          <TabsContent value="download" className="mt-0 flex-1 min-h-0">
            <DownloadSettings />
          </TabsContent>

          <TabsContent value="local" className="mt-0 flex-1 min-h-0">
            <LocalSettings />
          </TabsContent>

          <TabsContent value="cache" className="mt-0 flex-1 min-h-0">
            <CacheSettings />
          </TabsContent>

          <TabsContent value="shortcuts" className="mt-0 flex-1 min-h-0">
            <ShortcutsSettings />
          </TabsContent>

          <TabsContent value="appearance" className="mt-0 flex-1 min-h-0">
            <ThemeSettings />
          </TabsContent>

          <TabsContent value="data" className="mt-0 flex-1 min-h-0">
            <DataSettings />
          </TabsContent>

          <TabsContent value="about" className="mt-0 flex-1 min-h-0">
            <AboutSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
