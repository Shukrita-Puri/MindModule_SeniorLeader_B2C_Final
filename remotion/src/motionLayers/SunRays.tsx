import type { FC } from "react";
import { interpolate } from "remotion";

type Props = {
  frame: number;
  durationInFrames: number;
  intensity?: number;    // 0-1 brightness
  rayCount?: number;     // number of rays
  sunPosition?: [number, number]; // [left%, top%]
  warmth?: number;       // 0-1 warmth (shifts hue toward gold)
};

const periodicValue = (frame: number, dur: number, offset = 0) =>
  (frame / dur) * Math.PI * 2 + offset;

export const SunRays: FC<Props> = ({
  frame,
  durationInFrames,
  intensity = 0.7,
  rayCount = 6,
  sunPosition = [50, 45],
  warmth = 0.5,
}) => {
  const breath = Math.sin(periodicValue(frame, durationInFrames)) * 0.5 + 0.5;
  const [sunX, sunY] = sunPosition;

  // Hue shifts from 210 (cool blue-white) to 40 (warm gold) based on warmth
  const hue = Math.round(210 - warmth * 170);
  const sat = Math.round(30 + warmth * 50);
  const light = Math.round(65 + warmth * 20);

  const glowColor = `hsl(${hue} ${sat}% ${light}%)`;
  const rayColor = `hsl(${hue} ${sat + 10}% ${light + 5}%)`;

  return (
    <>
      {/* Sun disk glow */}
      <div
        style={{
          position: "absolute",
          left: `${sunX - 8}%`,
          top: `${sunY - 4}%`,
          width: "16%",
          height: "8%",
          opacity: intensity * (0.5 + breath * 0.3),
          background: `radial-gradient(ellipse 100% 100% at 50% 50%, ${glowColor} / 0.4) 0%, ${glowColor} / 0.15) 40%, transparent 80%)`,
        }}
      />

      {/* Horizon band glow */}
      <div
        style={{
          position: "absolute",
          left: "-12%",
          right: "-12%",
          top: `${sunY - 2}%`,
          height: 200,
          opacity: intensity * (0.4 + breath * 0.25),
          background: `radial-gradient(ellipse 94% 100% at 50% 62%, ${glowColor} / 0.35) 0%, ${glowColor} / 0.12) 40%, transparent 80%)`,
        }}
      />

      {/* Rays */}
      {Array.from({ length: rayCount }).map((_, i) => {
        const spread = 70; // total spread in % from center
        const xPos = sunX - spread / 2 + (i / Math.max(1, rayCount - 1)) * spread;
        const rayOpacity = interpolate(
          Math.sin(periodicValue(frame, durationInFrames, i * 1.35)),
          [-1, 1],
          [0.03 * intensity, 0.14 * intensity]
        );
        const angle = (xPos / 100 - 0.5) * 14;

        return (
          <div
            key={`ray-${i}`}
            style={{
              position: "absolute",
              left: `${xPos}%`,
              top: `${sunY - 22}%`,
              width: 3,
              height: "28%",
              background: `linear-gradient(to top, ${rayColor} / ${rayOpacity}), transparent)`,
              transform: `rotate(${angle}deg) scaleY(${0.92 + breath * 0.24})`,
              transformOrigin: "bottom center",
            }}
          />
        );
      })}

      {/* Shimmer bands */}
      {intensity > 0.4 && (
        <>
          {[0, 0.34, 0.68].map((offset, i) => {
            const shimmer = ((frame / durationInFrames * 1.2) % 1 + offset) % 1;
            return (
              <div
                key={`shimmer-${i}`}
                style={{
                  position: "absolute",
                  left: `${shimmer * 150 - 28}%`,
                  top: `${sunY + 1}%`,
                  width: "34%",
                  height: 14,
                  opacity: intensity * (0.15 + breath * 0.15),
                  background: `linear-gradient(90deg, transparent 0%, ${rayColor} / 0.04) 12%, ${rayColor} / 0.3) 50%, ${rayColor} / 0.04) 88%, transparent 100%)`,
                  filter: "blur(8px)",
                }}
              />
            );
          })}
        </>
      )}
    </>
  );
};
