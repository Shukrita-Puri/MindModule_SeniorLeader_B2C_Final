---
name: Mastery Plan Slot Model v5.1
description: Server-only slot purpose (start_of_day | jit | end_of_day | state-management) with 24h JIT ceiling, morning↔JIT fusion, 3-tier Why composition with hard anti-duplication against the Brief, and CEO-Reality awareness (holiday/PTO/jet-lag/board/veto-risk/decision-leakage/post-peak/personal-friction). No UI changes.
type: feature
---

## Slot model (server-only — never a UI label)
- 3 priority slots are tagged with `slotKind`: `start_of_day` | `jit` | `end_of_day` | `state-management`.
- Order is what the user needs today; a JIT may take the morning slot.
- 24h MVP ceiling: filteredEvents capped to `minutesUntil <= 1440`; if no qualifying JIT, middle slot becomes `state-management`.
- Morning↔JIT fusion: when start_of_day runs and a board-level event sits ≤4h ahead, the same slot's Why weaves both intents (no extra slot, no extra UI).

## Why-line composition (deterministic, no LLM)
Template: `{strategicAnchor}. {tacticalPattern}. {immediateSignal}. → {actionVerb} {forContext}.`
- Strategic: coach growth_area / practicePriorityTag, plus CEO-Reality reframes (board, veto-risk, travel, friction, holiday, PTO).
- Tactical: post-peak hangover, patternInsight streak, hrvCorrelations, declining trend.
- Immediate: wearable (sleep, HRV deviation, RHR), low clarity/confidence, dense calendar.
- Hard anti-duplication: `buildBriefClaimSet()` extracts numbers, named events, and lexicon clusters the brief already named; any clause that overlaps is dropped or replaced. If everything overlaps → bridge mode ("Following your brief: …" + verb).

## Step rationale (practice cards)
- 2–4 word context line per step, derived from ordered `practiceTypes` via STEP_RATIONALE_MAP (e.g. regulate→align = "Ground first." / "Then sharpen.").
- Server returns `stepRationale: string[]` on each HorizonModule; client renders it in the existing context line slot. Falls back to `practice.reasoning` for old cached plans.

## Strategic event scoring (additive boosts)
- +15 if event title/type matches coach `growth_area`.
- +10 if matches onboarding `practicePriorityTag`.
- +10 if event has historical HRV impact >10%.

## CEO-Reality detection (deterministic regex on calendar + thresholds on wearable/check-in)
- public_holiday: `/(public holiday|bank holiday|national holiday)/i`
- personal_pto: `/(ooo|out of office|vacation|annual leave|pto|on leave)/i`
- circadian_travel: `/(flight|airport|red-eye|long haul)/i` in next 48h
- board_outcome: `/(board|investor|vc|earnings|town hall|all-hands|keynote)/i` in next 24h
- veto_risk: HRV-deviation < -10 OR sleep < 65 AND self-reported clarity/confidence ≥ 4
- decision_leakage: (HRV dev < -15 OR self-decl depleted/managing) AND drain event in 24h
- post_peak_hangover: yesterday score ≥75 AND ≥10pt drop today
- personal_friction: Sun pm / Mon am with declining self-decl, no wearable degradation

## UI contract — explicitly unchanged
- No slot-name chips. No brief-reference top line. No new badges for holiday/PTO/jet-lag.
- Visible deltas live entirely inside (1) the Why-this-matters body and (2) the step card context line.

## Stateful evolution preserved
- Plan does not rebuild on every brief; completed slots stay crossed out; incomplete slots keep their practice titles and refresh only the Why-text. Full rebuild only when all 3 are complete (Bonus Round) — handled by existing `mergeWithLedger`.

## Code locations
- `supabase/functions/generate-mastery-plan/index.ts`:
  - `MVP_JIT_HORIZON_MINUTES`, `detectCeoRealities`, `buildBriefClaimSet`, `clauseOverlapsBrief`, `composeWhyLine`, `buildStepRationale`, `applyV51Enrichment`.
  - 24h ceiling + strategic boost on `filteredEvents`.
  - `applyV51Enrichment` runs after `mergeWithLedger`, before persistence.
- `src/components/home/TodayThreePriorities.tsx`: renders `hm.stepRationale[pIdx]` (fallback to `practice.reasoning`).