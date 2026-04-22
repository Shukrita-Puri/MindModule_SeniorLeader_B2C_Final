import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { EngravedFill } from "@/components/ui/engraved-fill"

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

const sliderRangeVariants = cva("absolute h-full overflow-hidden", {
  variants: {
    variant: {
      default: "bg-primary",
      luxury:
        "bg-[linear-gradient(90deg,#d8553f_0%,#e88a52_25%,#d4b75a_50%,#7ba87a_75%,#3d6fa8_100%)]",
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
        luxury:
          "relative h-8 w-8 shadow-[0_2px_8px_rgba(0,0,0,0.15)] border-primary/80 ring-1 ring-inset ring-black/20 after:content-[''] after:absolute after:inset-1.5 after:rounded-full after:bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.35)_0_0.5px,transparent_0.5px_2px)]",
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
      {variant === "luxury" && (
        <EngravedFill density={3} opacity={0.10} />
      )}
      <SliderPrimitive.Range className={sliderRangeVariants({ variant })}>
        {variant === "luxury" && (
          <EngravedFill density={3} opacity={0.15} crossHatch />
        )}
      </SliderPrimitive.Range>
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className={sliderThumbVariants({ variant })} />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
