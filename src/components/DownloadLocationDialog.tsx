import { useNavigate } from "react-router-dom"
import { FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useUiStore } from "@/stores/uiStore"
import { useT } from "@/lib/i18n"

// Global modal: surfaced when a download is attempted before a download location
// has been chosen. Offers a shortcut straight to the relevant settings tab.
export function DownloadLocationDialog() {
  const open = useUiStore((s) => s.downloadLocationPromptOpen)
  const setOpen = useUiStore((s) => s.setDownloadLocationPrompt)
  const navigate = useNavigate()
  const t = useT()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("download.noLocationTitle")}</DialogTitle>
          <DialogDescription>{t("download.noLocationDesc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              setOpen(false)
              navigate("/settings?tab=playback")
            }}
          >
            <FolderOpen size={15} className="mr-2" />
            {t("download.goToSettings")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
