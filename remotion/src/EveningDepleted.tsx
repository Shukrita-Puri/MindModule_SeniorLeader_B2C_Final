import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
  Img,
} from "remotion";

/**
 * Evening Depleted — Active Calm
 * 
 * Motion system:
 * 1. Slow camera pan across the landscape (translateX drift)
 * 2. Horizon glow pulsing — light breathing in/out
 * 3. Clouds drifting left-to-right at different speeds (parallax)
 * 4. Stars twinkling with staggered timing
 * 5. Soft atmospheric particles floating upward (like embers/dust)
 * 6. Gentle scale breathing on the whole scene
 */

// Cloud definitions: [startX%, y%, width, height, speed, opacity]
const CLOUDS: Array<[number, number, number, number, number, number]> = [
  [-20, 12, 340, 40, 0.35, 0.25],
  [30, 8, 280, 30, 0.2, 0.18],
  [-40, 22, 400, 35, 0.45, 0.22],
  [60, 16, 250, 28, 0.15, 0.15],
  [-10, 28, 320, 32, 0.3, 0.2],
];

// Floating particles: [startX%, startY%, size, speed, delay, maxOpacity]
const PARTICLES: Array<[number, number, number, number, number, number]> = [
  [15, 85, 2.5, 0.4, 0, 0.3],
  [35, 90, 2, 0.3, 30, 0.25],
  [55, 88, 3, 0.35, 60, 0.28],
  [75, 92, 2, 0.45, 90, 0.22],
  [25, 95, 2.5, 0.38, 120, 0.26],
  [45, 87, 1.8, 0.32, 150, 0.2],
  [65, 93, 2.2, 0.42, 20, 0.24],
  [85, 89, 2, 0.36, 80, 0.22],
  [10, 91, 2.8, 0.28, 110, 0.18],
  [50, 86, 2, 0.4, 40, 0.3],
];

// Stars: [x%, y%, delay, maxOpacity, twinkleSpeed]
const STARS: Array<[number, number, number, number, number]> = [
  [12, 5, 20, 0.5, 3.2],
  [68, 3, 50, 0.6, 2.8],
  [42, 8, 80, 0.4, 3.5],
  [85, 6, 40, 0.55, 2.5],
  [28, 2, 100, 0.35, 3.0],
  [55, 10, 60, 0.45, 2.2],
  [78, 9, 30, 0.5, 3.8],
  [18, 12, 70, 0.3, 2.6],
];

export const EveningDepleted: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Sinusoidal for seamless loop
  const loopSin = Math.sin((frame / durationInFrames) * Math.PI * 2);
  const loopCos = Math.cos((frame / durationInFrames) * Math.PI * 2);

  // 1. Camera pan — slow horizontal drift (30px range, seamless)
  const cameraPanX = loopSin * 15;
  const cameraDriftY = loopCos * 3;

  // 2. Gentle scale breathing (1.0 → 1.02 → 1.0)
  const scaleBreathe = 1.0 + (loopSin * 0.5 + 0.5) * 0.025;

  // 3. Horizon glow pulse
  const horizonGlow = interpolate(
    loopSin,
    [-1, 0, 1],
    [0.5, 0.8, 1.0]
  );

  // Linear progress for clouds (wraps)
  const linearProgress = frame / durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0D1525", overflow: "hidden" }}>
      {/* Sky gradient — slightly lighter than before */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, #141D30 0%, #1A2540 30%, #2A3555 50%, #1E2A42 70%, #0D1525 100%)",
          transform: `translateY(${cameraDriftY}px)`,
        }}
      />

      {/* Stars with twinkling */}
      {STARS.map(([x, y, delay, maxOpacity, speed], i) => {
        const twinkle =
          Math.sin(((frame + delay * 3) / durationInFrames) * Math.PI * speed * 2) *
            0.5 +
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
              backgroundColor: "#D4C5A0",
              opacity,
              transform: `translate(${cameraPanX * 0.3}px, ${cameraDriftY}px)`,
              boxShadow: `0 0 ${3 + twinkle * 6}px rgba(212, 197, 160, ${opacity * 0.8})`,
            }}
          />
        );
      })}

      {/* Drifting clouds — translucent shapes moving across sky */}
      {CLOUDS.map(([startX, y, w, h, speed, opacity], i) => {
        // Clouds move continuously left-to-right, wrapping
        const cloudX =
          ((startX + linearProgress * speed * 300 + 100) % 200) - 60;
        const cloudOpacity =
          opacity * (0.7 + Math.sin((frame / durationInFrames) * Math.PI * 2 + i) * 0.3);

        return (
          <div
            key={`cloud-${i}`}
            style={{
              position: "absolute",
              left: `${cloudX}%`,
              top: `${y}%`,
              width: w,
              height: h,
              borderRadius: "50%",
              background: `radial-gradient(ellipse, rgba(160, 170, 195, ${cloudOpacity}) 0%, rgba(130, 145, 175, ${cloudOpacity * 0.5}) 40%, transparent 70%)`,
              transform: `translateX(${cameraPanX * (0.2 + speed)}px)`,
              filter: `blur(${8 + i * 2}px)`,
            }}
          />
        );
      })}

      {/* Horizon glow — warm amber pulse */}
      <div
        style={{
          position: "absolute",
          left: "-10%",
          right: "-10%",
          top: "42%",
          height: 200,
          opacity: horizonGlow * 0.7,
          background:
            "radial-gradient(ellipse 90% 100% at 50% 60%, rgba(196, 135, 59, 0.45) 0%, rgba(180, 120, 50, 0.2) 30%, rgba(160, 100, 40, 0.08) 60%, transparent 80%)",
          transform: `translateX(${cameraPanX}px) translateY(${cameraDriftY}px)`,
        }}
      />

      {/* Bright horizon line — pulses with glow */}
      <div
        style={{
          position: "absolute",
          left: "0%",
          right: "0%",
          top: "47%",
          height: 3,
          opacity: horizonGlow * 0.6,
          background:
            "linear-gradient(90deg, transparent 5%, rgba(196, 135, 59, 0.6) 25%, rgba(220, 170, 80, 0.8) 50%, rgba(196, 135, 59, 0.6) 75%, transparent 95%)",
          transform: `translateX(${cameraPanX}px) translateY(${cameraDriftY}px)`,
          boxShadow: `0 0 20px rgba(196, 135, 59, ${horizonGlow * 0.3})`,
        }}
      />

      {/* Main engraving illustration — panning and breathing */}
      <div
        style={{
          position: "absolute",
          left: "-5%",
          right: "-5%",
          top: "-3%",
          bottom: "-3%",
          transform: `translateX(${cameraPanX}px) translateY(${cameraDriftY * 1.5}px) scale(${scaleBreathe})`,
          transformOrigin: "center center",
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

      {/* Floating particles — warm embers drifting upward */}
      {PARTICLES.map(([x, startY, size, speed, delay, maxOpacity], i) => {
        const particleFrame = (frame + delay) % durationInFrames;
        const yProgress = (particleFrame / durationInFrames);
        const particleY = startY - yProgress * 40;
        const particleX = x + Math.sin((particleFrame / durationInFrames) * Math.PI * 3 + i) * 3;
        const fadeOut = interpolate(yProgress, [0, 0.1, 0.8, 1], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={`particle-${i}`}
            style={{
              position: "absolute",
              left: `${particleX}%`,
              top: `${particleY}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              backgroundColor: "#C4873B",
              opacity: fadeOut * maxOpacity,
              boxShadow: `0 0 ${size * 2}px rgba(196, 135, 59, ${fadeOut * maxOpacity * 0.5})`,
            }}
          />
        );
      })}

      {/* Atmospheric light rays from horizon */}
      {[0.3, 0.45, 0.55, 0.7].map((xPos, i) => {
        const rayOpacity = interpolate(
          Math.sin((frame / durationInFrames) * Math.PI * 2 + i * 1.5),
          [-1, 1],
          [0.02, 0.08]
        );
        return (
          <div
            key={`ray-${i}`}
            style={{
              position: "absolute",
              left: `${xPos * 100}%`,
              top: "30%",
              width: 2,
              height: "25%",
              background: `linear-gradient(to top, rgba(196, 135, 59, ${rayOpacity}), transparent)`,
              transform: `translateX(${cameraPanX}px) rotate(${(xPos - 0.5) * 8}deg)`,
              transformOrigin: "bottom center",
            }}
          />
        );
      })}

      {/* Dark vignette — softer than before */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 75% 65% at 50% 50%, transparent 40%, rgba(13, 21, 37, 0.5) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Bottom fade */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "20%",
          background:
            "linear-gradient(to top, #0D1525 0%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
