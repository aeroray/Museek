import { useCallback, useRef, useState } from "react"

/**
 * Pointer-based drag-to-reorder. Native HTML5 drag-and-drop is unreliable inside
 * the Tauri WebView2, so we track pointer events ourselves and find the drop
 * target via `document.elementFromPoint` + a `data-drag-index` attribute on each
 * item. A small movement threshold lets the same element still receive clicks
 * (use `consumeDrag()` inside onClick to skip the click after an actual drag).
 *
 * Wire up: spread `onPointerDown(index)` + `onPointerMove` + `onPointerUp` on the
 * drag handle (or the item itself), put `data-drag-index={index}` on each item,
 * and add `touch-none` so touch gestures don't scroll mid-drag.
 */
export function useDragSort(onReorder: (from: number, to: number) => void, threshold = 5) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const ref = useRef<{ index: number; over: number; x: number; y: number; active: boolean } | null>(null)
  const draggedRef = useRef(false)

  const onPointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      if (e.button !== 0) return
      ref.current = { index, over: index, x: e.clientX, y: e.clientY, active: false }
      draggedRef.current = false
    },
    []
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const s = ref.current
      if (!s) return
      if (!s.active) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < threshold) return
        s.active = true
        draggedRef.current = true
        setDragIndex(s.index)
        setOverIndex(s.index)
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {
          /* setPointerCapture can throw if the pointer is already released */
        }
      }
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
        "[data-drag-index]"
      ) as HTMLElement | null
      if (target) {
        const idx = Number(target.getAttribute("data-drag-index"))
        if (!Number.isNaN(idx) && idx !== s.over) {
          s.over = idx
          setOverIndex(idx)
        }
      }
    },
    [threshold]
  )

  const onPointerUp = useCallback(() => {
    const s = ref.current
    if (s?.active && s.over !== s.index) onReorder(s.index, s.over)
    setDragIndex(null)
    setOverIndex(null)
    ref.current = null
  }, [onReorder])

  /** True (and resets) when the last pointer gesture was a drag — call in onClick. */
  const consumeDrag = useCallback(() => {
    const dragged = draggedRef.current
    draggedRef.current = false
    return dragged
  }, [])

  return { dragIndex, overIndex, onPointerDown, onPointerMove, onPointerUp, consumeDrag }
}
