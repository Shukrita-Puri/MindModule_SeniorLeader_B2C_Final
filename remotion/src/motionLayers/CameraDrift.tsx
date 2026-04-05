import type { FC, ReactNode } from "react";
import { interpolate } from "remotion";

type Props = {
  frame: number;
  durationInFrames: number;
  direction: 'forward' | 'none' | 'settle';
  amount?: number; // percentage drift
  children: ReactNode;
};

export const CameraDrift: FC<Props> = ({
  frame,
  durationInFrames,
  direction,
  amount = 2,
  children,
}) => {
  if (direction === 'none') {
    return <div style={{ position: "absolute", inset: 0 }}>{children}</div>;
  }

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let translateY = 0;
  let scale = 1;

  if (direction === 'forward') {
    // Slow zoom in + slight upward drift (toward horizon)
    scale = 1 + progress * (amount / 100) * 2;
    translateY = -progress * amount * 3;
  } else if (direction === 'settle') {
    // Slow downward settle + very slight zoom out
    scale = 1.02 - progress * (amount / 100);
    translateY = progress * amount * 2;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: `-${amount}%`,
        transform: `translateY(${translateY}px) scale(${scale})`,
        transformOrigin: "50% 50%",
      }}
    >
      {children}
    </div>
  );
};
