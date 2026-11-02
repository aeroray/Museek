import { useEffect, useRef, useState } from "react";
import { X, Trash2, Music } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PlatformBadge, QualityBadge } from "@/components/common/MetaBadges";
import { usePlayerStore } from "@/stores/playerStore";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function PlayQueue() {
  const {
    queue,
    queueIndex,
    showQueue,
    isPlaying,
    setShowQueue,
    playFromQueue,
    clearQueue,
    removeFromQueue,
  } = usePlayerStore();
  const t = useT();
  const [confirmClear, setConfirmClear] = useState(false);
  const activeItemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showQueue || queueIndex < 0 || queueIndex >= queue.length) return;

    const frame = window.requestAnimationFrame(() => {
      activeItemRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [queue.length, queueIndex, showQueue]);

  return (
    <>
      <Drawer
        open={showQueue}
        onOpenChange={setShowQueue}
        swipeDirection="right"
      >
        <DrawerContent className="data-[swipe-axis=x]:[--drawer-content-width:min(100%,22.5rem)]">
          <DrawerHeader className="border-b border-border/60 relative pr-12">
            <DrawerTitle>{t("queue.title")}</DrawerTitle>
            <DrawerDescription>
              {t("queue.count", { count: queue.length })}
            </DrawerDescription>
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

            {/*
              "Clear" lives in the HEADER, not in a footer.

              It used to be a full-width footer button pinned just above the
              bottom of the window, directly above the player bar's queue
              toggle that opens this drawer. The pointer is therefore already
              over Clear the moment the drawer finishes sliding in, so a second
              click — or a double-click on the toggle — lands on Clear without
              the user having aimed at anything. Up here it is far from both the
              pointer and the close button, and it reads as a list-header action
              rather than a primary one.
            */}
            {queue.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 mt-1 h-7 self-start px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 size={13} className="mr-1.5" />
                {t("queue.clear")}
              </Button>
            )}
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
              {/*
                The shared ScrollArea, not a hand-styled native scroller.

                This list used to be `overflow-y-auto` with its own
                `[scrollbar-width:thin]` + `[&::-webkit-scrollbar]:w-1.5` rules.
                That made it the only list in the app drawing a raw native bar:
                everywhere else the app renders Radix's ScrollArea thumb
                (`w-2.5`, `bg-border`, hover-revealed). So the queue looked and
                behaved differently — a thin permanent native bar instead of the
                app's wider auto-hiding one. Moving it onto the shared component
                fixes the appearance and gives it the same overlay behaviour as
                the mini player's queue, which already used ScrollArea.
              */}
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-0.5 p-2">
                  {queue.map((item, i) => {
                    const active = i === queueIndex;
                    return (
                      <div
                        key={`${item.music.id}-${i}`}
                        ref={active ? activeItemRef : undefined}
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
                            <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                              <span
                                className={cn(
                                  "queue-equalizer",
                                  !isPlaying && "queue-equalizer--paused",
                                )}
                                aria-hidden="true"
                              >
                                <span className="queue-equalizer__bar" />
                                <span className="queue-equalizer__bar" />
                                <span className="queue-equalizer__bar" />
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p
                              className={cn(
                                "truncate text-sm",
                                active
                                  ? "font-medium text-primary"
                                  : "text-foreground",
                              )}
                            >
                              {item.music.name}
                            </p>
                            <PlatformBadge source={item.music.source} />
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-xs text-muted-foreground">
                              {item.music.singer}
                            </p>
                            <QualityBadge
                              quality={
                                // A per-song choice outranks the tier stamped at
                                // enqueue time; playedQuality still wins, since
                                // it records what a source really delivered.
                                item.playedQuality ??
                                item.qualityOverride ??
                                item.quality
                              }
                            />
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromQueue(i);
                          }}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
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
                clearQueue();
                setConfirmClear(false);
              }}
            >
              {t("queue.clear")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
