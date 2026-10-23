// [KIND: step] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Selector Stage IS5: Formats versioned decision record for plan ledger / shadow logging.
// Source: Part 2 Layer 3 (Section 8.8).

import type { SelectionResult } from "../types.ts";

export interface DecisionRecord {
  decisionId: string;
  slotId: string;
  need: string;
  chosenId: string;
  chosenKind: string;
  alternateId: string | null;
  outcome: string;
  score: number;
  reasonCodes: string[];
  rejectionsCount: number;
  recordedAt: string;
}

export function stepRecordDecision(result: SelectionResult): DecisionRecord {
  return {
    decisionId: result.decisionId,
    slotId: result.slotId,
    need: result.need,
    chosenId: result.chosen.id,
    chosenKind: result.chosen.kind,
    alternateId: result.alternate?.id ?? null,
    outcome: result.outcome,
    score: result.score,
    reasonCodes: result.reasons,
    rejectionsCount: result.rejected.length,
    recordedAt: new Date().toISOString(),
  };
}
