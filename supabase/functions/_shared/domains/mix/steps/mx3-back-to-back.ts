// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step MX3: Back-to-Back Chains and Dense Day Mode.
// Source: Part 2 Layer 2 (Section 4.6, MX3).

import type { BackToBackFact, BackToBackChain } from "../types.ts";
import type { SequencedMeeting } from "./mx1-sequence.ts";
import {
  BACK_TO_BACK_GAP_MIN,
  BACK_TO_BACK_DAY_HOURS,
  DENSE_DAY_CHAIN_HOURS,
} from "../constants.ts";

export function stepBackToBack(meetings: SequencedMeeting[]): BackToBackFact {
  if (meetings.length < 2) {
    return {
      isBackToBackDay: false,
      totalChainHours: 0,
      longestChainHours: 0,
      chains: [],
      reachesDenseDay: false,
    };
  }

  const chains: BackToBackChain[] = [];
  let currentChain: SequencedMeeting[] = [meetings[0]];

  for (let i = 1; i < meetings.length; i++) {
    const m = meetings[i];
    if (m.gapFromPreviousMin < BACK_TO_BACK_GAP_MIN) {
      currentChain.push(m);
    } else {
      if (currentChain.length >= 2) {
        const sMs = currentChain[0].startMs;
        const eMs = currentChain[currentChain.length - 1].endMs;
        const durationHours = Math.round(((eMs - sMs) / (1000 * 60 * 60)) * 10) / 10;
        const categories = Array.from(new Set(currentChain.map((x) => x.category)));
        chains.push({
          startUtc: currentChain[0].item.startUtc ?? "",
          endUtc: currentChain[currentChain.length - 1].item.endUtc ?? "",
          durationHours,
          categories,
          meetingCount: currentChain.length,
        });
      }
      currentChain = [m];
    }
  }

  if (currentChain.length >= 2) {
    const sMs = currentChain[0].startMs;
    const eMs = currentChain[currentChain.length - 1].endMs;
    const durationHours = Math.round(((eMs - sMs) / (1000 * 60 * 60)) * 10) / 10;
    const categories = Array.from(new Set(currentChain.map((x) => x.category)));
    chains.push({
      startUtc: currentChain[0].item.startUtc ?? "",
      endUtc: currentChain[currentChain.length - 1].item.endUtc ?? "",
      durationHours,
      categories,
      meetingCount: currentChain.length,
    });
  }

  let totalChainHours = 0;
  let longestChainHours = 0;

  for (const c of chains) {
    totalChainHours += c.durationHours;
    if (c.durationHours > longestChainHours) {
      longestChainHours = c.durationHours;
    }
  }

  totalChainHours = Math.round(totalChainHours * 10) / 10;

  const isBackToBackDay = totalChainHours >= BACK_TO_BACK_DAY_HOURS;
  const reachesDenseDay = longestChainHours >= DENSE_DAY_CHAIN_HOURS || totalChainHours >= DENSE_DAY_CHAIN_HOURS;

  return {
    isBackToBackDay,
    totalChainHours,
    longestChainHours,
    chains,
    reachesDenseDay,
  };
}
