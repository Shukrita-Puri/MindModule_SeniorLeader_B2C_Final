import type { FC } from "react";
import { interpolate } from "remotion";

type MotionProps = {
  durationInFrames: number;
  frame: number;
};

const STARS: Array<[number, number, number, number, number]> = [
  [12, 5, 18, 0.58, 3.4],
  [68, 3, 34, 0.64, 3.1],
  [42, 8, 52, 0.48, 3.8],
  [85, 6, 28, 0.6, 2.9],
  [28, 2, 76, 0.42, 3.2],
  [55, 10, 44, 0.52, 2.6],
  [78, 9, 24, 0.56, 4.1],
  [18, 12, 60, 0.38, 2.8],
  [34, 6, 90, 0.46, 3.5],
  [60, 12, 72, 0.34, 2.9],
  [8, 9, 110, 0.32, 2.7],
  [92, 11, 86, 0.3, 3.3],
];

const CLOUDS: Array<[number, number, number, number, number, number, number]> = [
  [-52, 8, 520, 82, 0.18, 0.3, 16],
  [-8, 13, 420, 64, 0.14, 0.24, 13],
  [34, 7, 360, 56, 0.22, 0.2, 11],
  [-40, 20, 480, 66, 0.16, 0.22, 18],
  [48, 17, 340, 50, 0.2, 0.18, 10],
  [74, 24, 300, 42, 0.24, 0.15, 8],
];

const MIST_BANDS: Array<[number, number, number, number, number, number]> = [
  [-44, 53, 56, 0.12, 0.2, 18],
  [4, 58, 48, 0.1, 0.16, 16],
  [48, 56, 42, 0.14, 0.14, 14],
  [86, 61, 50, 0.12, 0.12, 18],
];

const BIRD_FLOCKS = [
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
] as const;

const periodicValue = (frame: number, durationInFrames: number, offset = 0) =>
  (frame / durationInFrames) * Math.PI * 2 + offset;

export const TwinklingStars: FC<MotionProps> = ({ frame, durationInFrames }) => {
  return (
    <>
      {STARS.map(([x, y, delay, maxOpacity, speed], i) => {
        const twinkle =
          Math.sin(((frame + delay * 3) / durationInFrames) * Math.PI * speed * 2) * 0.5 +
          0.5;
        const fadeIn = interpolate(frame, [delay, delay + 40], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const opacity = fadeIn * maxOpacity * (0.45 + twinkle * 0.55);
        const size = 2.2 + twinkle * 1.8;

        return (
          <div
            key={`star-${i}`}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: "hsl(42 38% 78%)",
              opacity,
              boxShadow: `0 0 ${5 + twinkle * 8}px hsl(42 38% 78% / ${opacity * 0.85})`,
            }}
          />
        );
      })}
    </>
  );
};

export const DriftingClouds: FC<MotionProps> = ({ frame, durationInFrames }) => {
  const loop = frame / durationInFrames;

  return (
    <>
      {CLOUDS.map(([startX, y, width, height, travel, opacity, blur], i) => {
        const cloudX = ((startX + loop * travel * 620 + 240) % 340) - 120;
        const yFloat = Math.sin(periodicValue(frame, durationInFrames, i * 0.9)) * 1.8;
        const opacityPulse =
          opacity * (0.9 + Math.sin(periodicValue(frame, durationInFrames, i * 1.2)) * 0.12);
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
              opacity: opacityPulse,
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
                background:
                  "radial-gradient(ellipse at 40% 52%, hsl(216 28% 88% / 0.95) 0%, hsl(218 24% 80% / 0.72) 38%, hsl(219 20% 70% / 0.24) 62%, transparent 82%)",
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
                background:
                  "linear-gradient(90deg, transparent 0%, hsl(215 30% 90% / 0.2) 22%, hsl(216 26% 86% / 0.4) 50%, hsl(215 30% 90% / 0.16) 78%, transparent 100%)",
              }}
            />
          </div>
        );
      })}
    </>
  );
};

export const HorizonLight: FC<MotionProps> = ({ frame, durationInFrames }) => {
  const breath = Math.sin(periodicValue(frame, durationInFrames)) * 0.5 + 0.5;
  const shimmer = ((frame / durationInFrames) * 1.2) % 1;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "-12%",
          right: "-12%",
          top: "41.5%",
          height: 260,
          opacity: 0.56 + breath * 0.28,
          background:
            "radial-gradient(ellipse 94% 100% at 50% 62%, hsl(33 60% 58% / 0.42) 0%, hsl(35 50% 50% / 0.22) 28%, hsl(31 42% 44% / 0.08) 56%, transparent 82%)",
        }}
      />

      {[0, 0.34, 0.68].map((offset, i) => {
        const bandProgress = (shimmer + offset) % 1;

        return (
          <div
            key={`shine-${i}`}
            style={{
              position: "absolute",
              left: `${bandProgress * 150 - 28}%`,
              top: "46.1%",
              width: "34%",
              height: 18,
              opacity: 0.24 + breath * 0.2,
              background:
                "linear-gradient(90deg, transparent 0%, hsl(39 76% 78% / 0.04) 12%, hsl(40 86% 82% / 0.44) 50%, hsl(39 76% 78% / 0.04) 88%, transparent 100%)",
              filter: "blur(8px)",
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "47%",
          height: 5,
          opacity: 0.58 + breath * 0.26,
          background:
            "linear-gradient(90deg, transparent 5%, hsl(33 58% 54% / 0.56) 24%, hsl(40 84% 76% / 0.94) 50%, hsl(33 58% 54% / 0.56) 76%, transparent 95%)",
          boxShadow: `0 0 28px hsl(34 62% 55% / ${0.28 + breath * 0.22})`,
        }}
      />

      {[22, 34, 46, 58, 70, 82].map((xPos, i) => {
        const rayOpacity = interpolate(
          Math.sin(periodicValue(frame, durationInFrames, i * 1.35)),
          [-1, 1],
          [0.04, 0.13]
        );

        return (
          <div
            key={`ray-${i}`}
            style={{
              position: "absolute",
              left: `${xPos}%`,
              top: "28%",
              width: 3,
              height: "31%",
              background: `linear-gradient(to top, hsl(36 66% 62% / ${rayOpacity}), transparent)`,
              transform: `rotate(${(xPos / 100 - 0.5) * 11}deg) scaleY(${0.92 + breath * 0.24})`,
              transformOrigin: "bottom center",
            }}
          />
        );
      })}
    </>
  );
};

export const RisingMist: FC<MotionProps> = ({ frame, durationInFrames }) => {
  const loop = frame / durationInFrames;

  return (
    <>
      {MIST_BANDS.map(([startX, y, width, speed, opacity, blur], i) => {
        const x = ((startX + loop * speed * 360 + 220) % 320) - 110;
        const float = Math.sin(periodicValue(frame, durationInFrames, i * 0.8)) * 4.5;
        const pulse = opacity * (0.86 + Math.sin(periodicValue(frame, durationInFrames, i * 1.1)) * 0.14);

        return (
          <div
            key={`mist-${i}`}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y + float}%`,
              width: `${width}%`,
              height: "9%",
              opacity: pulse,
              background:
                "linear-gradient(90deg, transparent 0%, hsl(212 28% 92% / 0.06) 14%, hsl(212 30% 95% / 0.28) 50%, hsl(212 28% 92% / 0.06) 86%, transparent 100%)",
              filter: `blur(${blur}px)`,
              transform: `scaleX(${1.02 + pulse * 0.08})`,
              transformOrigin: "center center",
            }}
          />
        );
      })}
    </>
  );
};

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

export const BirdFlocks: FC<MotionProps> = ({ frame, durationInFrames }) => {
  const loop = frame / durationInFrames;

  return (
    <>
      {BIRD_FLOCKS.map((flock, flockIndex) => {
        const cycle = (loop - flock.start + 1) % 1;
        const active = interpolate(
          cycle,
          [0, 0.035, flock.duration - 0.04, flock.duration],
          [0, 1, 1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }
        );
        const xBase = interpolate(
          cycle,
          [0, flock.duration],
          flock.direction === 1 ? [-14, 118] : [118, -14],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }
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