import type { FC } from "react";
import { interpolate } from "remotion";

type MotionProps = {
  durationInFrames: number;
  frame: number;
};

const STARS: Array<[number, number, number, number, number]> = [
  [12, 5, 20, 0.5, 3.2],
  [68, 3, 50, 0.6, 2.8],
  [42, 8, 80, 0.4, 3.5],
  [85, 6, 40, 0.55, 2.5],
  [28, 2, 100, 0.35, 3],
  [55, 10, 60, 0.45, 2.2],
  [78, 9, 30, 0.5, 3.8],
  [18, 12, 70, 0.3, 2.6],
];

const CLOUDS: Array<[number, number, number, number, number, number]> = [
  [-24, 13, 360, 48, 0.04, 0.22],
  [26, 9, 300, 34, 0.026, 0.16],
  [-36, 21, 420, 40, 0.05, 0.2],
  [64, 16, 260, 28, 0.018, 0.14],
  [-12, 27, 330, 34, 0.034, 0.18],
];

const MIST_BANDS: Array<[number, number, number, number, number, number]> = [
  [-30, 55, 44, 0.06, 0.16, 18],
  [8, 60, 36, 0.04, 0.12, 14],
  [52, 58, 32, 0.05, 0.1, 12],
  [88, 62, 40, 0.035, 0.08, 16],
];

const BIRD_FLOCKS = [
  {
    baseY: 24,
    direction: 1,
    duration: 0.38,
    scale: 0.9,
    start: 0.14,
    birds: [
      { offsetX: 0, offsetY: 0, size: 1 },
      { offsetX: -3.8, offsetY: 1.6, size: 0.78 },
      { offsetX: 4.5, offsetY: 2.1, size: 0.7 },
    ],
  },
  {
    baseY: 31,
    direction: -1,
    duration: 0.34,
    scale: 0.74,
    start: 0.58,
    birds: [
      { offsetX: 0, offsetY: 0, size: 1 },
      { offsetX: 4.2, offsetY: 1.4, size: 0.72 },
      { offsetX: -4.8, offsetY: 2.3, size: 0.66 },
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
        const fadeIn = interpolate(frame, [delay, delay + 60], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const opacity = fadeIn * maxOpacity * (0.4 + twinkle * 0.6);
        const size = 2 + twinkle * 1.5;

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
              backgroundColor: "hsl(42 33% 73%)",
              opacity,
              boxShadow: `0 0 ${3 + twinkle * 6}px hsl(42 33% 73% / ${opacity * 0.8})`,
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
      {CLOUDS.map(([startX, y, width, height, speed, opacity], i) => {
        const cloudX = ((startX + loop * speed * 160 + 120) % 240) - 70;
        const cloudOpacity =
          opacity * (0.78 + Math.sin(periodicValue(frame, durationInFrames, i)) * 0.18);

        return (
          <div
            key={`cloud-${i}`}
            style={{
              position: "absolute",
              left: `${cloudX}%`,
              top: `${y}%`,
              width,
              height,
              borderRadius: "999px",
              background: `radial-gradient(ellipse, hsl(220 23% 76% / ${cloudOpacity}) 0%, hsl(220 20% 64% / ${cloudOpacity * 0.55}) 42%, transparent 72%)`,
              filter: `blur(${8 + i * 2}px)`,
            }}
          />
        );
      })}
    </>
  );
};

export const HorizonLight: FC<MotionProps> = ({ frame, durationInFrames }) => {
  const breath = Math.sin(periodicValue(frame, durationInFrames)) * 0.5 + 0.5;
  const shimmer = (frame / durationInFrames) % 1;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "-10%",
          right: "-10%",
          top: "42%",
          height: 220,
          opacity: 0.42 + breath * 0.26,
          background:
            "radial-gradient(ellipse 90% 100% at 50% 62%, hsl(32 54% 50% / 0.34) 0%, hsl(33 47% 47% / 0.16) 30%, hsl(30 38% 42% / 0.06) 58%, transparent 82%)",
        }}
      />

      {[0, 0.38].map((offset, i) => {
        const bandProgress = (shimmer + offset) % 1;

        return (
          <div
            key={`shine-${i}`}
            style={{
              position: "absolute",
              left: `${bandProgress * 140 - 20}%`,
              top: "46.5%",
              width: "26%",
              height: 12,
              opacity: 0.18 + breath * 0.14,
              background:
                "linear-gradient(90deg, transparent 0%, hsl(39 63% 67% / 0.02) 10%, hsl(38 74% 74% / 0.34) 50%, hsl(39 63% 67% / 0.02) 90%, transparent 100%)",
              filter: "blur(5px)",
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
          height: 3,
          opacity: 0.48 + breath * 0.22,
          background:
            "linear-gradient(90deg, transparent 5%, hsl(32 54% 50% / 0.56) 24%, hsl(40 77% 70% / 0.82) 50%, hsl(32 54% 50% / 0.56) 76%, transparent 95%)",
          boxShadow: `0 0 20px hsl(32 54% 50% / ${0.18 + breath * 0.18})`,
        }}
      />

      {[30, 44, 58, 72].map((xPos, i) => {
        const rayOpacity = interpolate(
          Math.sin(periodicValue(frame, durationInFrames, i * 1.5)),
          [-1, 1],
          [0.02, 0.08]
        );

        return (
          <div
            key={`ray-${i}`}
            style={{
              position: "absolute",
              left: `${xPos}%`,
              top: "30%",
              width: 2,
              height: "25%",
              background: `linear-gradient(to top, hsl(32 54% 50% / ${rayOpacity}), transparent)`,
              transform: `rotate(${(xPos / 100 - 0.5) * 8}deg) scaleY(${0.9 + breath * 0.2})`,
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
        const x = ((startX + loop * speed * 220 + 160) % 260) - 80;
        const float = Math.sin(periodicValue(frame, durationInFrames, i * 0.8)) * 3;

        return (
          <div
            key={`mist-${i}`}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y + float}%`,
              width: `${width}%`,
              height: "7%",
              opacity,
              background:
                "linear-gradient(90deg, transparent 0%, hsl(214 22% 87% / 0.04) 16%, hsl(212 24% 92% / 0.2) 50%, hsl(214 22% 87% / 0.04) 84%, transparent 100%)",
              filter: `blur(${blur}px)`,
            }}
          />
        );
      })}
    </>
  );
};

const Bird: FC<{ flap: number; opacity: number; scale: number }> = ({ flap, opacity, scale }) => {
  const wingPeak = 4 - flap * 2.2;

  return (
    <svg
      viewBox="0 0 24 12"
      style={{
        width: 28 * scale,
        height: 14 * scale,
        overflow: "visible",
      }}
    >
      <path
        d={`M2 8 Q7 ${wingPeak} 12 8 M12 8 Q17 ${wingPeak} 22 8`}
        fill="none"
        stroke={`hsl(220 18% 28% / ${opacity})`}
        strokeLinecap="round"
        strokeWidth={1.5}
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
          [0, 0.04, flock.duration - 0.05, flock.duration],
          [0, 1, 1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }
        );
        const xBase = interpolate(
          cycle,
          [0, flock.duration],
          flock.direction === 1 ? [-12, 116] : [116, -12],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }
        );
        const yBase =
          flock.baseY + Math.sin(periodicValue(frame, durationInFrames, flockIndex * 2.4)) * 1.5;

        return flock.birds.map((bird, birdIndex) => {
          const flap = Math.sin((frame + birdIndex * 5 + flockIndex * 11) / 3.2) * 0.5 + 0.5;

          return (
            <div
              key={`bird-${flockIndex}-${birdIndex}`}
              style={{
                position: "absolute",
                left: `${xBase + bird.offsetX * flock.direction}%`,
                top: `${yBase + bird.offsetY}%`,
                opacity: active * 0.55,
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