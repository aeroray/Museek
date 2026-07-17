import { useMemo } from "react"
import { cn } from "@/lib/utils"
import iconSvg from "../../../app-icon.svg?raw"

type BrandMarkProps = {
  /** Animate equalizer bars (e.g. while audio is playing). */
  live?: boolean
  className?: string
  /** Hide the black rounded square — bars only. */
  barsOnly?: boolean
  title?: string
}

/**
 * Museek brand mark — geometry always comes from root `app-icon.svg`
 * (imported as raw SVG). Hover / `.live` equalizer motion is CSS-driven.
 */
export function BrandMark({ live = false, className, barsOnly = false, title }: BrandMarkProps) {
  const html = useMemo(() => {
    let svg = iconSvg
      .replace(/\sxmlns="[^"]*"/, "")
      .replace(/\swidth="[^"]*"/, "")
      .replace(/\sheight="[^"]*"/, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim()

    svg = svg.replace(
      /<svg\b([^>]*)>/,
      `<svg$1 role="img" aria-hidden="${title ? "false" : "true"}"${title ? ` aria-label="${title}"` : ""}>`,
    )

    if (barsOnly) {
      svg = svg.replace(/\s*<rect\b[^>]*class="mark-bg"[^/]*\/>/, "")
    }

    return svg
  }, [barsOnly, title])

  return (
    <span
      className={cn("brand-mark", live && "live", barsOnly && "bars-only", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
