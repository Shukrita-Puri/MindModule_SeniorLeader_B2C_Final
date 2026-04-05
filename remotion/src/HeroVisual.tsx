/**
 * Parametric Hero Visual composition.
 * Accepts tier, timeOfDay, and optional variant to render the correct
 * engraved landscape with dynamic natural motion layers.
 */
import type { FC } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Tier, TimeOfDay, Variant } from "./config/visualConfig";
import { VISUAL_CONFIGS, getDivergenceOverlay } from "./config/visualConfig";
import { CameraDrift } from "./motionLayers/CameraDrift";
import { TwinklingStars } from "./motionLayers/TwinklingStars";
import { DriftingClouds } from "./motionLayers/DriftingClouds";
import { SunRays } from "./motionLayers/SunRays";
import { HorizonGlow } from "./motionLayers/HorizonGlow";
import { BirdFlocks } from "./motionLayers/BirdFlocks";
import { RisingMist } from "./motionLayers/RisingMist";

export type HeroVisualProps = {
  tier: Tier;
  timeOfDay: TimeOfDay;
  variant?: Variant;
};

export const HeroVisual: FC<HeroVisualProps> = ({ tier, timeOfDay, variant = null }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const config = VISUAL_CONFIGS[tier][timeOfDay];

  const imageName = `${tier}-${timeOfDay}.png`;
  const divergenceOverlay = getDivergenceOverlay(variant);

  const motionProps = { frame, durationInFrames };

  return (
    <AbsoluteFill style={{ backgroundColor: config.vignetteColor, overflow: "hidden" }}>
      {/* Sky gradient base */}
      <div style={{ position: "absolute", inset: 0, background: config.skyGradient }} />

      <CameraDrift
        frame={frame}
        durationInFrames={durationInFrames}
        direction={config.cameraDrift}
        amount={config.cameraDriftAmount}
      >
        {/* Base illustration */}
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
            src={staticFile(`images/${imageName}`)}
            style={{
              width: "110%",
              height: "106%",
              objectFit: "cover",
              marginLeft: "-5%",
              marginTop: "-3%",
            }}
          />
        </div>

        {/* Motion layers - rendered on top of base image */}
        {config.showStars && (
          <TwinklingStars {...motionProps} count={config.starCount} />
        )}

        {config.showClouds && (
          <DriftingClouds
            {...motionProps}
            density={config.cloudDensity}
            speed={config.cloudSpeed}
            opacity={config.cloudOpacity}
            color={config.cloudColor}
          />
        )}

        {config.showSunRays && (
          <SunRays
            {...motionProps}
            intensity={config.sunIntensity}
            rayCount={config.sunRayCount}
            sunPosition={config.sunPosition}
            warmth={config.horizonWarmth}
          />
        )}

        {config.showHorizonGlow && (
          <HorizonGlow
            {...motionProps}
            color={config.horizonColor}
            glowColor={config.horizonGlowColor}
            warmth={config.horizonWarmth}
            sunPosition={config.sunPosition}
          />
        )}

        {config.showBirds && (
          <BirdFlocks {...motionProps} count={config.birdCount} />
        )}

        {config.showMist && (
          <RisingMist {...motionProps} intensity={config.mistIntensity} />
        )}
      </CameraDrift>

      {/* Vignette overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 75% 65% at 50% 50%, transparent 40%, ${config.vignetteColor} / 0.5) 100%)`,
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
          background: `linear-gradient(to top, ${config.bottomFadeColor} 0%, transparent 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Divergence color overlay */}
      {divergenceOverlay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: divergenceOverlay,
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
};
