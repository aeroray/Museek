import { create } from "zustand"
import type { DownloadProgress, UpdateInfo } from "@/lib/updater"
import { checkForAppUpdate, installAppUpdate } from "@/lib/updater"
import { notify } from "@/lib/notify"
import { t } from "@/lib/i18n"

export type UpdatePhase = "idle" | "available" | "downloading" | "installing" | "error"

interface UpdateState {
  available: UpdateInfo | null
  /** User dismissed the sidebar “available” card for this session */
  dismissed: boolean
  checking: boolean
  /** True after the one-shot startup check finishes (success or fail). */
  startupChecked: boolean
  /** Epoch ms of last successful check (update found or already latest). */
  lastCheckedAt: number | null
  phase: UpdatePhase
  progress: DownloadProgress | null
  installError: string | null
  setAvailable: (info: UpdateInfo | null) => void
  dismiss: () => void
  /**
   * One automatic check per app launch. Shows sidebar card + toast when a
   * newer version is found; stays quiet on network failure.
   */
  checkOnStartup: () => Promise<void>
  /** Manual check from About. Throws/toasts on failure; button stays “check”. */
  checkNow: () => Promise<UpdateInfo | null>
  /** Silent download + install + relaunch. Progress drives the sidebar card. */
  install: () => Promise<void>
  isUpdating: () => boolean
  /** True only while the installer is applying — quit may be blocked briefly. */
  isInstalling: () => boolean
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  dismissed: false,
  checking: false,
  startupChecked: false,
  lastCheckedAt: null,
  phase: "idle",
  progress: null,
  installError: null,

  setAvailable: (info) =>
    set({
      available: info,
      dismissed: false,
      phase: info ? "available" : "idle",
    }),

  dismiss: () => {
    if (get().isUpdating()) return
    set({ dismissed: true })
  },

  isUpdating: () => {
    const p = get().phase
    return p === "downloading" || p === "installing"
  },

  /** True only while the installer is applying (brief). Download stays non-blocking. */
  isInstalling: () => get().phase === "installing",

  checkOnStartup: async () => {
    if (get().startupChecked || get().checking || get().isUpdating()) return
    set({ checking: true })
    try {
      const info = await checkForAppUpdate()
      const now = Date.now()
      if (info) {
        set({
          available: info,
          dismissed: false,
          lastCheckedAt: now,
          phase: "available",
          installError: null,
        })
        notify({
          message: t("update.availableToast", { version: info.version }),
          variant: "info",
          actionLabel: t("update.goInstall"),
          actionTo: "/settings?tab=about",
        })
      } else {
        set({
          available: null,
          lastCheckedAt: now,
          phase: "idle",
        })
      }
    } catch {
      /* Network / GitHub blocked — stay quiet on startup; button unchanged */
    } finally {
      set({ checking: false, startupChecked: true })
    }
  },

  checkNow: async () => {
    if (get().checking || get().isUpdating()) return get().available
    set({ checking: true, installError: null })
    try {
      const info = await checkForAppUpdate()
      const now = Date.now()
      if (info) {
        set({
          available: info,
          dismissed: false,
          lastCheckedAt: now,
          phase: "available",
        })
        return info
      }
      set({ available: null, lastCheckedAt: now, phase: "idle" })
      notify({ message: t("about.upToDate"), variant: "success" })
      return null
    } catch (e) {
      notify({
        message: t("about.checkFailed", {
          msg: String(e instanceof Error ? e.message : e),
        }),
        variant: "error",
      })
      throw e
    } finally {
      set({ checking: false })
    }
  },

  install: async () => {
    const { available, isUpdating } = get()
    if (isUpdating()) return
    if (!available) return

    set({
      phase: "downloading",
      progress: { percent: null, downloaded: 0, total: null, phase: "downloading" },
      installError: null,
      dismissed: false,
    })

    try {
      await installAppUpdate(
        (p) => {
          const nextPhase = p.phase === "installing" ? "installing" : "downloading"
          set({
            progress: p,
            phase: nextPhase,
          })
        },
        available.downloadUrls,
      )
      // relaunch() normally kills us; if it returns, treat as done.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({
        phase: "error",
        installError: msg,
        progress: null,
      })
      notify({
        message: t("about.updateFailed", { msg }),
        variant: "error",
      })
    }
  },
}))
