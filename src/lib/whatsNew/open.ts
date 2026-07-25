type Listener = () => void

const listeners = new Set<Listener>()

/** Open the What's New dialog (e.g. from About). */
export function openWhatsNew(): void {
  for (const cb of listeners) cb()
}

export function subscribeWhatsNewOpen(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
