import type { FC } from "react";

type Props = {
  frame: number;
  durationInFrames: number;
  color?: string;
  glowColor?: string;
  warmth?: number;
  sunPosition?: [number, number];
};

const periodicValue = (frame: number, dur: number, offset = 0) =>
  (frame / dur) * Math.PI * 2 + offset;

export const HorizonGlow: FC<Props> = ({
  frame,
  durationInFrames,
  color = 'hsl(33 60% 50%)',
  glowColor = 'hsl(35 55% 55%)',
  warmth = 0.5,
  sunPosition = [50, 48],
}) => {
  const breath = Math.sin(periodicValue(frame, durationInFrames)) * 0.5 + 0.5;
  const [, sunY] = sunPosition;

  return (
    <>
      {/* Wide horizon glow band */}
      <div
        style={{
          position: "absolute",
          left: "-12%",
          right: "-12%",
          top: `${sunY - 3}%`,
          height: 260,
          opacity: warmth * (0.4 + breath * 0.2),
          background: `radial-gradient(ellipse 94% 100% at 50% 62%, ${color} / 0.35) 0%, ${color} / 0.15) 28%, ${color} / 0.05) 56%, transparent 82%)`,
        }}
      />

      {/* Bright horizon line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${sunY}%`,
          height: 4,
          opacity: warmth * (0.4 + breath * 0.2),
          background: `linear-gradient(90deg, transparent 5%, ${glowColor} / 0.4) 24%, ${glowColor} / 0.7) 50%, ${glowColor} / 0.4) 76%, transparent 95%)`,
          boxShadow: `0 0 24px ${glowColor} / ${warmth * (0.2 + breath * 0.15)})`,
        }}
      />
    </>
  );
};
