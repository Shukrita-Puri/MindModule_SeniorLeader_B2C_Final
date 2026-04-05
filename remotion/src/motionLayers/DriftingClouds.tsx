import type { FC } from "react";

type Props = {
  frame: number;
  durationInFrames: number;
  density?: number;  // multiplier for how many clouds
  speed?: number;    // drift speed multiplier
  opacity?: number;  // opacity multiplier
  color?: string;    // base cloud HSL
};

const BASE_CLOUDS: Array<[number, number, number, number, number, number, number]> = [
  [-52, 8, 520, 82, 0.18, 0.3, 16],
  [-8, 13, 420, 64, 0.14, 0.24, 13],
  [34, 7, 360, 56, 0.22, 0.2, 11],
  [-40, 20, 480, 66, 0.16, 0.22, 18],
  [48, 17, 340, 50, 0.2, 0.18, 10],
  [74, 24, 300, 42, 0.24, 0.15, 8],
];

const periodicValue = (frame: number, dur: number, offset = 0) =>
  (frame / dur) * Math.PI * 2 + offset;

export const DriftingClouds: FC<Props> = ({
  frame,
  durationInFrames,
  density = 1,
  speed = 1,
  opacity: opacityMul = 1,
  color = 'hsl(216 28% 88%)',
}) => {
  const loop = frame / durationInFrames;
  const cloudCount = Math.max(1, Math.round(BASE_CLOUDS.length * density));
  const clouds = BASE_CLOUDS.slice(0, cloudCount);

  return (
    <>
      {clouds.map(([startX, y, width, height, travel, baseOpacity, blur], i) => {
        const cloudX = ((startX + loop * travel * 620 * speed + 240) % 340) - 120;
        const yFloat = Math.sin(periodicValue(frame, durationInFrames, i * 0.9)) * 1.8;
        const opPulse =
          baseOpacity * opacityMul * (0.9 + Math.sin(periodicValue(frame, durationInFrames, i * 1.2)) * 0.12);
        const stretch = 1.02 + Math.sin(periodicValue(frame, durationInFrames, i * 0.7)) * 0.04;

        return (
          <div
            key={`cloud-${i}`}
            style={{
              position: "absolute",
              left: `${cloudX}%`,
              top: `${y + yFloat}%`,
              width,
              height,
              opacity: opPulse,
              transform: `scale(${stretch}, ${1.01 + (stretch - 1) * 0.6})`,
              transformOrigin: "center center",
              filter: `blur(${blur}px)`,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "999px",
                background: `radial-gradient(ellipse at 40% 52%, ${color} / 0.95) 0%, ${color} / 0.72) 38%, ${color} / 0.24) 62%, transparent 82%)`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "8%",
                right: "14%",
                top: "18%",
                bottom: "8%",
                borderRadius: "999px",
                background: `linear-gradient(90deg, transparent 0%, ${color} / 0.2) 22%, ${color} / 0.4) 50%, ${color} / 0.16) 78%, transparent 100%)`,
              }}
            />
          </div>
        );
      })}
    </>
  );
};
