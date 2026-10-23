// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step S3: Evaluate User State Signals.
// Source: Part 2 Layer 5 (Section 4.3).

import type { BehaviourSignal } from "../types.ts";
import { SIGNAL_PRECEDENCE_MAP } from "../constants.ts";

export function evaluateStateSignals(bundle: any): BehaviourSignal[] {
  const signals: BehaviourSignal[] = [];

  const stateProfile = bundle.stateProfile;
  const windowProfile = bundle.windowProfile;
  const agreement = stateProfile?.agreement;
  const fit = stateProfile?.fit;
  const remaining = windowProfile?.remaining;

  // 1. vetoRisk (Masked fatigue: body is lower than user feels, ahead of high-stakes demand)
  if (
    agreement?.hasDivergence &&
    agreement.divergence?.direction === "body_lower" &&
    bundle.importance?.topItemAnchor
  ) {
    const isSevere = agreement.divergence.tierGapSize >= 2;
    signals.push({
      name: "vetoRisk",
      severity: isSevere ? "high" : "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.vetoRisk,
      evidencePointers: [
        `L2 agreement: divergence body_lower (${agreement.divergence.tierGapSize} tiers)`,
        `L2 importance anchor ahead`,
      ],
      reason: "Physiology shows significant reserve deficit masked by high self-report; veto fatigue risk",
    });
  }

  // 2. decisionLeakage
  if (remaining?.decisionLeakageRisk) {
    signals.push({
      name: "decisionLeakage",
      severity: "high",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.decisionLeakage,
      evidencePointers: ["L2 remaining: decisionLeakageRisk true (D/J ahead with elevated HR)"],
      reason: "Critical decision items remain while physiological arousal/drift is elevated",
    });
  }

  // 3. readinessGap
  if (fit?.hasGap && fit.readinessDemandGap) {
    const isSevere = fit.readinessDemandGap.size === "severe";
    signals.push({
      name: "readinessGap",
      severity: isSevere ? "high" : "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.readinessGap,
      evidencePointers: [`L2 fit: readiness demand gap (${fit.readinessDemandGap.size})`],
      reason: `Current capacity does not match upcoming demand (${fit.readinessDemandGap.summary})`,
    });
  }

  // 4. postPeak
  const livedLoad = bundle.windowProfile?.horizons?.lookBack?.yesterdayLivedLoad;
  if (livedLoad === "heavy" && stateProfile?.tier === "managing") {
    signals.push({
      name: "postPeak",
      severity: "medium",
      fired: true,
      precedenceRank: SIGNAL_PRECEDENCE_MAP.postPeak,
      evidencePointers: ["L2 look-back: yesterday heavy lived load with morning managing tier"],
      reason: "Post-peak hangover following heavy prior day load",
    });
  }

  return signals;
}
