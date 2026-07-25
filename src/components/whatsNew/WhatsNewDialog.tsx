import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getWhatsNew,
  setSeenVersion,
  shouldShowWhatsNew,
  subscribeWhatsNewOpen,
} from "@/lib/whatsNew"
import { useLangStore, useT } from "@/lib/i18n"

const SHOW_DELAY_MS = 1200

/**
 * What's New dialog — auto-opens once after an upgrade, and anytime via
 * `openWhatsNew()` (About → view release notes).
 */
export function WhatsNewDialog() {
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const version = __APP_VERSION__
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (shouldShowWhatsNew(version)) setOpen(true)
    }, SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [version])

  useEffect(() => subscribeWhatsNewOpen(() => setOpen(true)), [])

  const copy = getWhatsNew(version, lang)

  const dismiss = () => {
    setSeenVersion(version)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss()
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("whatsNew.title", { version })}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[min(24rem,50vh)] pr-3">
          {copy ? (
            <div className="space-y-4 text-sm">
              {copy.sections.map((section) => (
                <div key={section.title} className="space-y-1.5">
                  <p className="font-medium text-foreground">{section.title}</p>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    {section.bullets.map((line) => (
                      <li key={line} className="text-pretty leading-relaxed">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-pretty">
              {t("whatsNew.fallback", { version })}
            </p>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={dismiss}>
            {t("whatsNew.gotIt")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
