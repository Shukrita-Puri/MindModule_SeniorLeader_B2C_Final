import { Composition } from "remotion";
import { EveningDepleted } from "./EveningDepleted";

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={EveningDepleted}
    durationInFrames={240}
    fps={30}
    width={1080}
    height={1920}
  />
);
