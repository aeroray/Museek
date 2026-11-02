import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-[color,background-color,border-color,opacity,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          // The border is not decoration. A flat fill has an antialiased edge
          // row wherever the button lands on a fractional y — and DialogContent
          // centres with `top:50% + translateY(-50%)`, so dialog footer buttons
          // routinely sit on x.5. When the fill itself paints that row, a
          // background-color transition re-resolves it and the top edge snaps
          // for a frame while the rest of the fill ramps: a visible flicker
          // along the top of the button.
          //
          // `outline` never showed it because `border-input` owns that row. The
          // saturated fill variants get the same guarantee here: a border in the
          // fill colour. Only the vertical sides are bordered — a left/right
          // border would add 2px to an auto-width button, and it is the
          // horizontal edges that sit on a fractional y.
          "bg-primary text-primary-foreground border-y border-primary hover:bg-primary/90 shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground border-y border-destructive hover:[background-color:color-mix(in_srgb,hsl(var(--destructive))_86%,black)]",
        outline: "border border-input bg-background/60 hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground border-y border-secondary hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Disable hover and press scaling when motion would feel distracting. */
  static?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, static: isStatic = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size }),
          // One motion rule for every button, whatever its size or variant.
          // `link` is the only exclusion: it renders as inline text, where a
          // lift or a press-shrink would move the sentence around it.
          // `static` opts out for OS chrome (see WindowControls) and for buttons
          // whose movement would misread (dialog confirm/cancel).
          !isStatic && variant !== "link" && "icon-motion",
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
