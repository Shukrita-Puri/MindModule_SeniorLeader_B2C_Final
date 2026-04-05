import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
  Img,
} from "remotion";

// Star positions (x%, y%, delay frames, max opacity)
const STARS: Array<[number, number, number, number]> = [
  [15, 8, 40, 0.35],
  [72, 5, 80, 0.45],
  [45, 15, 120, 0.3],
  [88, 12, 60, 0.4],
  [30, 3, 100, 0.25],
  [60, 20, 150, 0.35],
];

export const EveningDepleted: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Sinusoidal progress for seamless loop (0 → 1 → 0)
  const loopProgress = Math.sin((frame / durationInFrames) * Math.PI);

  // Very slow downward camera drift (~5px)
  const cameraDriftY = interpolate(loopProgress, [0, 1], [0, 5]);

  // Horizon glow dims: 0.6 → 0.3 and back
  const horizonOpacity = interpolate(loopProgress, [0, 1], [0.6, 0.3]);

  // Parallax: foreground moves slightly more than background
  const bgDriftY = cameraDriftY * 0.6;
  const fgDriftY = cameraDriftY * 1.4;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0F1A" }}>
      {/* Sky gradient layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, #0A0F1A 0%, #0F1420 40%, #1A1F2E 60%, #0A0F1A 100%)",
          transform: `translateY(${bgDriftY}px)`,
        }}
      />

      {/* Stars */}
      {STARS.map(([x, y, delay, maxOpacity], i) => {
        const starProgress = interpolate(
          frame,
          [delay, delay + 100],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        // Pulse via sin for seamless loop
        const pulse =
          Math.sin(
            ((frame - delay) / durationInFrames) * Math.PI * 2 + i * 1.5
          ) *
            0.5 +
          0.5;
        const opacity = starProgress * maxOpacity * (0.6 + pulse * 0.4);

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: 3,
              height: 3,
              borderRadius: "50%",
              backgroundColor: "#D4C5A0",
              opacity,
              transform: `translateY(${bgDriftY}px)`,
              boxShadow: `0 0 ${4 + pulse * 4}px rgba(212, 197, 160, ${opacity * 0.6})`,
            }}
          />
        );
      })}

      {/* Horizon amber glow line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "48%",
          height: 80,
          opacity: horizonOpacity,
          background:
            "radial-gradient(ellipse 80% 100% at 50% 50%, rgba(196, 135, 59, 0.5) 0%, rgba(196, 135, 59, 0.15) 40%, transparent 70%)",
          transform: `translateY(${cameraDriftY}px)`,
        }}
      />

      {/* Thin bright horizon line */}
      <div
        style={{
          position: "absolute",
          left: "5%",
          right: "5%",
          top: "49.5%",
          height: 2,
          opacity: horizonOpacity * 0.8,
          background:
            "linear-gradient(90deg, transparent 0%, #C4873B 20%, #D4A04B 50%, #C4873B 80%, transparent 100%)",
          transform: `translateY(${cameraDriftY}px)`,
        }}
      />

      {/* Base engraving image — positioned to fill, with parallax */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateY(${fgDriftY}px)`,
        }}
      >
        <Img
          src={staticFile("images/evening-depleted-base.png")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            mixBlendMode: "lighten",
            opacity: 0.85,
          }}
        />
      </div>

      {/* Dark vignette overlay for depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, rgba(10, 15, 26, 0.6) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Bottom fade to pure dark */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "25%",
          background:
            "linear-gradient(to top, #0A0F1A 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
