import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { useSettingsStore } from "@/stores/settingsStore";
import { useT } from "@/lib/i18n";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  formatHeldShortcut,
  formatShortcut,
  hasForbiddenModifier,
  isModifierKey,
  isValidGlobalShortcut,
  setShortcutCaptureLock,
  shortcutConflict,
  shortcutFromEvent,
  type ShortcutAction,
} from "@/lib/shortcutKeys";
import { formatShortcutOsFailure, probeGlobalShortcut, resumeGlobalShortcuts, suspendGlobalShortcuts } from "@/lib/shortcuts";
import { isMacOs } from "@/lib/os";

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
    "inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border/80 bg-muted px-1.5 text-[11px] font-medium leading-none whitespace-nowrap text-foreground/75",
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
  const [draft, setDraft] = useState("");
  const shortcutsRef = useRef(shortcuts);
  const tRef = useRef(t);
  shortcutsRef.current = shortcuts;
  tRef.current = t;

  useEffect(() => {
    if (!recording) {
      setDraft("");
      return;
    }

    let cancelled = false;
    let probing = false;
    setShortcutCaptureLock(true);
    setDraft("");

    const failConflict = (combo: string, action: ShortcutAction) => {
      const tr = tRef.current;
      notify({
        message: tr("shortcuts.conflict", {
          combo,
          action: tr(ACTION_LABEL[action]),
        }),
        variant: "error",
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDraft(formatHeldShortcut(e));
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      if (isModifierKey(e) || probing) return;

      const tr = tRef.current;
      const map = shortcutsRef.current;

      if (hasForbiddenModifier(e)) {
        notify({
          message: tr(isMacOs() ? "shortcuts.macCtrlHeld" : "shortcuts.winHeld"),
          variant: "error",
        });
        return;
      }

      const accel = shortcutFromEvent(e);
      const combo = accel ? formatShortcut(accel) : formatHeldShortcut(e);
      if (!accel || !isValidGlobalShortcut(accel)) {
        notify({ message: tr("shortcuts.invalid"), variant: "error" });
        return;
      }
      const conflict = shortcutConflict(map, recording, accel);
      if (conflict) {
        failConflict(combo, conflict);
        return;
      }
      if (map[recording] === accel) {
        notify({ message: tr("shortcuts.saved", { combo }), variant: "success" });
        setRecording(null);
        return;
      }

      probing = true;
      void (async () => {
        const probe = await probeGlobalShortcut(accel);
        if (cancelled) return;
        if (!probe.ok) {
          const taken = shortcutConflict(map, recording, accel);
          if (taken) failConflict(combo, taken);
          else {
            notify({
              message: formatShortcutOsFailure(combo, probe.reason),
              variant: "error",
            });
          }
          probing = false;
          return;
        }
        if (!setShortcut(recording, accel)) {
          const taken = shortcutConflict(shortcutsRef.current, recording, accel);
          if (taken) failConflict(combo, taken);
          else notify({ message: tr("shortcuts.invalid"), variant: "error" });
          probing = false;
          return;
        }
        notify({ message: tr("shortcuts.saved", { combo }), variant: "success" });
        setRecording(null);
      })();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDraft(formatHeldShortcut(e));
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    void suspendGlobalShortcuts();

    return () => {
      cancelled = true;
      setShortcutCaptureLock(false);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      void resumeGlobalShortcuts();
    };
  }, [recording, setShortcut]);

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
                          ? draft || t("shortcuts.recording")
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
