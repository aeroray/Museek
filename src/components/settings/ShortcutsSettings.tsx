import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { useSettingsStore } from "@/stores/settingsStore";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  formatShortcut,
  isValidGlobalShortcut,
  setShortcutCaptureLock,
  shortcutConflict,
  shortcutFromEvent,
  type ShortcutAction,
} from "@/lib/shortcutKeys";

const ACTION_LABEL: Record<ShortcutAction, string> = {
  playPause: "shortcuts.playPause",
  seekBack: "shortcuts.seekBack",
  seekForward: "shortcuts.seekForward",
  prev: "shortcuts.prev",
  next: "shortcuts.next",
  volumeUp: "shortcuts.volumeUp",
  volumeDown: "shortcuts.volumeDown",
  mute: "shortcuts.mute",
  lyrics: "shortcuts.lyrics",
  desktopLyrics: "shortcuts.desktopLyrics",
  desktopLyricsLock: "shortcuts.desktopLyricsMode",
  mini: "shortcuts.mini",
};

type ShortcutRow =
  | { titleKey: string; actions: ShortcutAction[] }
  | { titleKey: string; staticKeys: string[] };

const ROWS: ShortcutRow[] = [
  { titleKey: "shortcuts.playPause", actions: ["playPause"] },
  { titleKey: "shortcuts.seek", actions: ["seekBack", "seekForward"] },
  { titleKey: "shortcuts.prevNext", actions: ["prev", "next"] },
  { titleKey: "shortcuts.volume", actions: ["volumeUp", "volumeDown"] },
  { titleKey: "shortcuts.mute", actions: ["mute"] },
  { titleKey: "shortcuts.lyrics", actions: ["lyrics"] },
  { titleKey: "shortcuts.desktopLyrics", actions: ["desktopLyrics"] },
  { titleKey: "shortcuts.desktopLyricsMode", actions: ["desktopLyricsLock"] },
  {
    titleKey: "shortcuts.desktopLyricsFont",
    staticKeys: ["Ctrl/⌘ + Wheel ↑", "Ctrl/⌘ + Wheel ↓"],
  },
  { titleKey: "shortcuts.mini", actions: ["mini"] },
];

function Keycap({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border/80 bg-muted px-1.5 text-[11px] font-medium leading-none text-foreground/75",
    onClick && "hover:bg-accent hover:text-foreground",
    active && "border-primary/50 bg-accent text-foreground",
  );
  if (!onClick) {
    return <span className={className}>{children}</span>;
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  );
}

export function ShortcutsSettings() {
  const t = useT();
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const setShortcut = useSettingsStore((s) => s.setShortcut);
  const resetShortcuts = useSettingsStore((s) => s.resetShortcuts);
  const [recording, setRecording] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    if (!recording) return;
    setShortcutCaptureLock(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      if (e.key === "Control" || e.key === "Meta" || e.key === "Alt" || e.key === "Shift") {
        return;
      }
      const accel = shortcutFromEvent(e);
      if (!accel || !isValidGlobalShortcut(accel)) {
        notify({ message: t("shortcuts.invalid"), variant: "error" });
        setRecording(null);
        return;
      }
      const conflict = shortcutConflict(shortcuts, recording, accel);
      if (conflict) {
        notify({
          message: t("shortcuts.conflict", { action: t(ACTION_LABEL[conflict]) }),
          variant: "error",
        });
        setRecording(null);
        return;
      }
      if (!setShortcut(recording, accel)) {
        notify({ message: t("shortcuts.invalid"), variant: "error" });
      }
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      setShortcutCaptureLock(false);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [recording, shortcuts, setShortcut, t]);

  return (
    <ScrollArea className="h-full">
      <div className="pr-3 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="px-1 text-xs text-muted-foreground">
            {t("shortcuts.desc")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 h-8"
            onClick={() => resetShortcuts()}
          >
            <RotateCcw size={14} className="mr-1.5" />
            {t("shortcuts.reset")}
          </Button>
        </div>
        <SettingsCard>
          {ROWS.map((row) => (
            <div
              key={row.titleKey}
              className="flex items-center justify-between gap-3 px-3.5 py-2"
            >
              <span className="min-w-0 text-sm font-medium leading-none">
                {t(row.titleKey)}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {"staticKeys" in row
                  ? row.staticKeys.map((label) => (
                      <Keycap key={label}>{label}</Keycap>
                    ))
                  : row.actions.map((action) => (
                      <Keycap
                        key={action}
                        active={recording === action}
                        onClick={() =>
                          setRecording((current) =>
                            current === action ? null : action,
                          )
                        }
                      >
                        {recording === action
                          ? t("shortcuts.recording")
                          : formatShortcut(shortcuts[action])}
                      </Keycap>
                    ))}
              </div>
            </div>
          ))}
        </SettingsCard>
      </div>
    </ScrollArea>
  );
}
