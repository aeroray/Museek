import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

const DEFAULT_ROW = 56
const OVERSCAN = 10

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
