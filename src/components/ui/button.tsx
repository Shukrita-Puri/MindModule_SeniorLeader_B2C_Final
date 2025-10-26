
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 
          "bg-primary text-primary-foreground hover:bg-background hover:text-primary border-2 border-transparent hover:border-gold rounded-xl shadow-[0_4px_12px_rgba(74,44,42,0.15),0_8px_24px_rgba(74,44,42,0.1)] hover:shadow-[0_8px_20px_rgba(74,44,42,0.2),0_12px_32px_rgba(74,44,42,0.15)]",
        secondary: 
          "bg-secondary text-secondary-foreground border border-gold rounded-xl hover:bg-background hover:text-primary transition-colors",
        ghost: 
          "bg-transparent text-primary hover:text-primary/80 hover:underline decoration-gold decoration-1 underline-offset-4",
        outline:
          "border border-gold bg-background text-primary hover:bg-primary hover:text-primary-foreground rounded-xl",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl",
        link: 
          "text-primary underline-offset-4 hover:underline decoration-gold",
      },
      size: {
        default: "h-10 px-6 py-2 text-base",
        sm: "h-8 rounded-xl px-4 text-sm",
        lg: "h-12 rounded-xl px-10 text-lg",
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
