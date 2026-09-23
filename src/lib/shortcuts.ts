import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  SHORTCUT_ACTIONS,
  activeGlobalShortcuts,
  eventMatchesShortcut,
  formatShortcut,
  isShortcutCaptureLocked,
  type ShortcutAction,
  type ShortcutMap,
} from "@/lib/shortcutKeys";
import { runShortcutAction } from "@/lib/shortcutActions";
import { isShortcutBlockedTarget } from "@/lib/shortcutTargets";
import { notify } from "@/lib/notify";
import { t } from "@/lib/i18n";
import { isMacOs } from "@/lib/os";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let registerGeneration = 0;

export function describeShortcutError(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    for (const key of ["message", "error", "reason"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {
      /* ignore */
    }
  }
  return String(err);
}

function isHotkeyTakenError(reason: string): boolean {
  const lower = reason.toLowerCase();
  return (
    lower.includes("already registered") ||
    lower.includes("already taken") ||
    lower.includes("hotkey already") ||
    lower.includes("error_hotkey_already_registered") ||
    /\b1409\b/.test(reason)
  );
}

export function formatShortcutOsFailure(combo: string, reason: string): string {
  if (isHotkeyTakenError(reason)) {
    return t("shortcuts.osBusy", { combo });
  }
  return t("shortcuts.osFailed", { combo });
}

export async function suspendGlobalShortcuts(): Promise<void> {
  registerGeneration += 1;
  if (!isTauri) return;
  try {
    const { unregisterAll } = await import(
      "@tauri-apps/plugin-global-shortcut"
    );
    await unregisterAll();
  } catch {
    /* nothing registered yet */
  }
}

export async function resumeGlobalShortcuts(): Promise<void> {
  if (!isTauri) return;
  const { hydrated, shortcuts, disabledGlobalShortcuts } =
    useSettingsStore.getState();
  if (!hydrated) return;
  await syncGlobalShortcuts(shortcuts, disabledGlobalShortcuts, { silent: true });
}

/** Try the OS hotkey table without keeping the binding. */
export async function probeGlobalShortcut(
  accel: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isTauri) return { ok: true };
  try {
    const { register, unregister, isRegistered } = await import(
      "@tauri-apps/plugin-global-shortcut"
    );
    if (await isRegistered(accel)) return { ok: true };
    await register(accel, () => {});
    try {
      await unregister(accel);
    } catch (err) {
      console.warn(`[museek] probe unregister failed: ${accel}`, err);
    }
    return { ok: true };
  } catch (err) {
    const reason = describeShortcutError(err);
    console.error(`[museek] global shortcut probe failed: ${accel}`, reason, err);
    return { ok: false, reason };
  }
}

async function syncGlobalShortcuts(
  map: ShortcutMap,
  disabled: readonly ShortcutAction[],
  options: { silent?: boolean } = {},
): Promise<void> {
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
  // Only bound, valid, ENABLED shortcuts reach the OS. A disabled action keeps
  // its binding but releases the combo so other applications can use it.
  const reverse = activeGlobalShortcuts(map, disabled);
  const failed: { combo: string; reason: string }[] = [];
  for (const { accel, action } of reverse) {
    try {
      await register(accel, (event) => {
        if (event.state !== "Pressed") return;
        if (isShortcutCaptureLocked()) return;
        runShortcutAction(action);
      });
    } catch (err) {
      const reason = describeShortcutError(err);
      const combo = formatShortcut(accel, isMacOs());
      console.error(`[museek] global shortcut failed: ${accel}`, reason, err);
      failed.push({ combo, reason });
    }
    if (gen !== registerGeneration) return;
  }
  if (options.silent) return;
  if (failed.length === 1) {
    notify({
      message: formatShortcutOsFailure(failed[0].combo, failed[0].reason),
      variant: "error",
    });
  } else if (failed.length > 1) {
    notify({
      message: t("shortcuts.registerFailedMany", { n: failed.length }),
      variant: "error",
    });
  }
}

/**
 * Window-local keydown for in-app bindings (and global ones while focused),
 * plus OS hotkeys for the global map.
 */
export function useGlobalShortcuts(): void {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const localShortcuts = useSettingsStore((s) => s.localShortcuts);
  const disabledGlobalShortcuts = useSettingsStore(
    (s) => s.disabledGlobalShortcuts,
  );

  useEffect(() => {
    if (!hydrated) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isShortcutCaptureLocked() || isShortcutBlockedTarget(e.target, e.key))
        return;
      // The in-app bindings stay live even for an action whose GLOBAL hotkey is
      // disabled: the user is freeing a combo for another application, not
      // turning the feature off inside Museek, and a focused window cannot
      // conflict with anything else.
      const maps = [localShortcuts, shortcuts];
      for (const map of maps) {
        for (const action of SHORTCUT_ACTIONS) {
          if (!map[action] || !eventMatchesShortcut(e, map[action])) continue;
          if (!runShortcutAction(action)) return;
          e.preventDefault();
          e.stopPropagation();
          const active = document.activeElement;
          if (active instanceof HTMLElement && active !== document.body) {
            active.blur();
          }
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey, true);

    if (!isTauri) {
      return () => window.removeEventListener("keydown", onKey, true);
    }

    void syncGlobalShortcuts(shortcuts, disabledGlobalShortcuts);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      registerGeneration += 1;
      void import("@tauri-apps/plugin-global-shortcut")
        .then((m) => m.unregisterAll())
        .catch(() => {});
    };
  }, [hydrated, localShortcuts, shortcuts, disabledGlobalShortcuts]);
}
