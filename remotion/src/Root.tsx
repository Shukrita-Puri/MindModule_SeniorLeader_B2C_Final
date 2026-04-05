import { Composition } from "remotion";
import { HeroVisual } from "./HeroVisual";
import type { HeroVisualProps } from "./HeroVisual";
import { getAllCombinations } from "./config/visualConfig";

export const RemotionRoot = () => {
  const combos = getAllCombinations();

  return (
    <>
      {combos.map(({ tier, timeOfDay, variant, id }) => (
        <Composition<HeroVisualProps>
          key={id}
          id={id}
          component={HeroVisual}
          durationInFrames={240}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ tier, timeOfDay, variant }}
        />
      ))}
    </>
  );
};
