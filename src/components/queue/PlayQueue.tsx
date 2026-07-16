import { useState } from "react"
import { X, Trash2, Music, AudioLines } from "lucide-react"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { PlatformBadge, QualityBadge } from "@/components/common/MetaBadges"
import { usePlayerStore } from "@/stores/playerStore"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function PlayQueue() {
  const { queue, queueIndex, showQueue, isPlaying, setShowQueue, playFromQueue, clearQueue } =
    usePlayerStore()
  const t = useT()
  const [confirmClear, setConfirmClear] = useState(false)

  const removeAt = (i: number) => {
    const next = [...usePlayerStore.getState().queue]
    next.splice(i, 1)
    usePlayerStore.setState({ queue: next })
  }

  return (
    <>
      <Drawer open={showQueue} onOpenChange={setShowQueue} swipeDirection="right">
        <DrawerContent className="data-[swipe-axis=x]:[--drawer-content-width:min(100%,22.5rem)]">
          <DrawerHeader className="border-b border-border/60 relative pr-12">
            <DrawerTitle>{t("queue.title")}</DrawerTitle>
            <DrawerDescription>{t("queue.count", { count: queue.length })}</DrawerDescription>
            <DrawerClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-3 h-8 w-8 text-muted-foreground"
                />
              }
            >
              <X size={16} />
              <span className="sr-only">{t("common.cancel")}</span>
            </DrawerClose>
          </DrawerHeader>

          {queue.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center text-muted-foreground">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
                <Music size={24} />
              </div>
              <p className="text-sm">{t("queue.empty")}</p>
              <p className="mt-1 text-xs">{t("queue.emptyHint")}</p>
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto overscroll-contain p-2 pb-8 [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.25)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25 [&::-webkit-scrollbar-track]:bg-transparent">
                <div className="flex flex-col gap-0.5">
                  {queue.map((item, i) => {
                    const active = i === queueIndex
                    return (
                      <div
                        key={`${item.music.id}-${i}`}
                        className={cn(
                          "group flex cursor-pointer items-center gap-3 rounded-xl p-2 transition-colors duration-200",
                          active ? "bg-primary/10" : "hover:bg-accent/60",
                        )}
                        onClick={() => playFromQueue(i)}
                      >
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted shadow-[var(--shadow-border)]">
                          {item.music.meta.picUrl ? (
                            <img
                              src={item.music.meta.picUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <Music size={16} />
                            </div>
                          )}
                          {active && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                              <AudioLines
                                size={16}
                                className={cn("text-white", isPlaying && "icon-audio-pulse")}
                              />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p
                              className={cn(
                                "truncate text-sm",
                                active ? "font-medium text-primary" : "text-foreground",
                              )}
                            >
                              {item.music.name}
                            </p>
                            <PlatformBadge source={item.music.source} />
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-xs text-muted-foreground">{item.music.singer}</p>
                            <QualityBadge quality={item.playedQuality ?? item.quality} />
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeAt(i)
                          }}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* Soft fade into the footer so the list doesn't clip hard above 清空 */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-14 bg-gradient-to-t from-popover via-popover/75 to-transparent"
              />
            </div>
          )}

          {queue.length > 0 && (
            <DrawerFooter className="relative z-[2] pt-0">
              <Button
                variant="outline"
                className="w-full text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 size={15} className="mr-2" />
                {t("queue.clear")}
              </Button>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

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
    </>
  )
}
