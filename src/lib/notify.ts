/**
 * Notifier port — domain modules call `notify()` instead of importing uiStore.
 * App binds the real toast handler once at startup.
 */
export type NotifyPayload = {
  message: string
  variant?: "error" | "info" | "success"
  actionLabel?: string
  actionTo?: string
}

type Handler = (payload: NotifyPayload) => void

let handler: Handler | null = null

export function bindNotify(h: Handler): void {
  handler = h
}

export function notify(payload: NotifyPayload): void {
  handler?.(payload)
}
