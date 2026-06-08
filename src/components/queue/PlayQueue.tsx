import { useState } from "react"
import { X, Trash2, Music, AudioLines } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PlatformBadge, QualityBadge } from "@/components/MetaBadges"
import { usePlayerStore } from "@/stores/playerStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function PlayQueue() {
  const { queue, queueIndex, showQueue, isPlaying, setShowQueue, playFromQueue, clearQueue } = usePlayerStore()
  const t = useT()
  const [confirmClear, setConfirmClear] = useState(false)

  const removeAt = (i: number) => {
    const next = [...usePlayerStore.getState().queue]
    next.splice(i, 1)
    usePlayerStore.setState({ queue: next })
  }

  return (
    <Sheet open={showQueue} onOpenChange={setShowQueue}>
      <SheetContent side="right" className="w-[360px] p-0 gap-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border pr-12 space-y-0 text-left">
          <SheetTitle className="text-base">{t("queue.title")}</SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{t("queue.count", { count: queue.length })}</p>
        </SheetHeader>

        {queue.length === 0 ? (
          // Centered over the whole sheet (not just the area below the header) so
          // it reads as vertically centered. pointer-events-none keeps the header
          // close button clickable.
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-muted-foreground px-6 pointer-events-none">
            <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
              <Music size={24} />
            </div>
            <p className="text-sm">{t("queue.empty")}</p>
            <p className="text-xs mt-1">{t("queue.emptyHint")}</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-2 pb-16 space-y-0.5">
              {queue.map((item, i) => {
                const active = i === queueIndex
                return (
                  <div
                    key={`${item.music.id}-${i}`}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-xl cursor-pointer group transition-colors",
                      active ? "bg-primary/10" : "hover:bg-accent/60"
                    )}
                    onClick={() => playFromQueue(i)}
                  >
                    <div className="relative h-11 w-11 shrink-0 rounded-lg overflow-hidden bg-muted">
                      {item.music.meta.picUrl ? (
                        <img src={item.music.meta.picUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                          <Music size={16} />
                        </div>
                      )}
                      {active && (
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                          <AudioLines size={16} className={cn("text-white", isPlaying && "animate-pulse")} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <p className={cn("text-sm truncate", active ? "font-medium text-primary" : "text-foreground")}>
                          {item.music.name}
                        </p>
                        <PlatformBadge source={item.music.source} />
                      </div>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{item.music.singer}</p>
                        <QualityBadge quality={item.playedQuality ?? item.quality} />
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeAt(i)
                      }}
                    >
                      <X size={13} />
                    </Button>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}

        {queue.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmClear(true)}
            title={t("queue.clear")}
            className="absolute bottom-4 right-4 z-10 h-9 w-9 rounded-full border border-border bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            <Trash2 size={15} />
          </Button>
        )}

        <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("queue.clearConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("queue.clearConfirmDesc")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmClear(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  clearQueue()
                  setConfirmClear(false)
                }}
              >
                {t("queue.clear")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  )
}
