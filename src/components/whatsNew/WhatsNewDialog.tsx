import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getWhatsNew,
  listWhatsNew,
  setSeenVersion,
  shouldShowWhatsNew,
  subscribeWhatsNewOpen,
  type WhatsNewCopy,
} from "@/lib/whatsNew"
import { useLangStore, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const SHOW_DELAY_MS = 1200

function ReleaseBody({ copy }: { copy: WhatsNewCopy }) {
  return (
    <div className="space-y-3 text-sm">
      {copy.sections.map((section) => (
        <div key={section.title} className="space-y-1.5">
          <p className="font-medium text-foreground">{section.title}</p>
          <ul className="space-y-1 pl-0.5 text-muted-foreground">
            {section.bullets.map((line) => (
              <li key={line} className="flex gap-2 text-pretty leading-relaxed">
                <span className="mt-[0.55em] size-1 shrink-0 rounded-full bg-muted-foreground/55" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/**
 * Changelog dialog — auto-opens once after an upgrade, and anytime via
 * `openWhatsNew()` (About → Changelog). Shows the current release first,
 * then earlier versions.
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

  const releases = listWhatsNew(lang)
  const currentKey = version.replace(/^v/i, "")
  const current = releases.find((r) => r.version === currentKey)
  const history = releases.filter((r) => r.version !== currentKey)
  const currentCopy = current?.copy ?? getWhatsNew(version, lang)

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
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("whatsNew.title")}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[min(28rem,55vh)] pr-3">
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight">
                  v{currentKey}
                </h3>
                <Badge
                  variant="secondary"
                  className="rounded-md px-1.5 py-0 text-[10px] font-medium"
                >
                  {t("whatsNew.current")}
                </Badge>
              </div>
              {currentCopy ? (
                <ReleaseBody copy={currentCopy} />
              ) : (
                <p className="text-sm text-muted-foreground text-pretty">
                  {t("whatsNew.fallback", { version: currentKey })}
                </p>
              )}
            </section>

            {history.length > 0 && (
              <section className="space-y-4 border-t border-border/60 pt-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("whatsNew.earlier")}
                </p>
                {history.map((release, i) => (
                  <div
                    key={release.version}
                    className={cn("space-y-2.5", i > 0 && "border-t border-border/40 pt-4")}
                  >
                    <h3 className="text-sm font-semibold tracking-tight text-foreground/90">
                      v{release.version}
                    </h3>
                    <div className="opacity-90">
                      <ReleaseBody copy={release.copy} />
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
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
