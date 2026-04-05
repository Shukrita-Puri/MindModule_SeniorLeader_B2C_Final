import type { FC } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { IllustratedCloudBands } from "./eveningDepleted/IllustratedCloudBands";

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
      {/* Static base artwork — sun, hills, horizon all fixed */}
      <Img
        src={staticFile("images/evening-depleted-v2.png")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Cloud bands animated with shaped masks */}
      <IllustratedCloudBands frame={frame} durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
};
