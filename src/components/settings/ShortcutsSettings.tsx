import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  isValidLocalShortcut,
  setShortcutCaptureLock,
  shortcutConflict,
  shortcutFromEvent,
  type ShortcutAction,
  type ShortcutSlot,
} from "@/lib/shortcutKeys";
import {
  formatShortcutOsFailure,
  probeGlobalShortcut,
  resumeGlobalShortcuts,
  suspendGlobalShortcuts,
} from "@/lib/shortcuts";
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
  | { titleKey: string; action: ShortcutAction }
  | { titleKey: string; staticKeys: string[] };

const ROWS: ShortcutRow[] = [
  { titleKey: "shortcuts.playPause", action: "playPause" },
  { titleKey: "shortcuts.seekBack", action: "seekBack" },
  { titleKey: "shortcuts.seekForward", action: "seekForward" },
  { titleKey: "shortcuts.prev", action: "prev" },
  { titleKey: "shortcuts.next", action: "next" },
  { titleKey: "shortcuts.volumeUp", action: "volumeUp" },
  { titleKey: "shortcuts.volumeDown", action: "volumeDown" },
  { titleKey: "shortcuts.mute", action: "mute" },
  { titleKey: "shortcuts.lyrics", action: "lyrics" },
  { titleKey: "shortcuts.desktopLyrics", action: "desktopLyrics" },
  { titleKey: "shortcuts.desktopLyricsMode", action: "desktopLyricsLock" },
  {
    titleKey: "shortcuts.desktopLyricsFont",
    staticKeys: ["Ctrl/⌘ + Wheel"],
  },
  { titleKey: "shortcuts.mini", action: "mini" },
];

type Recording = { action: ShortcutAction; slot: ShortcutSlot };

function Keycap({
  children,
  active,
  muted,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "inline-flex h-6 max-w-full min-w-[1.5rem] items-center justify-center rounded-md border border-border/80 bg-muted px-1.5 text-[11px] font-medium leading-none whitespace-nowrap",
    muted ? "text-muted-foreground" : "text-foreground/75",
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

function ColumnLabel({
  label,
  hint,
}: {
  label: string;
  hint: string;
}) {
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <span className="text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

export function ShortcutsSettings() {
  const t = useT();
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const localShortcuts = useSettingsStore((s) => s.localShortcuts);
  const setShortcut = useSettingsStore((s) => s.setShortcut);
  const setLocalShortcut = useSettingsStore((s) => s.setLocalShortcut);
  const resetShortcuts = useSettingsStore((s) => s.resetShortcuts);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [draft, setDraft] = useState("");
  const shortcutsRef = useRef(shortcuts);
  const localsRef = useRef(localShortcuts);
  const tRef = useRef(t);
  shortcutsRef.current = shortcuts;
  localsRef.current = localShortcuts;
  tRef.current = t;

  const startRecording = (action: ShortcutAction, slot: ShortcutSlot) => {
    setRecording((current) =>
      current?.action === action && current.slot === slot
        ? null
        : { action, slot },
    );
  };

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

      const { action, slot } = recording;
      const tr = tRef.current;
      const globals = shortcutsRef.current;
      const locals = localsRef.current;
      const current = slot === "global" ? globals[action] : locals[action];
      const save = slot === "global" ? setShortcut : setLocalShortcut;

      if (
        (e.key === "Backspace" || e.key === "Delete") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        if (!current) {
          setRecording(null);
          return;
        }
        if (!save(action, null)) return;
        if (slot === "global" && action === "desktopLyricsLock") {
          notify({ message: tr("shortcuts.lockGlobalWarn"), variant: "info" });
        } else {
          notify({ message: tr("shortcuts.cleared"), variant: "success" });
        }
        setRecording(null);
        return;
      }

      if (hasForbiddenModifier(e)) {
        notify({
          message: tr(isMacOs() ? "shortcuts.macCtrlHeld" : "shortcuts.winHeld"),
          variant: "error",
        });
        return;
      }

      const accel = shortcutFromEvent(e);
      const combo = accel ? formatShortcut(accel) : formatHeldShortcut(e);
      if (!accel) {
        notify({
          message: tr(
            slot === "global" ? "shortcuts.invalid" : "shortcuts.invalidLocal",
          ),
          variant: "error",
        });
        return;
      }
      if (
        slot === "global"
          ? !isValidGlobalShortcut(accel)
          : !isValidLocalShortcut(accel)
      ) {
        notify({
          message: tr(
            slot === "global" ? "shortcuts.invalid" : "shortcuts.invalidLocal",
          ),
          variant: "error",
        });
        return;
      }

      const conflict = shortcutConflict(globals, locals, action, accel);
      if (conflict) {
        failConflict(combo, conflict);
        return;
      }
      if (current === accel) {
        notify({ message: tr("shortcuts.saved", { combo }), variant: "success" });
        setRecording(null);
        return;
      }

      const commit = () => {
        if (!save(action, accel)) {
          const taken = shortcutConflict(
            shortcutsRef.current,
            localsRef.current,
            action,
            accel,
          );
          if (taken) failConflict(combo, taken);
          else {
            notify({
              message: tr(
                slot === "global" ? "shortcuts.invalid" : "shortcuts.invalidLocal",
              ),
              variant: "error",
            });
          }
          return false;
        }
        notify({ message: tr("shortcuts.saved", { combo }), variant: "success" });
        setRecording(null);
        return true;
      };

      if (slot !== "global") {
        commit();
        return;
      }

      probing = true;
      void (async () => {
        const probe = await probeGlobalShortcut(accel);
        if (cancelled) return;
        if (!probe.ok) {
          const taken = shortcutConflict(globals, locals, action, accel);
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
        commit();
        probing = false;
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
  }, [recording, setLocalShortcut, setShortcut]);

  const bindingLabel = (
    action: ShortcutAction,
    slot: ShortcutSlot,
    accel: string,
  ) => {
    if (recording?.action === action && recording.slot === slot) {
      return draft || t("shortcuts.recording");
    }
    return accel ? formatShortcut(accel) : t("shortcuts.unset");
  };

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
          <div className="flex items-center gap-3 px-3.5 py-1.5">
            <span className="min-w-0 flex-1" />
            <div className="flex w-[8.5rem] justify-end">
              <ColumnLabel
                label={t("shortcuts.scopeLocal")}
                hint={t("shortcuts.localHint")}
              />
            </div>
            <div className="flex w-[11rem] justify-end">
              <ColumnLabel
                label={t("shortcuts.scopeGlobal")}
                hint={t("shortcuts.globalHint")}
              />
            </div>
          </div>
          {ROWS.map((row) => (
            <div
              key={row.titleKey}
              className="flex items-center gap-3 px-3.5 py-2"
            >
              <span className="min-w-0 flex-1 text-sm font-medium leading-none">
                {t(row.titleKey)}
              </span>
              {"staticKeys" in row ? (
                <>
                  <div className="flex w-[8.5rem] flex-wrap justify-end gap-1">
                    {row.staticKeys.map((label) => (
                      <Keycap key={label}>{label}</Keycap>
                    ))}
                  </div>
                  <div className="flex w-[11rem] justify-end">
                    <span className="text-[11px] text-muted-foreground">—</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex w-[8.5rem] justify-end">
                    <Keycap
                      active={
                        recording?.action === row.action &&
                        recording.slot === "local"
                      }
                      muted={!localShortcuts[row.action]}
                      onClick={() => startRecording(row.action, "local")}
                    >
                      {bindingLabel(
                        row.action,
                        "local",
                        localShortcuts[row.action],
                      )}
                    </Keycap>
                  </div>
                  <div className="flex w-[11rem] justify-end">
                    <Keycap
                      active={
                        recording?.action === row.action &&
                        recording.slot === "global"
                      }
                      muted={!shortcuts[row.action]}
                      onClick={() => startRecording(row.action, "global")}
                    >
                      {bindingLabel(row.action, "global", shortcuts[row.action])}
                    </Keycap>
                  </div>
                </>
              )}
            </div>
          ))}
        </SettingsCard>
      </div>
    </ScrollArea>
  );
}
