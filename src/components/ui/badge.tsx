import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 backdrop-blur-sm",
  {
    variants: {
      variant: {
        default:
          "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
        secondary:
          "border-white/10 bg-white/5 text-foreground hover:bg-white/10",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20",
        outline: "text-foreground border-white/20",
        metaskill: "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10",
        forest: "bg-emerald/10 border-emerald/30 text-emerald hover:bg-emerald/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
