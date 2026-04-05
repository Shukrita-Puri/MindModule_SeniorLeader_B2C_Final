import type { FC } from "react";
import { Img, staticFile } from "remotion";

type MotionProps = {
  durationInFrames: number;
  frame: number;
};

type CloudBand = {
  driftX: number;
  driftY: number;
  height: string;
  left: string;
  phase: number;
  top: string;
  width: string;
};

const BAND_IMAGE_STYLE = {
  width: "110%",
  height: "106%",
  objectFit: "cover" as const,
  marginLeft: "-5%",
  marginTop: "-3%",
};

const CLOUD_BANDS: CloudBand[] = [
  {
    left: "0%",
    top: "11%",
    width: "56%",
    height: "16%",
    driftX: 24,
    driftY: 4,
    phase: 0,
  },
  {
    left: "26%",
    top: "20%",
    width: "22%",
    height: "8%",
    driftX: 18,
    driftY: 3,
    phase: 0.8,
  },
  {
    left: "44%",
    top: "21%",
    width: "49%",
    height: "16%",
    driftX: -26,
    driftY: 5,
    phase: 1.7,
  },
  {
    left: "0%",
    top: "35%",
    width: "89%",
    height: "11%",
    driftX: 16,
    driftY: 2,
    phase: 2.3,
  },
];

export const IllustratedCloudBands: FC<MotionProps> = ({ frame, durationInFrames }) => {
  const progress = (frame / durationInFrames) * Math.PI * 2;

  return (
    <>
      {CLOUD_BANDS.map((band, index) => {
        const wave = Math.sin(progress + band.phase);
        const sway = Math.cos(progress * 0.7 + band.phase * 1.2);
        const x = wave * band.driftX;
        const y = sway * band.driftY;
        const scale = 1.005 + (Math.sin(progress * 0.5 + band.phase) * 0.5 + 0.5) * 0.012;

        return (
          <div
            key={`illustrated-cloud-band-${index}`}
            style={{
              position: "absolute",
              left: band.left,
              top: band.top,
              width: band.width,
              height: band.height,
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            <Img
              src={staticFile("images/evening-depleted-v2.png")}
              style={{
                ...BAND_IMAGE_STYLE,
                opacity: 0.98,
                transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
                transformOrigin: "center center",
              }}
            />
          </div>
        );
      })}
    </>
  );
};