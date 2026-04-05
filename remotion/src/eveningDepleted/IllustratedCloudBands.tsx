import type { FC } from "react";
import { Img, staticFile } from "remotion";

type MotionProps = {
  durationInFrames: number;
  frame: number;
};

/**
 * Each cloud band is a full-size copy of the artwork, clipped to a
 * cloud-shaped ellipse via clipPath.  Only the clipped region is visible,
 * and only that layer translates horizontally — the static base image
 * underneath stays perfectly still.
 *
 * The ellipses are positioned to match the major cloud formations in
 * evening-depleted-v2.png (1080×1920 portrait).
 */

type CloudMask = {
  /** clipPath ellipse: cx cy rx ry (all in %) */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** max horizontal drift in px */
  driftX: number;
  /** phase offset for independent timing */
  phase: number;
  /** speed multiplier (1 = one full cycle per video loop) */
  speed: number;
};

const CLOUD_MASKS: CloudMask[] = [
  // Upper-left wispy cloud bank
  { cx: 28, cy: 14, rx: 32, ry: 5, driftX: 35, phase: 0, speed: 1 },
  // Small mid-left puff
  { cx: 35, cy: 21, rx: 14, ry: 3.5, driftX: 25, phase: 1.2, speed: 1.3 },
  // Right-side cloud band
  { cx: 68, cy: 22, rx: 28, ry: 5.5, driftX: -30, phase: 2.1, speed: 0.9 },
  // Wide lower cloud shelf
  { cx: 42, cy: 36, rx: 48, ry: 4, driftX: 20, phase: 3.5, speed: 0.7 },
  // Thin wisps near horizon
  { cx: 55, cy: 30, rx: 22, ry: 2.5, driftX: -18, phase: 4.8, speed: 1.1 },
];

export const IllustratedCloudBands: FC<MotionProps> = ({ frame, durationInFrames }) => {
  const progress = (frame / durationInFrames) * Math.PI * 2;

  return (
    <>
      {CLOUD_MASKS.map((mask, i) => {
        // Smooth sinusoidal horizontal drift — seamless loop
        const x = Math.sin(progress * mask.speed + mask.phase) * mask.driftX;

        // Feathered ellipse clip path matching this cloud's position
        // SVG-style clipPath with soft edges via multiple nested ellipses
        // isn't available in CSS alone, so we use a single ellipse and rely
        // on the artwork's own painted edges for softness.
        const clipPath = `ellipse(${mask.rx}% ${mask.ry}% at ${mask.cx}% ${mask.cy}%)`;

        return (
          <div
            key={`cloud-mask-${i}`}
            style={{
              position: "absolute",
              inset: 0,
              clipPath,
              WebkitClipPath: clipPath,
              transform: `translate3d(${x}px, 0, 0)`,
              willChange: "transform",
              pointerEvents: "none",
            }}
          >
            <Img
              src={staticFile("images/evening-depleted-v2.png")}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
        );
      })}
    </>
  );
};
