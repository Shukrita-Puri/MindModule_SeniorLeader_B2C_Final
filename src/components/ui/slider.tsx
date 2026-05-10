import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { EngravedFill } from "@/components/ui/engraved-fill"

const LUXURY_SPECTRUMS = {
  luxury:
    "linear-gradient(90deg,#d8553f 0%,#e88a52 25%,#d4b75a 50%,#7ba87a 75%,#3d6fa8 100%)",
  sharpness:
    "linear-gradient(90deg,#FFE082 0%,#FFD54F 25%,#FFC107 50%,#FFA000 75%,#B8860B 100%)",
  clarity:
    "linear-gradient(90deg,#B2EBF2 0%,#80DEEA 25%,#26C6DA 50%,#0097A7 75%,#006064 100%)",
  confidence:
    "linear-gradient(90deg,#E0D4F5 0%,#B39DDB 25%,#7E57C2 50%,#3A1B82 75%,#080226 100%)",
  emotion:
    "linear-gradient(90deg,#FBE4E8 0%,#F4B5C0 25%,#E07A8E 50%,#A83A57 75%,#5C1A2E 100%)",
} as const

type LuxuryVariant = keyof typeof LUXURY_SPECTRUMS
const LUXURY_VARIANTS: readonly LuxuryVariant[] = [
  "luxury",
  "sharpness",
  "clarity",
  "confidence",
  "emotion",
]
const isLuxuryVariant = (v: unknown): v is LuxuryVariant =>
  typeof v === "string" && (LUXURY_VARIANTS as readonly string[]).includes(v)

const sliderTrackVariants = cva(
  "relative w-full grow overflow-hidden rounded-full",
  {
    variants: {
      variant: {
        default: "h-2 bg-secondary",
        luxury: "h-[18px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]",
        sharpness: "h-[18px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]",
        clarity: "h-[18px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]",
        confidence: "h-[18px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]",
        emotion: "h-[18px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.18)]",
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
        // transparent: the spectrum stays painted on the track underneath.
        // The traversed portion is signaled by an inner shadow + denser hatch.
        "bg-transparent shadow-[inset_-2px_0_4px_rgba(0,0,0,0.18),inset_0_1px_2px_rgba(0,0,0,0.22)]",
      sharpness:
        "bg-transparent shadow-[inset_-2px_0_4px_rgba(0,0,0,0.18),inset_0_1px_2px_rgba(0,0,0,0.22)]",
      clarity:
        "bg-transparent shadow-[inset_-2px_0_4px_rgba(0,0,0,0.18),inset_0_1px_2px_rgba(0,0,0,0.22)]",
      confidence:
        "bg-transparent shadow-[inset_-2px_0_4px_rgba(0,0,0,0.18),inset_0_1px_2px_rgba(0,0,0,0.22)]",
      emotion:
        "bg-transparent shadow-[inset_-2px_0_4px_rgba(0,0,0,0.18),inset_0_1px_2px_rgba(0,0,0,0.22)]",
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
          "relative h-[22px] w-[22px] border-0 bg-transparent p-0 shadow-none",
        sharpness:
          "relative h-[22px] w-[22px] border-0 bg-transparent p-0 shadow-none",
        clarity:
          "relative h-[22px] w-[22px] border-0 bg-transparent p-0 shadow-none",
        confidence:
          "relative h-[22px] w-[22px] border-0 bg-transparent p-0 shadow-none",
        emotion:
          "relative h-[22px] w-[22px] border-0 bg-transparent p-0 shadow-none",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
    VariantProps<typeof sliderTrackVariants> {}

/**
 * LuxuryThumb
 * A hand-drawn pencil disc: off-white fill, diagonal pencil hatch visible
 * across the entire disc, bounded by a single wavy hand-drawn outer ring.
 * Reads as a marker resting on the rail.
 */
const LuxuryThumb: React.FC = () => {
  const id = React.useId().replace(/:/g, "");
  const filterId = `thumb-roughen-${id}`;
  const hatchId = `thumb-hatch-${id}`;
  const clipId = `thumb-clip-${id}`;
  return (
    <svg
      viewBox="0 0 22 22"
      className="block h-[22px] w-[22px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
      aria-hidden="true"
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.7"
            numOctaves="2"
            seed="5"
          />
          <feDisplacementMap in="SourceGraphic" scale="0.9" />
        </filter>
        <pattern
          id={hatchId}
          patternUnits="userSpaceOnUse"
          width="2.6"
          height="2.6"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="2.6"
            stroke="rgba(0,0,0,0.55)"
            strokeWidth="0.6"
          />
        </pattern>
        <clipPath id={clipId}>
          <circle cx="11" cy="11" r="9.2" />
        </clipPath>
      </defs>
      {/* off-white disc base */}
      <circle cx="11" cy="11" r="9.5" fill="#fafaf7" />
      {/* diagonal pencil hatch across the entire disc */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="22" height="22" fill={`url(#${hatchId})`} />
      </g>
      {/* hand-drawn outer ring */}
      <circle
        cx="11"
        cy="11"
        r="9.3"
        fill="none"
        stroke="rgba(0,0,0,0.85)"
        strokeWidth="1.4"
        filter={`url(#${filterId})`}
      />
    </svg>
  );
};

/** 5 faint vertical pencil notches at the 1-5 stops on the rail. */
const LuxuryTicks: React.FC = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 flex items-center justify-between px-[6px]"
  >
    {[0, 1, 2, 3, 4].map((i) => (
      <span
        key={i}
        className="h-[10px] w-px bg-black/35"
        style={{ transform: "translateY(0)" }}
      />
    ))}
  </div>
);

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
    <SliderPrimitive.Track
      className={sliderTrackVariants({ variant })}
      style={
        isLuxuryVariant(variant)
          ? { backgroundImage: LUXURY_SPECTRUMS[variant] }
          : undefined
      }
    >
      {isLuxuryVariant(variant) && (
        <>
          {/* full-rail engraved hatch — always visible */}
          <div className="pointer-events-none absolute inset-0">
            <EngravedFill variant="refined" density={3} opacity={0.3} />
          </div>
          {/* discrete 1-5 tick notches */}
          <LuxuryTicks />
        </>
      )}
      <SliderPrimitive.Range className={sliderRangeVariants({ variant })}>
        {isLuxuryVariant(variant) && (
          <div className="pointer-events-none absolute inset-0">
            <EngravedFill variant="refined" density={3} opacity={0.22} />
          </div>
        )}
      </SliderPrimitive.Range>
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className={sliderThumbVariants({ variant })}>
      {isLuxuryVariant(variant) && <LuxuryThumb />}
    </SliderPrimitive.Thumb>
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
