import type { FC } from "react";
import { interpolate } from "remotion";

type Props = {
  frame: number;
  durationInFrames: number;
  count?: number; // number of flocks (1-3)
};

const periodicValue = (frame: number, dur: number, offset = 0) =>
  (frame / dur) * Math.PI * 2 + offset;

const FLOCKS = [
  {
    baseY: 18,
    direction: 1,
    duration: 0.32,
    scale: 1.02,
    start: 0.08,
    birds: [
      { offsetX: 0, offsetY: 0, size: 1.08 },
      { offsetX: -4.4, offsetY: 1.8, size: 0.82 },
      { offsetX: 4.8, offsetY: 2.2, size: 0.76 },
    ],
  },
  {
    baseY: 25,
    direction: -1,
    duration: 0.36,
    scale: 0.92,
    start: 0.36,
    birds: [
      { offsetX: 0, offsetY: 0, size: 1 },
      { offsetX: 4.6, offsetY: 1.5, size: 0.78 },
      { offsetX: -5.1, offsetY: 2.4, size: 0.72 },
    ],
  },
  {
    baseY: 33,
    direction: 1,
    duration: 0.3,
    scale: 0.82,
    start: 0.68,
    birds: [
      { offsetX: 0, offsetY: 0, size: 0.94 },
      { offsetX: -4.1, offsetY: 1.6, size: 0.72 },
      { offsetX: 4.4, offsetY: 2.1, size: 0.66 },
    ],
  },
];

const Bird: FC<{ flap: number; opacity: number; scale: number }> = ({ flap, opacity, scale }) => {
  const wingPeak = 3.4 - flap * 2.8;
  return (
    <svg
      viewBox="0 0 24 12"
      style={{
        width: 34 * scale,
        height: 18 * scale,
        overflow: "visible",
        filter: `drop-shadow(0 1px 1px hsl(220 20% 36% / ${opacity * 0.18}))`,
      }}
    >
      <path
        d={`M2 8 Q7 ${wingPeak} 12 8 M12 8 Q17 ${wingPeak} 22 8`}
        fill="none"
        stroke={`hsl(221 18% 24% / ${Math.min(opacity * 1.15, 0.95)})`}
        strokeLinecap="round"
        strokeWidth={1.7}
      />
    </svg>
  );
};

export const BirdFlocks: FC<Props> = ({ frame, durationInFrames, count = 3 }) => {
  const loop = frame / durationInFrames;
  const flocks = FLOCKS.slice(0, count);

  return (
    <>
      {flocks.map((flock, flockIndex) => {
        const cycle = (loop - flock.start + 1) % 1;
        const active = interpolate(
          cycle,
          [0, 0.035, flock.duration - 0.04, flock.duration],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const xBase = interpolate(
          cycle,
          [0, flock.duration],
          flock.direction === 1 ? [-14, 118] : [118, -14],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const yBase =
          flock.baseY + Math.sin(periodicValue(frame, durationInFrames, flockIndex * 2.4)) * 2.2;

        return flock.birds.map((bird, birdIndex) => {
          const flap = Math.sin((frame + birdIndex * 5 + flockIndex * 11) / 2.8) * 0.5 + 0.5;
          return (
            <div
              key={`bird-${flockIndex}-${birdIndex}`}
              style={{
                position: "absolute",
                left: `${xBase + bird.offsetX * flock.direction}%`,
                top: `${yBase + bird.offsetY}%`,
                opacity: active * 0.8,
                transform: `scale(${flock.scale * bird.size})`,
                transformOrigin: "center center",
              }}
            >
              <Bird flap={flap} opacity={active} scale={bird.size} />
            </div>
          );
        });
      })}
    </>
  );
};
