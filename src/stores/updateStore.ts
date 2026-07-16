import { create } from "zustand"
import type { UpdateInfo } from "@/lib/updater"
import { checkForAppUpdate } from "@/lib/updater"
import { notify } from "@/lib/notify"
import { t } from "@/lib/i18n"

interface UpdateState {
  available: UpdateInfo | null
  /** User dismissed the sidebar card for this session */
  dismissed: boolean
  checking: boolean
  /** True after the one-shot startup check finishes (success or fail). */
  startupChecked: boolean
  setAvailable: (info: UpdateInfo | null) => void
  dismiss: () => void
  /**
   * One automatic check per app launch. Shows sidebar card + toast when a
   * newer version is found; stays quiet on network failure.
   */
  checkOnStartup: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  dismissed: false,
  checking: false,
  startupChecked: false,
  setAvailable: (info) => set({ available: info, dismissed: false }),
  dismiss: () => set({ dismissed: true }),
  checkOnStartup: async () => {
    if (get().startupChecked || get().checking) return
    set({ checking: true })
    try {
      const info = await checkForAppUpdate()
      if (info) {
        set({ available: info, dismissed: false })
        notify({
          message: t("update.availableToast", { version: info.version }),
          variant: "info",
          actionLabel: t("update.goUpdate"),
          actionTo: "/settings?tab=about",
        })
      } else {
        set({ available: null })
      }
    } catch {
      /* Network / GitHub blocked — stay quiet on startup */
    } finally {
      set({ checking: false, startupChecked: true })
    }
  },
}))
