import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Text field.
 *
 * The focus ring is `ring-inset`, which paints *inside* the border box. The
 * default outset ring paints outside it (2px offset + 2px ring = 4px of overhang
 * on every side), and any ancestor with `overflow-hidden` tighter than that will
 * slice it off — exactly what happened to the search boxes sitting in
 * fixed-height toolbars. Two things keep the inset ring intact:
 *
 *  - needing no overhang at all, it cannot be clipped, no matter how tight the
 *    surrounding layout is. This is the real fix.
 *  - the border still changes colour on focus, so the state is legible even
 *    where a ring would be invisible against an adjacent element.
 *
 * The ring is 1.5px rather than 2px because it sits directly against the 1px
 * border of the same colour — the two read as a single stroke, so a 2px ring
 * looked like a 3px edge. At 1.5px the focus edge is ~2.5px: still unmistakable
 * but no longer heavier than the control it belongs to.
 *
 * Do not go back to an outset ring here without also auditing every container
 * that hosts an Input for `overflow-hidden`.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-input/80 bg-background/80 px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/70 transition-[box-shadow,border-color,background-color] duration-200 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[1.5px] focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
