// [KIND: implementation] [LAYER: 1] [TIERS: 0-3] [AUDIENCE: universal]
// Domain Event Classifier Orchestrator (Steps 1.1 through 3.5).
// Source: Final Design (§4, §6), Part 2 Layer 1.

import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type {
  ClassificationStamp,
  ResolvedEvent,
  ResolveEventInput,
  ItemDemandComputed,
  CategoryLetter,
  SubtypeId,
} from "./types.ts";
import type { MemoryService } from "../memory/service.ts";
import type { CompanyContextProfile } from "../relationships/types.ts";
import { prepareEvent } from "./steps/step1-prepare.ts";
import { gatherFindings } from "./steps/step2-findings.ts";
import { buildPicture } from "./steps/step3-picture.ts";
import { CANONICAL_CATEGORIES } from "../../spine/categories.ts";
import { TAXONOMY_VERSION, CLASSIFIER_VERSION } from "./constants.ts";

import { createEmptyDemandVector } from "../../spine/dimensions.ts";

/**
 * Computes demand dimensions and recovery minutes for an item.
 */
function computeDemand(
  category: CategoryLetter | null,
  subtypeId: SubtypeId | null,
  durationMinutes: number | null,
): ItemDemandComputed | null {
  if (!category) return null;

  const profile = createEmptyDemandVector();
  switch (category) {
    case "A":
      profile.political = 3;
      profile.cognitive = 2;
      profile.arousal = 2;
      break;
    case "B":
      profile.cognitive = 2;
      profile.visibility = 2;
      profile.arousal = 2;
      break;
    case "C":
      profile.visibility = 3;
      profile.energy = 2;
      profile.arousal = 2;
      break;
    case "D":
      profile.emotional = 2;
      profile.relational = 2;
      break;
    case "E":
      profile.cognitive = 3;
      break;
    case "F":
      profile.energy = 2;
      profile.visibility = 1;
      break;
    case "G":
      profile.circadian = 2;
      profile.energy = 2;
      break;
    case "H":
      break;
    case "I":
      profile.cognitive = 1;
      profile.switchCost = 2;
      break;
    case "J":
      profile.emotional = 3;
      profile.political = 3;
      profile.arousal = 3;
      break;
  }

  let recoveryMinutes = 15;
  if (category === "A" || category === "J" || (durationMinutes && durationMinutes >= 90)) {
    recoveryMinutes = 30;
  }

  return {
    demandProfile: profile,
    arousal: profile.arousal,
    switchCost: profile.switchCost,
    recoveryMinutes,
  };
}

export class DomainEventClassifier {
  constructor(private memoryService?: MemoryService | null) {}

  /**
   * Classifies any raw calendar event or canonical item into an immutable ClassificationStamp.
   */
  public classify(
    input: ResolveEventInput,
    options?: {
      userContext?: CompanyContextProfile | null;
      crisisEpisodeActive?: boolean;
      traceId?: string;
    },
  ): ClassificationStamp {
    const raw = typeof input === "string" ? { title: input } : input;
    const nowIso = new Date().toISOString();

    // Phase 1: Prepare
    const prep = prepareEvent({
      raw,
      memoryService: this.memoryService,
      traceId: options?.traceId,
    });

    const item = prep.item;
    const itemId = item.externalId || item.identityKey || `item_${Date.now()}`;

    // Early termination: cancelled
    if (prep.isCancelled) {
      return {
        itemId,
        sourceType: "calendar",
        category: null,
        categoryConfidence: 1.0,
        subtype: null,
        subtypeConfidence: 0.0,
        bestCandidateSubtype: null,
        confirmationState: "confirmed",
        decisionSource: "provider_label",
        runnerUp: null,
        reasons: ["Event is cancelled or declined by user"],
        findings: [],
        dimensions: {
          stakes: "low",
          travelRelated: false,
          workContext: "work",
          durationMinutes: null,
        },
        itemDemand: null,
        taxonomyVersion: TAXONOMY_VERSION,
        classifierVersion: CLASSIFIER_VERSION,
        classifiedAt: nowIso,
      };
    }

    // Early termination: declared memory or explicit user override
    if (prep.earlyCategory) {
      const cat = prep.earlyCategory as CategoryLetter;
      const sub = (prep.earlySubtype as SubtypeId) ?? null;
      return {
        itemId,
        sourceType: "calendar",
        category: cat,
        categoryConfidence: 1.0,
        subtype: sub,
        subtypeConfidence: sub ? 1.0 : 0.0,
        bestCandidateSubtype: sub,
        confirmationState: "confirmed",
        decisionSource: "user_correction",
        runnerUp: null,
        reasons: [`Decisive user confirmation via ${prep.earlySource}`],
        findings: prep.memoryFindings,
        dimensions: {
          stakes: cat === "A" || cat === "J" || cat === "B" || cat === "C" ? "high" : "medium",
          travelRelated: cat === "G",
          workContext: cat === "H" ? "personal" : "work",
          durationMinutes: null,
        },
        itemDemand: computeDemand(cat, sub, null),
        taxonomyVersion: TAXONOMY_VERSION,
        classifierVersion: CLASSIFIER_VERSION,
        classifiedAt: nowIso,
      };
    }

    // Phase 2: Gather Findings
    const findings = gatherFindings({
      item,
      userContext: options?.userContext,
      crisisEpisodeActive: options?.crisisEpisodeActive,
    });
    findings.push(...prep.memoryFindings);

    // Phase 3: Build the Picture
    const pic = buildPicture({
      item,
      findings,
    });

    return {
      itemId,
      sourceType: "calendar",
      category: pic.category,
      categoryConfidence: pic.categoryConfidence,
      subtype: pic.subtype,
      subtypeConfidence: pic.subtypeConfidence,
      bestCandidateSubtype: pic.bestCandidateSubtype,
      confirmationState: pic.confirmationState,
      decisionSource: pic.decisionSource,
      runnerUp: pic.runnerUp,
      reasons: pic.reasons,
      findings,
      dimensions: pic.dimensions,
      itemDemand: computeDemand(pic.category, pic.subtype, pic.dimensions.durationMinutes),
      taxonomyVersion: TAXONOMY_VERSION,
      classifierVersion: CLASSIFIER_VERSION,
      classifiedAt: nowIso,
    };
  }

  /**
   * Resolves an event into the unified ResolvedEvent shape expected by all feature surfaces.
   */
  public resolve(
    input: ResolveEventInput,
    options?: {
      userContext?: CompanyContextProfile | null;
      crisisEpisodeActive?: boolean;
      traceId?: string;
    },
  ): ResolvedEvent {
    const stamp = this.classify(input, options);
    const category = stamp.category ? CANONICAL_CATEGORIES[stamp.category] : null;
    const subtype = stamp.subtype
      ? {
          id: stamp.subtype,
          categoryId: stamp.category!,
          name: stamp.subtype,
          description: "",
          jitLeadTimeMinutes: 15,
        }
      : null;

    const conf: "high" | "medium" | "low" =
      stamp.categoryConfidence >= 0.75
        ? "high"
        : stamp.categoryConfidence >= 0.55
        ? "medium"
        : "low";

    return {
      subtype,
      categoryId: stamp.category,
      category,
      subcategory: stamp.subtype,
      bucket: category?.name ?? null,
      label: subtype?.name ?? category?.name ?? null,
      scenarioId: stamp.subtype,
      confidence: conf,
      source: stamp.decisionSource,
      stamp,
    };
  }
}

/** Global singleton domain instance */
export const domainEventClassifier = new DomainEventClassifier();

/**
 * Public resolveEvent function for the events domain.
 */
export function resolveEvent(
  input: ResolveEventInput,
  options?: {
    userContext?: CompanyContextProfile | null;
    crisisEpisodeActive?: boolean;
    traceId?: string;
  },
): ResolvedEvent {
  return domainEventClassifier.resolve(input, options);
}
