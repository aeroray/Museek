import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/** Survives remounts so a second open of the same cover skips the fade-in. */
const readySrcs = new Set<string>()

function isCached(src: string): boolean {
  return readySrcs.has(src)
}

/**
 * Cover image with blur-up load:
 * soft pulsing placeholder → paint blurred → ease to sharp.
 * Already-decoded URLs (session cache) paint sharp immediately.
 *
 * Render your own fallback when `src` is empty — this returns null then.
 * `className` applies to the outer frame (sizing / absolute fill).
 */
export function CoverImage({
  src,
  alt = "",
  className,
  loading = "lazy",
  showOutline = true,
  onLoaded,
}: {
  src?: string | null
  alt?: string
  className?: string
  loading?: "lazy" | "eager"
  /** 1px image outline (default on). Disable for layered hero covers. */
  showOutline?: boolean
  /** Fires when load state flips (false on src change, true once ready). */
  onLoaded?: (loaded: boolean) => void
}) {
  const ref = useRef<HTMLImageElement>(null)
  const cached = !!src && isCached(src)
  const [decoded, setDecoded] = useState(cached)
  const [sharp, setSharp] = useState(cached)

  useEffect(() => {
    if (!src) {
      setDecoded(false)
      setSharp(false)
      onLoaded?.(false)
      return
    }
    if (isCached(src)) {
      setDecoded(true)
      setSharp(true)
      onLoaded?.(true)
      return
    }
    setDecoded(false)
    setSharp(false)
    onLoaded?.(false)
    const el = ref.current
    // Cached by the browser before React attached onLoad.
    if (el?.complete && el.naturalWidth > 0) {
      readySrcs.add(src)
      setDecoded(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSharp(true)
          onLoaded?.(true)
        })
      })
    }
    // onLoaded intentionally omitted — callers pass inline lambdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  if (!src) return null

  const markDecoded = () => {
    // Failed loads still leave the placeholder (don't pretend we have a cover).
    const el = ref.current
    if (el && el.naturalWidth === 0) {
      setDecoded(false)
      setSharp(false)
      onLoaded?.(false)
      return
    }
    readySrcs.add(src)
    setDecoded(true)
    // Two frames so the browser paints the blurred frame before unblurring.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSharp(true)
        onLoaded?.(true)
      })
    })
  }

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-muted", className)}>
      {/* Soft blur stand-in until the real cover is sharp — avoids an empty hole. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 z-[1] transition-opacity duration-500 ease-out",
          sharp ? "opacity-0 pointer-events-none" : "opacity-100",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-br from-muted-foreground/[0.14] via-muted to-muted-foreground/[0.08]",
            !decoded && "animate-pulse",
          )}
        />
        <div
          className={cn(
            "absolute inset-[-20%] scale-110 bg-gradient-to-tr from-background/40 via-transparent to-muted-foreground/10 blur-2xl",
            !decoded && "animate-pulse",
          )}
        />
      </div>

      <img
        ref={ref}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={markDecoded}
        onError={markDecoded}
        className={cn(
          "relative z-0 h-full w-full object-cover transition-[opacity,filter] duration-500 ease-out",
          showOutline &&
            "outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
          !decoded && "opacity-0 blur-2xl scale-105",
          decoded && !sharp && "opacity-100 blur-md scale-[1.02]",
          sharp && "opacity-100 blur-0 scale-100",
        )}
      />
    </div>
  )
}

/** Whether this cover URL has already been decoded this session. */
export function isCoverReady(src: string | null | undefined): boolean {
  return !!src && isCached(src)
}
