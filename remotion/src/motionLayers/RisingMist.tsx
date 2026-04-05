import type { FC } from "react";

type Props = {
  frame: number;
  durationInFrames: number;
  intensity?: number; // opacity multiplier
};

const MIST_BANDS: Array<[number, number, number, number, number, number]> = [
  [-44, 53, 56, 0.12, 0.2, 18],
  [4, 58, 48, 0.1, 0.16, 16],
  [48, 56, 42, 0.14, 0.14, 14],
  [86, 61, 50, 0.12, 0.12, 18],
];

const periodicValue = (frame: number, dur: number, offset = 0) =>
  (frame / dur) * Math.PI * 2 + offset;

export const RisingMist: FC<Props> = ({ frame, durationInFrames, intensity = 1 }) => {
  const loop = frame / durationInFrames;

  return (
    <>
      {MIST_BANDS.map(([startX, y, width, speed, opacity, blur], i) => {
        const x = ((startX + loop * speed * 360 + 220) % 320) - 110;
        const float = Math.sin(periodicValue(frame, durationInFrames, i * 0.8)) * 4.5;
        const pulse = opacity * intensity * (0.86 + Math.sin(periodicValue(frame, durationInFrames, i * 1.1)) * 0.14);

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
