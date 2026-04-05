import type { FC } from "react";
import { interpolate } from "remotion";

type Props = {
  frame: number;
  durationInFrames: number;
  count?: number;
};

// Generate deterministic star positions from a seed count
function generateStars(count: number) {
  const stars: Array<[number, number, number, number, number]> = [];
  for (let i = 0; i < count; i++) {
    const seed = i * 7919 + 31;
    const x = ((seed * 13) % 97);
    const y = ((seed * 17) % 28) + 2;
    const delay = ((seed * 23) % 120);
    const maxOpacity = 0.3 + ((seed * 29) % 40) / 100;
    const speed = 2.5 + ((seed * 37) % 20) / 10;
    stars.push([x, y, delay, maxOpacity, speed]);
  }
  return stars;
}

export const TwinklingStars: FC<Props> = ({ frame, durationInFrames, count = 10 }) => {
  const stars = generateStars(count);

  return (
    <>
      {stars.map(([x, y, delay, maxOpacity, speed], i) => {
        const twinkle =
          Math.sin(((frame + delay * 3) / durationInFrames) * Math.PI * speed * 2) * 0.5 + 0.5;
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
