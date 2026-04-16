import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const sliderTrackVariants = cva(
  "relative w-full grow overflow-hidden rounded-full",
  {
    variants: {
      variant: {
        default: "h-2 bg-secondary",
        luxury: "h-4 bg-secondary",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

const sliderRangeVariants = cva("absolute h-full", {
  variants: {
    variant: {
      default: "bg-primary",
      luxury: "bg-gradient-to-r from-[#9ca3af] to-[#374151]",
    },
  },
  defaultVariants: { variant: "default" },
})

const sliderThumbVariants = cva(
  "block rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "h-5 w-5",
        luxury: "h-8 w-8 shadow-[0_2px_8px_rgba(0,0,0,0.15)] border-primary/80",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
    VariantProps<typeof sliderTrackVariants> {}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, variant, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className={sliderTrackVariants({ variant })}>
      <SliderPrimitive.Range className={sliderRangeVariants({ variant })} />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className={sliderThumbVariants({ variant })} />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
