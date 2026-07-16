import { create } from "zustand"
import type { UpdateInfo } from "@/lib/updater"
import { checkForAppUpdate } from "@/lib/updater"

interface UpdateState {
  available: UpdateInfo | null
  /** User dismissed the sidebar card for this session */
  dismissed: boolean
  checking: boolean
  setAvailable: (info: UpdateInfo | null) => void
  dismiss: () => void
  /** Async background check; safe to call in web preview (mocks in DEV). */
  checkInBackground: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  dismissed: false,
  checking: false,
  setAvailable: (info) => set({ available: info, dismissed: false }),
  dismiss: () => set({ dismissed: true }),
  checkInBackground: async () => {
    if (get().checking) return
    set({ checking: true })
    try {
      const info = await checkForAppUpdate()
      if (info) set({ available: info, dismissed: false })
      else set({ available: null })
    } catch {
      /* network / unsigned release — stay quiet */
    } finally {
      set({ checking: false })
    }
  },
}))
