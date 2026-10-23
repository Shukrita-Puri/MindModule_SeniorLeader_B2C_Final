// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Crisis Episode Domain Types.
// Source: Part 2 Layer 2 (Section 4.7).

export type EpisodeState = "open" | "confirmed" | "closed" | "rejected";

export interface CrisisEpisode {
  episodeId: string;
  openedAtUtc: string;
  state: EpisodeState;
  memberItemIds: string[];
  reasons: string[];
  confidence: "high" | "medium" | "low";
  lastActivityUtc: string;
}

export interface CrisisFacts {
  isCrisisDay: boolean;
  crisisEpisodeActive: boolean;
  activeEpisode: CrisisEpisode | null;
  reasons: string[];
}
