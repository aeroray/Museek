import { useLayoutEffect, useRef } from "react"

/**
 * FLIP animation for reorderable lists. Returns a ref to put on the container;
 * each animated child must carry a stable `data-flip-id`. When `orderKey`
 * changes (i.e. the items were reordered), each item that moved is snapped to
 * its previous position and then transitioned to the new one — so a drop reorder
 * slides smoothly instead of jumping.
 */
export function useFlip(orderKey: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const positions = useRef<Map<string, DOMRect>>(new Map())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const items = container.querySelectorAll<HTMLElement>("[data-flip-id]")
    items.forEach((el) => {
      const id = el.dataset.flipId
      if (!id) return
      const next = el.getBoundingClientRect()
      const prev = positions.current.get(id)
      if (prev) {
        const dx = prev.left - next.left
        const dy = prev.top - next.top
        if (dx || dy) {
          el.style.transition = "none"
          el.style.transform = `translate(${dx}px, ${dy}px)`
          requestAnimationFrame(() => {
            el.style.transition = "transform 220ms cubic-bezier(0.2, 0, 0, 1)"
            el.style.transform = ""
          })
        }
      }
      positions.current.set(id, next)
    })
  }, [orderKey])

  return containerRef
}
