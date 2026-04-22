import * as React from "react";
import { cn } from "@/lib/utils";

interface EngravedFillProps {
  /** Spacing in px between hatch lines (lower = denser). Default 4. */
  density?: number;
  /** Overlay opacity 0-1. Default 0.32. */
  opacity?: number;
  /** Stroke color of the pencil hatch. Default near-black. */
  strokeColor?: string;
  /** Optional second cross-hatch direction for denser pencil feel. */
  crossHatch?: boolean;
  /** Render a wavy hand-drawn outline rect inside the surface. */
  drawnOutline?: boolean;
  className?: string;
}

/**
 * EngravedFill
 * A reusable absolute-positioned SVG overlay that gives any colored surface
 * an authentic hand-drawn engraved-pencil feel: layered zig-zag scribbles,
 * cross-hatch wandering lines, and a turbulence-displaced filter for
 * irregular, sketched marks. Multiplies onto the underlying color so the
 * base hex is preserved.
 */
export const EngravedFill: React.FC<EngravedFillProps> = ({
  density = 4,
  opacity = 0.32,
  strokeColor = "rgba(0,0,0,0.85)",
  crossHatch = false,
  drawnOutline = false,
  className,
}) => {
  const id = React.useId().replace(/:/g, "");
  const tile = Math.max(18, density * 6); // 24px-ish hand-drawn tile
  const patternId = `engraved-${id}`;
  const crossId = `engraved-cross-${id}`;
  const filterId = `engraved-roughen-${id}`;
  const outlineFilterId = `engraved-outline-${id}`;

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full [&_*]:pointer-events-none",
        className
      )}
      style={{ mixBlendMode: "multiply", opacity, touchAction: "none" }}
      preserveAspectRatio="none"
      focusable="false"
    >
      <defs>
        {/* Turbulence-displacement filter that breaks geometric regularity */}
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="3"
          />
          <feDisplacementMap in="SourceGraphic" scale="1.4" />
        </filter>
        <filter
          id={outlineFilterId}
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.025"
            numOctaves="2"
            seed="7"
          />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>

        {/* Primary hand-drawn zig-zag + diagonal stroke tile */}
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={tile}
          height={tile}
          patternTransform="rotate(45)"
        >
          <g
            stroke={strokeColor}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${filterId})`}
          >
            {/* irregular zig-zag column 1 */}
            <path
              d={`M2 0 L2 ${tile}`}
              strokeWidth="0.9"
            />
            <path
              d={`M${tile * 0.32} -1 L${tile * 0.32} ${tile + 1}`}
              strokeWidth="0.6"
            />
            <path
              d={`M${tile * 0.55} 0 L${tile * 0.55} ${tile}`}
              strokeWidth="1.05"
            />
            <path
              d={`M${tile * 0.78} -1 L${tile * 0.78} ${tile + 1}`}
              strokeWidth="0.7"
            />
            {/* short broken scribble marks */}
            <path
              d={`M${tile * 0.18} ${tile * 0.2} l${tile * 0.18} ${tile * 0.06}`}
              strokeWidth="0.55"
            />
            <path
              d={`M${tile * 0.62} ${tile * 0.7} l${tile * 0.22} ${-tile * 0.04}`}
              strokeWidth="0.5"
            />
          </g>
        </pattern>

        {/* Sparse cross-hatch wandering lines */}
        {crossHatch && (
          <pattern
            id={crossId}
            patternUnits="userSpaceOnUse"
            width={tile}
            height={tile}
            patternTransform="rotate(-45)"
          >
            <g
              stroke={strokeColor}
              fill="none"
              strokeLinecap="round"
              filter={`url(#${filterId})`}
            >
              <path
                d={`M${tile * 0.2} 0 L${tile * 0.2} ${tile}`}
                strokeWidth="0.55"
              />
              <path
                d={`M${tile * 0.65} 0 L${tile * 0.65} ${tile}`}
                strokeWidth="0.7"
              />
              <path
                d={`M0 ${tile * 0.45} L${tile} ${tile * 0.55}`}
                strokeWidth="0.4"
              />
            </g>
          </pattern>
        )}
      </defs>

      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      {crossHatch && (
        <rect width="100%" height="100%" fill={`url(#${crossId})`} />
      )}
      {drawnOutline && (
        <rect
          x="1.5"
          y="1.5"
          width="calc(100% - 3px)"
          height="calc(100% - 3px)"
          rx="14"
          ry="14"
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.4"
          strokeOpacity="0.55"
          filter={`url(#${outlineFilterId})`}
        />
      )}
    </svg>
  );
};

export default EngravedFill;