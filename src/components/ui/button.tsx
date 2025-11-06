
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden",
  {
    variants: {
      variant: {
        default: 
          "bg-primary/10 text-foreground border border-primary/30 backdrop-blur-xl rounded-2xl shadow-[0_0_30px_rgba(0,217,255,0.2)] hover:bg-primary/20 hover:shadow-[0_0_50px_rgba(0,217,255,0.4)] hover:-translate-y-0.5 before:absolute before:inset-0 before:bg-gradient-to-r before:from-primary/0 before:via-primary/20 before:to-primary/0 before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700",
        secondary: 
          "bg-card/50 text-foreground border border-white/10 backdrop-blur-xl rounded-2xl hover:bg-card/70 hover:border-white/20 transition-all",
        ghost: 
          "bg-transparent text-foreground hover:text-primary hover:bg-primary/5 rounded-xl",
        outline:
          "border border-primary/50 bg-transparent text-foreground hover:bg-primary/10 hover:border-primary rounded-2xl backdrop-blur-sm",
        destructive:
          "bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 rounded-2xl backdrop-blur-xl",
        link: 
          "text-primary underline-offset-4 hover:underline",
        forest:
          "bg-emerald/10 text-emerald border border-emerald/30 hover:bg-emerald/20 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:shadow-[0_0_50px_rgba(16,185,129,0.4)] backdrop-blur-xl",
        glass:
          "bg-white/5 text-foreground border border-white/10 backdrop-blur-xl rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all",
      },
      size: {
        default: "h-10 px-6 py-2 text-base",
        sm: "h-8 rounded-xl px-4 text-sm",
        lg: "h-12 rounded-2xl px-10 text-lg",
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
