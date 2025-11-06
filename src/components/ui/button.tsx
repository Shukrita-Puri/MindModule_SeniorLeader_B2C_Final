
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-white/50 text-foreground border border-black/10 backdrop-blur-xl rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-white/80 hover:shadow-[0_6px_24px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-black/15 bg-transparent text-foreground hover:bg-black/[0.03] hover:border-black/25 transition-all duration-300",
        secondary:
          "bg-white/65 text-foreground border border-black/8 backdrop-blur-[30px] backdrop-saturate-150 shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:bg-white/85 hover:shadow-[0_6px_24px_rgba(0,0,0,0.1)] hover:-translate-y-0.5",
        ghost: "hover:bg-black/[0.03] hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
        forest: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        glass: "bg-white/50 backdrop-blur-xl border border-black/10 text-foreground hover:bg-white/80 transition-all duration-300",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-lg px-8",
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
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2" />
        )}
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
