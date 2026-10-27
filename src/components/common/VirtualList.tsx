import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

const DEFAULT_ROW = 56
const OVERSCAN = 10

/**
 * Bind a Radix ScrollArea's viewport element for VirtualList. Wrap the
 * ScrollArea in a div with this ref; the viewport is found once mounted.
 *
 * The ScrollArea is not necessarily present when this effect first runs — the
 * search page only renders it after a query (before that it shows the hot-search
 * cloud), and Radix itself mounts its viewport in a child effect. A single
 * bounded retry is not enough: it gives up while the node is still missing, and
 * since `deps` may never change again the caller is left holding `null` forever
 * — which silently disables virtualization and leaves the list blank on scroll.
 *
 * So keep watching for as long as the ref is mounted: first a cheap frame-based
 * poll (covers the common one-or-two-frame case), then a MutationObserver so a
 * node that appears much later — after a search, a tab switch, a route change —
 * is still picked up.
 */
export function useScrollAreaViewport(
  deps: unknown[] = [],
): [React.RefObject<HTMLDivElement | null>, HTMLElement | null] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState<HTMLElement | null>(null)
  useEffect(() => {
    let cancelled = false
    let raf = 0
    let tries = 0
    let observer: MutationObserver | null = null

    const find = (): HTMLElement | null => {
      const vp = ref.current?.querySelector("[data-radix-scroll-area-viewport]")
      return vp instanceof HTMLElement ? vp : null
    }

    const settle = () => {
      if (cancelled) return
      const vp = find()
      if (vp) {
        setViewport(vp)
        observer?.disconnect()
        observer = null
        return
      }
      if (++tries < 10) {
        raf = requestAnimationFrame(settle)
        return
      }
      // Not here yet: stop polling frames, but keep a cheap observer so a later
      // mount is still noticed.
      observer?.disconnect()
      observer = new MutationObserver(() => {
        if (cancelled) return
        const found = find()
        if (!found) return
        setViewport(found)
        observer?.disconnect()
        observer = null
      })
      if (ref.current) {
        observer.observe(ref.current, { childList: true, subtree: true })
      }
    }

    settle()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      observer?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return [ref, viewport]
}

/**
 * Windowed list for long song playlists. Only mounts rows near the viewport so
 * hover / paint stay snappy with hundreds of tracks. Expects a fixed-ish row
 * height (TrackRow ≈ 56px).
 */
export function VirtualList<T>({
  items,
  rowHeight = DEFAULT_ROW,
  scrollElement,
  getKey,
  children,
  className,
}: {
  items: T[]
  rowHeight?: number
  /** Radix ScrollArea viewport (or any overflow scroller). */
  scrollElement: HTMLElement | null
  getKey: (item: T, index: number) => string | number
  children: (item: T, index: number) => ReactNode
  className?: string
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(0)
  const rafScroll = useRef(0)

  useEffect(() => {
    if (!scrollElement) return

    const onScroll = () => {
      cancelAnimationFrame(rafScroll.current)
      rafScroll.current = requestAnimationFrame(() => {
        setScrollTop(scrollElement.scrollTop)
      })
    }
    const measure = () => setViewH(scrollElement.clientHeight)

    measure()
    onScroll()
    scrollElement.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(scrollElement)
    return () => {
      cancelAnimationFrame(rafScroll.current)
      scrollElement.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [scrollElement])

  const total = items.length * rowHeight
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const visible = Math.ceil((viewH || 600) / rowHeight) + OVERSCAN * 2
  const end = Math.min(items.length, start + visible)
  const offset = start * rowHeight
  const slice = useMemo(() => items.slice(start, end), [items, start, end])

  return (
    <div className={className} style={{ height: total, position: "relative" }}>
      <div style={{ transform: `translateY(${offset}px)` }}>
        {slice.map((item, i) => {
          const index = start + i
          return (
            <div key={getKey(item, index)} style={{ height: rowHeight }}>
              {children(item, index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
