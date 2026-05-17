---
name: CEO behaviour shared-module ownership
description: _shared/ceo-behaviour-rules.ts, behaviour-evaluator.ts, brief-signal-coverage.ts, copy-vocabulary.ts, brief-validators.ts, brief-context.ts are engineering-owned. Trigger logic and thresholds change via code review, not chat sessions.
type: constraint
---
The following files are the single source of truth for CEO Self-Regulation logic (§2.11–§2.17), the §3 Signal Coverage Matrix, the Elastic Lexicon (§2.20), and brief validators (§5):

- `supabase/functions/_shared/brief-context.ts` — typed API contract (BriefContext, BehaviourFlag, SignalMatrix, SlotBoost, RuleContext)
- `supabase/functions/_shared/ceo-behaviour-rules.ts` — one pure function per §2.11–§2.17 rule
- `supabase/functions/_shared/behaviour-evaluator.ts` — orchestrator (`evaluate(ctx)`, `deriveSlotBoosts`, `flagForAnchor`)
- `supabase/functions/_shared/brief-signal-coverage.ts` — §3 matrix builder
- `supabase/functions/_shared/copy-vocabulary.ts` — Elastic Lexicon, forbidden words, pattern triggers, V8 CTA verbs
- `supabase/functions/_shared/brief-validators.ts` — §5.1 / §5.2 validators
- `supabase/functions/_shared/event-protocol-taxonomy.ts` — §2 protocol combos + §3 event matrix + `classifyEvent` / `protocolsForEvent` / `PRACTICE_TYPE_TO_COMBO`

**Rule:** Trigger logic, severity thresholds, lexicon clusters, and forbidden-word lists in these files do NOT change in a chat-driven session without an explicit human request. They have ownership banners at the top of each file. Add new rules / lexicon entries via a normal code-review PR, not by asking the chat agent to "tune" them.

**Why:** Three surfaces (brief, smart-nudges, generate-mastery-plan) consume these modules. A chat-driven tweak to a threshold silently changes copy across all three surfaces in ways the user does not see in the diff preview. For a C-suite product whose value prop is "we see you whole", that silent drift destroys trust faster than a visible bug.

**How to apply:** When the user asks for a copy or trigger change that touches §2.11–§2.17 / §2.20 / §5: confirm the change in chat, then edit the file with the change explicitly named in the response. Never refactor or "clean up" these files as a side-effect of unrelated work.

## Two-file taxonomy split

- `executive-state-taxonomy.ts` owns **pillar / stakes / keyword** vocabulary. Cadence: product / copy decisions.
- `event-protocol-taxonomy.ts` owns **§2 combos + §3 event matrix + classifyEvent**. Cadence: coaching / clinical decisions.
- Different change pressure → different files. Consumers never import from either taxonomy file directly for behaviour decisions; they call `behaviour-evaluator.evaluate(ctx, { scope })`.

## `PRACTICE_TYPE_TO_COMBO` is the single source of truth

The legacy `SlotBoost.practiceType` → `(protocol, mode)` mapping lives **only** in `event-protocol-taxonomy.ts`. In Phase 2, `generate-mastery-plan` must import this constant and stop using string literals. Do not duplicate the mapping in plan-side code. If a second copy appears in review, reject the PR.

## Phase 2 classification-path audit (write down now, execute later)

Before wiring `compute-outer-readiness`, `smart-nudges`, and `generate-mastery-plan` to `event-protocol-taxonomy`, grep consumer edge functions for direct imports of `executive-state-taxonomy.ts`. Any consumer using stakes / keyword lookups to make event-classification decisions that `classifyEvent()` now handles must migrate to the new function. Do not leave two classification paths running in parallel — that's how silent drift starts.

## Scoped rules

Every entry in `ALL_RULES` declares `scopes: RuleScope[]` (`"brief"` | `"nudge"` | `"plan"`). Consumers call `evaluate(ctx, { scope })` and get back only the rules tagged for their surface. Add new behaviours by tagging existing files, not by creating new rule files per surface (`notificationIsProduct` is nudge-only by tag, not by location).

## Stub-rule pattern

`personalFrictionInference` and `conferenceDepletion` return `null` today. They reserve the `BehaviourFlag` API surface so Phase 2 wiring is reviewed once. When the underlying data lands (≥3 weeks per-user history; `conference_day_number` field), only `brief-signal-coverage.ts` changes to populate the field — the rules, flag shapes, and downstream consumers remain identical.

## MIGRATE-FROM-EDGE inventory (Phase 2 deletion targets)

Once `SHARED_MODULES_ENABLED` is flipped and consumers route through `evaluate({ scope })`, the following duplicate detector blocks become deletion targets. **Do not delete in the same PR as wiring** — flip the flag, observe one week of brief/nudge/plan output parity, then delete.

### `supabase/functions/generate-mastery-plan/index.ts`

- **Lines ~3195–3370** — `detectCeoRealities(req, shared)` + `strategicAnchorClause` + `tacticalClause` + `immediateClause`. Returns `CeoRealityTag[]` (`veto_risk`, `circadian_travel`, `decision_leakage`, `post_peak_hangover`, `personal_friction`, `board_outcome`, `public_holiday`, `personal_pto`).
- **Replacement:** `evaluate(ctx, { scope: "plan" }).filter(...)` — every tag has a 1:1 shared rule, except:
  - `decision_leakage` legacy fires on `within24h.some(DRAIN_RX)` gated on drained mood OR `hrvDeviation < -15`. Shared `decisionLeakageGuard` fires on `signals.emotionalDrainEventInNext4h` — **narrower window, no mood gate**. Migration must add the legacy 24h+mood gate to brief-signal-coverage *before* deletion, or the plan loses recall.
  - `personal_friction` legacy uses Sun-pm / Mon-am + drained + no wearable deficit; shared `personalFrictionInference` returns `null` (stub). Migration must implement detector first.
  - `circadian_travel` legacy fires from `TRAVEL_RX` match in ±48h window; shared travel cluster (`travelPreFlightMandatory`, `travelLandingOffload`, `longHaulRecovery`, `postTripReentry`) is finer-grained. Map legacy → union of new rules; copy must be re-validated.

### `supabase/functions/smart-nudges/index.ts`

- **Lines ~940–1041** — `dayContext` builder: `preFlight` / `inFlight` / `postTravel` / `ptoMode` + `buildDayShapeLine`.
- **Replacement:** read `evaluate(ctx, { scope: "nudge" })` for flags `travelPreFlightMandatory`, `travelLandingOffload`, `travelLandingPlusHighStakes`, `longHaulRecovery`, `postTripReentry`, `holidayReducedTouch`, `ptoWithMeetingFallback`. `buildDayShapeLine` becomes a thin formatter over `flag.copyHint`.
- **Conflict to resolve:** legacy `preFlight` window is 60-240min; shared `travelPreFlightMandatory` fires on `signals.travelDay`. Migration must populate `preFlight` window into a SignalMatrix field (`preFlightWindowMinutes`) before deletion, or nudge timing shifts.

### Conflicting copy contracts (raise before flipping flag)

1. **Day-shape line vs cluster pill.** Brief currently surfaces cluster pills (`Weekend · restoring`); plan/smart-nudges use `buildDayShapeLine` prose. Both can co-exist while flag is off, but Phase 2 must pick one source for the prose. Recommend `flag.copyHint` as canon and have surfaces format it.
2. **`decisionDensity` is NEW.** No legacy equivalent — safe to ship with flag ON for brief/nudge, OFF for plan (plan already has slot-pressure heuristics that may double-count).
3. **Stubs (`stackedStakes`, `crisisInjection`, `contextSwitchingCost`, `preEventSleepTarget`, `timeSinceLastRecovery`, `interpersonalMeetingContext`, `emptySlotProtection`, `upwardReporting`) return null.** No code paths exist in edge functions for these — they are net-new API surface. Wire safe.

### Phase 2 gating flag

`SHARED_MODULES_ENABLED` (env or const, TBD at wiring time). When `false`: shared modules are still imported and tested but consumers ignore their output and use legacy detectors. When `true`: consumers consume `evaluate({ scope })` output and legacy detectors run in shadow for one week of parity logging, then are deleted in a follow-up PR.