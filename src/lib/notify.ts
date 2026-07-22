/**
 * UI prompt port — domain modules call `notify()` / `promptDownloadLocation()`
 * instead of importing uiStore. App binds handlers once at startup.
 */
export type NotifyPayload = {
  message: string
  variant?: "error" | "info" | "success"
  actionLabel?: string
  actionTo?: string
}

type NotifyHandler = (payload: NotifyPayload) => void
type PromptHandler = () => void

let notifyHandler: NotifyHandler | null = null
let downloadLocationPromptHandler: PromptHandler | null = null

export function bindNotify(h: NotifyHandler): void {
  notifyHandler = h
}

export function bindDownloadLocationPrompt(h: PromptHandler): void {
  downloadLocationPromptHandler = h
}

export function notify(payload: NotifyPayload): void {
  notifyHandler?.(payload)
}

/** Ask the UI to open the “set download folder” prompt. */
export function promptDownloadLocation(): void {
  downloadLocationPromptHandler?.()
}
