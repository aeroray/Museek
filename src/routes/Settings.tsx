import { Settings as SettingsIcon } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SourceManager } from "@/components/settings/SourceManager"
import { PlaybackSettings } from "@/components/settings/PlaybackSettings"
import { ThemeSettings } from "@/components/settings/ThemeSettings"
import { DataSettings } from "@/components/settings/DataSettings"
import { useT } from "@/lib/i18n"

export function Settings() {
  const t = useT()
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <SettingsIcon size={20} />
        <h2 className="text-lg font-semibold">{t("settings.title")}</h2>
      </div>
      <div className="flex-1 min-h-0 p-4">
        <Tabs defaultValue="sources" className="flex flex-col h-full">
          <TabsList className="shrink-0 self-start">
            <TabsTrigger value="sources">{t("settings.tab.sources")}</TabsTrigger>
            <TabsTrigger value="playback">{t("settings.tab.playback")}</TabsTrigger>
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

          <TabsContent value="appearance" className="mt-4 overflow-auto">
            <ThemeSettings />
          </TabsContent>

          <TabsContent value="data" className="mt-4 flex-1 min-h-0">
            <DataSettings />
          </TabsContent>

          <TabsContent value="about" className="mt-4 overflow-auto">
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-base">{t("app.name")}</p>
              <p className="text-muted-foreground">{t("settings.about.version", { version: __APP_VERSION__ })}</p>
              <p className="text-muted-foreground">{t("settings.about.description")}</p>
              <p className="text-muted-foreground mt-4">
                {t("app.tagline")}
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
