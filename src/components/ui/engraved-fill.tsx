import * as React from "react";
import { cn } from "@/lib/utils";

interface EngravedFillProps {
  /** Spacing in px between hatch lines (lower = denser). Default 4. */
  density?: number;
  /** Overlay opacity 0-1. Default 0.12. */
  opacity?: number;
  /** Stroke color of the pencil hatch. Default near-black. */
  strokeColor?: string;
  /** Optional second cross-hatch direction for denser pencil feel. */
  crossHatch?: boolean;
  className?: string;
}

/**
 * EngravedFill
 * A reusable absolute-positioned SVG pattern overlay that gives any colored
 * surface a hand-drawn engraved-pencil feel. Multiplies onto the underlying
 * color so the base hex is preserved.
 */
export const EngravedFill: React.FC<EngravedFillProps> = ({
  density = 4,
  opacity = 0.12,
  strokeColor = "rgba(0,0,0,0.85)",
  crossHatch = false,
  className,
}) => {
  const id = React.useId().replace(/:/g, "");
  const patternId = `engraved-${id}`;
  const crossId = `engraved-cross-${id}`;
  return (
    <svg
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={{ mixBlendMode: "multiply", opacity }}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={density}
          height={density}
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2={density} stroke={strokeColor} strokeWidth="0.7" />
        </pattern>
        {crossHatch && (
          <pattern
            id={crossId}
            patternUnits="userSpaceOnUse"
            width={density}
            height={density}
            patternTransform="rotate(-45)"
          >
            <line x1="0" y1="0" x2="0" y2={density} stroke={strokeColor} strokeWidth="0.5" />
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      {crossHatch && <rect width="100%" height="100%" fill={`url(#${crossId})`} />}
    </svg>
  );
};

export default EngravedFill;