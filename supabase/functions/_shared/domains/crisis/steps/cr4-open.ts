// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step CR4 & CR6: Episode Opening, Closing and Maintenance.
// Source: Part 2 Layer 2 (Section 4.7, CR4, CR6).

import type { CrisisEpisode } from "../types.ts";
import type { CrisisItemSignal } from "./cr1-signals.ts";
import { EPISODE_CLOSE_QUIET_HOURS } from "../constants.ts";

export function stepEvaluateCrisisEpisode(params: {
  signals: CrisisItemSignal[];
  hasDisplacedRoutineMeetings?: boolean;
  existingEpisode?: CrisisEpisode | null;
  nowUtc?: Date;
}): CrisisEpisode | null {
  const now = params.nowUtc ?? new Date();
  const nowMs = now.getTime();

  // If existing open episode, check if it should close (48 quiet hours)
  if (params.existingEpisode && params.existingEpisode.state === "open") {
    const lastActivityMs = new Date(params.existingEpisode.lastActivityUtc).getTime();
    const quietHours = (nowMs - lastActivityMs) / (1000 * 60 * 60);

    // If quiet for >= 48 hours, close the episode
    if (quietHours >= EPISODE_CLOSE_QUIET_HOURS) {
      return {
        ...params.existingEpisode,
        state: "closed",
      };
    }

    // Check if new member items arrived
    const currentMemberSet = new Set(params.existingEpisode.memberItemIds);
    let updatedActivity = false;
    for (const s of params.signals) {
      if (s.isCategoryJ || s.hasIncidentWording) {
        const id = s.item.externalId || s.item.identityKey;
        if (!currentMemberSet.has(id)) {
          currentMemberSet.add(id);
          updatedActivity = true;
        }
      }
    }

    if (updatedActivity) {
      return {
        ...params.existingEpisode,
        memberItemIds: Array.from(currentMemberSet),
        lastActivityUtc: now.toISOString(),
      };
    }

    return params.existingEpisode;
  }

  // Evaluate opening a new episode
  const govCrisis = params.signals.filter((s) => s.isGovCrisis);
  const categoryJItems = params.signals.filter((s) => s.isCategoryJ);
  const shortNoticeCrisisStakeholders = params.signals.filter(
    (s) => s.isShortNotice && s.hasCrisisStakeholders,
  );
  const shortNoticeIncidentItems = params.signals.filter(
    (s) => s.isShortNotice && (s.isCategoryJ || s.hasIncidentWording),
  );

  const memberIds: string[] = [];
  const reasons: string[] = [];
  let confidence: "high" | "medium" | "low" = "medium";
  let shouldOpen = false;

  // Rule 1: One gov.crisis at high confidence
  if (govCrisis.length >= 1) {
    shouldOpen = true;
    confidence = "high";
    reasons.push("SEV-1 / crisis governance war room detected");
    memberIds.push(...govCrisis.map((s) => s.item.externalId || s.item.identityKey));
  }

  // Rule 2: Two or more J items within 24 hours
  if (!shouldOpen && categoryJItems.length >= 2) {
    shouldOpen = true;
    confidence = "high";
    reasons.push("Multiple Category J risk/incident events clustered within 24 hours");
    memberIds.push(...categoryJItems.map((s) => s.item.externalId || s.item.identityKey));
  }

  // Rule 3: Three or more short-notice items sharing crisis stakeholders
  if (!shouldOpen && shortNoticeCrisisStakeholders.length >= 3) {
    shouldOpen = true;
    confidence = "medium";
    reasons.push("Multiple short-notice emergency items involving outside legal/PR/regulator counsel");
    memberIds.push(...shortNoticeCrisisStakeholders.map((s) => s.item.externalId || s.item.identityKey));
  }

  // Rule 4: Two or more short-notice J or incident-worded items + displacement
  if (!shouldOpen && shortNoticeIncidentItems.length >= 2 && params.hasDisplacedRoutineMeetings) {
    shouldOpen = true;
    confidence = "medium";
    reasons.push("Short-notice incident cluster displacing routine meetings");
    memberIds.push(...shortNoticeIncidentItems.map((s) => s.item.externalId || s.item.identityKey));
  }

  if (shouldOpen) {
    return {
      episodeId: `crisis_ep_${Date.now()}`,
      openedAtUtc: now.toISOString(),
      state: "open",
      memberItemIds: Array.from(new Set(memberIds)),
      reasons,
      confidence,
      lastActivityUtc: now.toISOString(),
    };
  }

  return null;
}
