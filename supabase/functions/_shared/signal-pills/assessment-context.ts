import type {
  DerivePillsDiagnostics,
  FinalizePillsDiagnostics,
  PillKey,
  PillSource,
  PillTier,
  SignalPill,
} from "./derive-pills.ts";
import type { CooccurrenceSignal } from "./derive-pills.ts";
import type { MrsSource } from "../signal-engine/divergence-flag.ts";
import type { CoherenceAdjustment, PillQualifiers } from "../signal-engine/checkin-pattern-aggregator.ts";

export type AssessmentSourceCategory =
  | "wearable_objective"
  | "self_report"
  | "behavioural_pattern"
  | "calendar_context";

export type AssessmentMode = "baseline" | "refined" | "awaiting";
export type ReadinessBand = "high" | "mid" | "low" | null;
export type DivergenceDirection = "positive" | "negative";
export type DivergenceEvidenceKey =
  | "hrvValue"
  | "sleepDuration"
  | "sleepScore"
  | "sleepEfficiency"
  | "rhrValue"
  | "hrValue"
  | "outcome"
  | "clarityLevel"
  | "emotionLevel"
  | "regulationLevel"
  | "pressureLevel";

export interface StructuredDivergenceSide {
  source: AssessmentSourceCategory;
  direction: DivergenceDirection;
  evidenceKeys: DivergenceEvidenceKey[];
}

export interface StructuredDivergence {
  pillar: PillKey;
  left: StructuredDivergenceSide;
  right: StructuredDivergenceSide;
}

export interface AssessmentPillProvenance {
  decision_readiness: AssessmentSourceCategory[];
  physical_reserves: AssessmentSourceCategory[];
  resilience_capacity: AssessmentSourceCategory[];
}

export interface AssessmentContextInput {
  localDate: string;
  timeWindow: "morning" | "afternoon" | "evening";
  timezoneOffsetMinutes: number;
  currentTimezone: string | null;
  homeTimezone: string | null;
  derivationVersion: string;
  readiness: {
    score: number | null;
    tier: string | null;
    displayedTier: string | null;
    capReason: string | null;
    band: ReadinessBand;
    mode: AssessmentMode;
  };
  pills: {
    finalized: SignalPill[];
    qualifiers: PillQualifiers;
    coherence: {
      inSync: boolean;
      adjustments: CoherenceAdjustment[];
    };
    coherenceWarning: string | null;
    diagnostics: {
      derive: DerivePillsDiagnostics;
      finalize: FinalizePillsDiagnostics;
    };
  };
  provenance: {
    mrs: { sources: MrsSource[]; primary: MrsSource | null; refinedBy: "checkin" | null };
    brief: { sources: MrsSource[]; briefSource: "llm" | "deterministic" | "awaiting" };
    pills: {
      decision_readiness: MrsSource[];
      physical_reserves: MrsSource[];
      resilience_capacity: MrsSource[];
    };
  };
  checkIn: {
    outcome: string | null;
    clarityLevel: number | null;
    confidenceLevel: number | null;
    mentalSharpnessLevel: number | null;
    emotionLevel: number | null;
    regulationLevel: number | null;
    pressureLevel: number | null;
  };
  wearable: {
    hasWearable: boolean;
    wearableFreshForGate: boolean;
    hasTodayData: boolean;
    hasRecentData: boolean;
    wearableDaysConnected: number | null;
    wearableSourceAgeDays: number | null;
    hrvValue: number | null;
    hrvDeviation: number | null;
    sleepDuration: number | null;
    sleepScore: number | null;
    sleepEfficiency: number | null;
    rhrValue: number | null;
    rhrDeviation: number | null;
    hrValue: number | null;
    hrDeviation: number | null;
  };
  patterns: {
    hrv3dTrend: "improving" | "stable" | "declining" | "unknown";
    rhr3dTrend: "declining" | "stable" | "rising" | "unknown";
    sustainedDeficitFlag: boolean;
    consecutiveHighLoadDays: number;
    cooccurrence7d: CooccurrenceSignal;
    avgScore7d: number | null;
    scoreTrajectory7d: string | null;
    hrvEventCorrelation: string | null;
  };
  calendar: {
    load: "low" | "medium" | "high" | null;
    pressure: "low" | "medium" | "high" | null;
    highStakesEventsCount: number;
    hasBackToBack: boolean;
    nextHighStakesMinutesUntil: number | null;
    typicalLoadForDow: "low" | "medium" | "high" | null;
    tomorrowLoad: "low" | "medium" | "high" | null;
    tomorrowHighStakesCount: number;
  };
}

export interface AssessmentContext {
  local: {
    date: string;
    window: "morning" | "afternoon" | "evening";
    timezoneOffsetMinutes: number;
    currentTimezone: string | null;
    homeTimezone: string | null;
  };
  readiness: AssessmentContextInput["readiness"];
  pills: AssessmentContextInput["pills"];
  provenance: {
    mrs: AssessmentContextInput["provenance"]["mrs"] & {
      normalizedSources: AssessmentSourceCategory[];
    };
    brief: {
      sources: AssessmentSourceCategory[];
      briefSource: "llm" | "deterministic" | "awaiting";
    };
    pills: AssessmentPillProvenance;
  };
  checkIn: AssessmentContextInput["checkIn"];
  wearable: AssessmentContextInput["wearable"];
  patterns: AssessmentContextInput["patterns"];
  calendar: AssessmentContextInput["calendar"];
  divergence: StructuredDivergence | null;
  deterministic: {
    derivationVersion: string;
    inputFingerprint: string;
    pillFingerprint: string;
  };
}

const SOURCE_CATEGORY_MAP: Record<MrsSource, AssessmentSourceCategory> = {
  wearable: "wearable_objective",
  calendar: "calendar_context",
  checkin: "self_report",
  pattern: "behavioural_pattern",
  "ceo-behaviour": "behavioural_pattern",
};

const SELF_REPORT_NEGATIVE_RE = /\b(drained|depleted|overwhelmed|foggy|scattered|strained|spent|heavy|low)\b/i;
const SELF_REPORT_POSITIVE_RE = /\b(strong|sharp|clear|steady|good|energized|energised|ready)\b/i;

function mapMrsSources(sources: MrsSource[]): AssessmentSourceCategory[] {
  return [...new Set(sources.map((source) => SOURCE_CATEGORY_MAP[source]).filter(Boolean))];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    const cloned = value.map((item) => cloneAndFreeze(item)) as unknown as T;
    return Object.freeze(cloned);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const cloned: Record<string, unknown> = {};
    for (const key of Object.keys(record)) cloned[key] = cloneAndFreeze(record[key]);
    return Object.freeze(cloned) as T;
  }
  return value;
}

function contributorsToEvidenceKeys(pill: SignalPill, source: PillSource): DivergenceEvidenceKey[] {
  const keys = Object.keys(pill.contributors ?? {}) as DivergenceEvidenceKey[];
  if (source === "wearable") {
    return keys.filter((key) =>
      key === "hrvValue" ||
      key === "sleepDuration" ||
      key === "sleepScore" ||
      key === "sleepEfficiency" ||
      key === "rhrValue" ||
      key === "hrValue"
    );
  }
  if (source === "checkin") {
    return keys.filter((key) =>
      key === "clarityLevel" ||
      key === "emotionLevel" ||
      key === "regulationLevel" ||
      key === "pressureLevel"
    );
  }
  return [];
}

function objectiveDirectionForDecisionReadiness(
  wearable: AssessmentContextInput["wearable"],
): {
  direction: DivergenceDirection | null;
  evidenceKeys: DivergenceEvidenceKey[];
} {
  const evidenceKeys: DivergenceEvidenceKey[] = [];
  const votes: DivergenceDirection[] = [];

  if (typeof wearable.hrvDeviation === "number") {
    evidenceKeys.push("hrvValue");
    votes.push(wearable.hrvDeviation < -8 ? "negative" : "positive");
  } else if (typeof wearable.hrvValue === "number") {
    evidenceKeys.push("hrvValue");
    votes.push(wearable.hrvValue < 40 ? "negative" : "positive");
  }

  if (typeof wearable.sleepDuration === "number") {
    evidenceKeys.push("sleepDuration");
    votes.push(wearable.sleepDuration < 420 ? "negative" : "positive");
  } else if (typeof wearable.sleepScore === "number") {
    evidenceKeys.push("sleepScore");
    votes.push(wearable.sleepScore < 70 ? "negative" : "positive");
  }

  if (votes.includes("negative")) {
    return { direction: "negative", evidenceKeys };
  }
  if (votes.includes("positive")) {
    return { direction: "positive", evidenceKeys };
  }
  return { direction: null, evidenceKeys: [] };
}

function selfReportDirection(checkIn: AssessmentContextInput["checkIn"]): {
  direction: DivergenceDirection | null;
  evidenceKeys: DivergenceEvidenceKey[];
} {
  if (typeof checkIn.outcome === "string" && SELF_REPORT_NEGATIVE_RE.test(checkIn.outcome)) {
    return { direction: "negative", evidenceKeys: ["outcome"] };
  }
  if (typeof checkIn.outcome === "string" && SELF_REPORT_POSITIVE_RE.test(checkIn.outcome)) {
    return { direction: "positive", evidenceKeys: ["outcome"] };
  }
  if (typeof checkIn.clarityLevel === "number") {
    if (checkIn.clarityLevel <= 2) return { direction: "negative", evidenceKeys: ["clarityLevel"] };
    if (checkIn.clarityLevel >= 4) return { direction: "positive", evidenceKeys: ["clarityLevel"] };
  }
  return { direction: null, evidenceKeys: [] };
}

export function deriveStructuredDivergence(input: Pick<AssessmentContextInput, "pills" | "checkIn" | "wearable">): StructuredDivergence | null {
  if (!input.wearable.hasWearable || !input.wearable.wearableFreshForGate) return null;
  const finalized = input.pills.finalized;
  const decision = finalized.find((pill) => pill.key === "decision_readiness");
  if (!decision || !decision.sourceTypes.includes("wearable")) return null;

  const objective = objectiveDirectionForDecisionReadiness(input.wearable);
  const self = selfReportDirection(input.checkIn);
  if (!objective.direction || !self.direction || objective.direction === self.direction) return null;

  const objectiveEvidence = objective.evidenceKeys.length > 0
    ? objective.evidenceKeys
    : contributorsToEvidenceKeys(decision, "wearable");
  if (objectiveEvidence.length === 0 || self.evidenceKeys.length === 0) return null;

  return {
    pillar: "decision_readiness",
    left: {
      source: "wearable_objective",
      direction: objective.direction,
      evidenceKeys: objectiveEvidence,
    },
    right: {
      source: "self_report",
      direction: self.direction,
      evidenceKeys: self.evidenceKeys,
    },
  };
}

export async function buildAssessmentContext(input: AssessmentContextInput): Promise<Readonly<AssessmentContext>> {
  const divergence = deriveStructuredDivergence({
    pills: input.pills,
    checkIn: input.checkIn,
    wearable: input.wearable,
  });
  const pillFingerprintInput = input.pills.finalized.map((pill) => ({
    key: pill.key,
    tier: pill.tier,
    tierLabel: pill.tierLabel,
    sourceTypes: [...pill.sourceTypes].sort(),
    freshness: pill.freshness,
    hiddenReason: pill.hiddenReason,
    isScoreBearing: pill.isScoreBearing,
    contributedByCheckIn: pill.contributedByCheckIn,
    contributors: pill.contributors,
    qualifiers: pill.qualifiers ?? null,
  }));
  const pillFingerprint = await sha256Hex(stableStringify(pillFingerprintInput));
  const inputFingerprint = await sha256Hex(stableStringify({
    local: {
      date: input.localDate,
      window: input.timeWindow,
      timezoneOffsetMinutes: input.timezoneOffsetMinutes,
      currentTimezone: input.currentTimezone,
      homeTimezone: input.homeTimezone,
    },
    readiness: input.readiness,
    checkIn: input.checkIn,
    wearable: input.wearable,
    patterns: input.patterns,
    calendar: input.calendar,
    divergence,
    provenance: {
      mrs: mapMrsSources(input.provenance.mrs.sources),
      brief: mapMrsSources(input.provenance.brief.sources),
      pills: {
        decision_readiness: mapMrsSources(input.provenance.pills.decision_readiness),
        physical_reserves: mapMrsSources(input.provenance.pills.physical_reserves),
        resilience_capacity: mapMrsSources(input.provenance.pills.resilience_capacity),
      },
    },
    derivationVersion: input.derivationVersion,
  }));

  return cloneAndFreeze({
    local: {
      date: input.localDate,
      window: input.timeWindow,
      timezoneOffsetMinutes: input.timezoneOffsetMinutes,
      currentTimezone: input.currentTimezone,
      homeTimezone: input.homeTimezone,
    },
    readiness: input.readiness,
    pills: input.pills,
    provenance: {
      mrs: {
        ...input.provenance.mrs,
        normalizedSources: mapMrsSources(input.provenance.mrs.sources),
      },
      brief: {
        sources: mapMrsSources(input.provenance.brief.sources),
        briefSource: input.provenance.brief.briefSource,
      },
      pills: {
        decision_readiness: mapMrsSources(input.provenance.pills.decision_readiness),
        physical_reserves: mapMrsSources(input.provenance.pills.physical_reserves),
        resilience_capacity: mapMrsSources(input.provenance.pills.resilience_capacity),
      },
    },
    checkIn: input.checkIn,
    wearable: input.wearable,
    patterns: input.patterns,
    calendar: input.calendar,
    divergence,
    deterministic: {
      derivationVersion: input.derivationVersion,
      inputFingerprint,
      pillFingerprint,
    },
  });
}

function formatContributorKeys(pill: SignalPill): string {
  const keys = Object.keys(pill.contributors ?? {}).filter((key) => {
    const value = (pill.contributors as Record<string, unknown>)[key];
    return value !== null && value !== undefined && value !== false;
  });
  return keys.length > 0 ? keys.join(", ") : "none";
}

function formatPillSources(sources: AssessmentSourceCategory[]): string {
  return sources.length > 0 ? sources.join(", ") : "none";
}

export function formatPillAssessmentSection(context: AssessmentContext): string {
  const lines: string[] = [
    "",
    "",
    "=== PILL ASSESSMENT ===",
    `Assessment fingerprints: input=${context.deterministic.inputFingerprint} · pills=${context.deterministic.pillFingerprint} · version=${context.deterministic.derivationVersion}`,
  ];
  for (const pill of context.pills.finalized) {
    const provenance = context.provenance.pills[pill.key];
    lines.push(
      `${pill.label}: ${pill.tier} · ${pill.tierLabel} · freshness=${pill.freshness} · scoreBearing=${pill.isScoreBearing ? "yes" : "no"}`,
    );
    lines.push(`Sources: ${formatPillSources(provenance)} · contributor_keys: ${formatContributorKeys(pill)}`);
    lines.push(`Unread/detail: ${pill.hiddenReason ?? "none"} · ${pill.detail ?? "none"}`);
  }
  if (context.divergence) {
    lines.push(
      `Structured divergence: ${context.divergence.pillar} · ${context.divergence.left.source} ${context.divergence.left.direction} [${context.divergence.left.evidenceKeys.join(", ")}] vs ${context.divergence.right.source} ${context.divergence.right.direction} [${context.divergence.right.evidenceKeys.join(", ")}]`,
    );
    lines.push(
      "If you describe divergence, name both sides with actual evidence from this section. Do not call clarity wearable/objective.",
    );
  } else {
    lines.push("Structured divergence: none");
  }
  lines.push("Do not restate the numeric MRS. Do not repeat pill labels verbatim.");
  return lines.join("\n");
}

export function buildPillContextFromAssessment(context: AssessmentContext): {
  decisionReadiness: PillTier;
  physicalReserves: PillTier;
  resilienceCapacity: PillTier;
  divergence: {
    exists: boolean;
    dimension?: PillKey;
    left?: StructuredDivergenceSide;
    right?: StructuredDivergenceSide;
  } | null;
} {
  const dr = context.pills.finalized.find((pill) => pill.key === "decision_readiness");
  const pr = context.pills.finalized.find((pill) => pill.key === "physical_reserves");
  const rc = context.pills.finalized.find((pill) => pill.key === "resilience_capacity");
  return {
    decisionReadiness: (dr?.tier ?? "neutral") as PillTier,
    physicalReserves: (pr?.tier ?? "neutral") as PillTier,
    resilienceCapacity: (rc?.tier ?? "neutral") as PillTier,
    divergence: context.divergence
      ? {
          exists: true,
          dimension: context.divergence.pillar,
          left: context.divergence.left,
          right: context.divergence.right,
        }
      : null,
  };
}
