import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  SHORTCUT_ACTIONS,
  eventMatchesShortcut,
  formatShortcut,
  isShortcutCaptureLocked,
  type ShortcutMap,
} from "@/lib/shortcutKeys";
import { runShortcutAction } from "@/lib/shortcutActions";
import { notify } from "@/lib/notify";
import { t } from "@/lib/i18n";
import { isMacOs } from "@/lib/os";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let registerGeneration = 0;

async function syncGlobalShortcuts(map: ShortcutMap): Promise<void> {
  const gen = ++registerGeneration;
  const { unregisterAll, register } = await import(
    "@tauri-apps/plugin-global-shortcut"
  );
  if (gen !== registerGeneration) return;
  try {
    await unregisterAll();
  } catch {
    /* nothing registered yet */
  }
  if (gen !== registerGeneration) return;
  const reverse = new Map<string, (typeof SHORTCUT_ACTIONS)[number]>();
  for (const action of SHORTCUT_ACTIONS) {
    if (!reverse.has(map[action])) reverse.set(map[action], action);
  }
  const failed: string[] = [];
  for (const [accel, action] of reverse) {
    try {
      await register(accel, (event) => {
        if (event.state !== "Pressed") return;
        if (isShortcutCaptureLocked()) return;
        runShortcutAction(action);
      });
    } catch (err) {
      console.warn(`[museek] global shortcut failed: ${accel}`, err);
      failed.push(formatShortcut(accel, isMacOs()));
    }
    if (gen !== registerGeneration) return;
  }
  if (failed.length === 1) {
    notify({
      message: t("shortcuts.registerFailed", { combo: failed[0] }),
      variant: "error",
    });
  } else if (failed.length > 1) {
    notify({
      message: t("shortcuts.registerFailedMany", { n: failed.length }),
      variant: "error",
    });
  }
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable
  );
}

/**
 * Registers every playback shortcut as an OS global hotkey (minimized / background).
 * The same map also runs on window keydown while focused (deduped with the OS hook).
 */
export function useGlobalShortcuts(): void {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const shortcuts = useSettingsStore((s) => s.shortcuts);

  useEffect(() => {
    if (!hydrated) return;

    const onKey = (e: KeyboardEvent) => {
      if (isShortcutCaptureLocked() || isTypingTarget(e.target)) return;
      for (const action of SHORTCUT_ACTIONS) {
        if (!eventMatchesShortcut(e, shortcuts[action])) continue;
        if (!runShortcutAction(action)) return;
        e.preventDefault();
        const active = document.activeElement;
        if (active instanceof HTMLElement && active !== document.body) {
          active.blur();
        }
        return;
      }
    };
    window.addEventListener("keydown", onKey);

    if (!isTauri) {
      return () => window.removeEventListener("keydown", onKey);
    }

    void syncGlobalShortcuts(shortcuts);
    return () => {
      window.removeEventListener("keydown", onKey);
      registerGeneration += 1;
      void import("@tauri-apps/plugin-global-shortcut")
        .then((m) => m.unregisterAll())
        .catch(() => {});
    };
  }, [hydrated, shortcuts]);
}
