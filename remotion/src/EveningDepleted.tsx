import type { FC } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import {
  BirdFlocks,
  DriftingClouds,
  HorizonLight,
  RisingMist,
  TwinklingStars,
} from "./eveningDepleted/NaturalMotionLayers";

export const EveningDepleted: FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "hsl(219 47% 10%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, hsl(218 41% 13%) 0%, hsl(220 42% 18%) 30%, hsl(221 34% 25%) 50%, hsl(220 37% 19%) 70%, hsl(219 47% 10%) 100%)",
        }}
      />

      <TwinklingStars frame={frame} durationInFrames={durationInFrames} />
      <DriftingClouds frame={frame} durationInFrames={durationInFrames} />

      <div
        style={{
          position: "absolute",
          left: "-5%",
          right: "-5%",
          top: "-3%",
          bottom: "-3%",
        }}
      >
        <Img
          src={staticFile("images/evening-depleted-v2.png")}
          style={{
            width: "110%",
            height: "106%",
            objectFit: "cover",
            marginLeft: "-5%",
            marginTop: "-3%",
          }}
        />
      </div>

      <HorizonLight frame={frame} durationInFrames={durationInFrames} />
      <RisingMist frame={frame} durationInFrames={durationInFrames} />
      <BirdFlocks frame={frame} durationInFrames={durationInFrames} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 75% 65% at 50% 50%, transparent 40%, hsl(219 47% 10% / 0.5) 100%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "20%",
          background: "linear-gradient(to top, hsl(219 47% 10%) 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
