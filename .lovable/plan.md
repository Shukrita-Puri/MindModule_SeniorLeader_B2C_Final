# Three-card coherence: Brief copy, MRS/pill agreement, Plan slot distinctiveness

Four workstreams. Confirmed from the code before planning; one item (the pill vs MRS tier gap) is explicitly diagnose-first because the cause is not yet proven.

## 1. Brief and Plan speak the same day-state language

The week-ahead hydration helper (`_shared/availability/week-ahead-hydration.ts`) already runs in both `generate-mastery-plan` and `compute-outer-readiness`, so both surfaces now see PTO / public holiday / long-weekend state. What is not shared is the *copy*: the Plan resolves its deterministic floor through `_shared/plan/why-fallback-bank.ts` + `title-prefixes.ts`, while the Brief composes independently.

Work:
- Pass the hydration result into the Brief's evidence bundle as an explicit day-state field (`off_day_kind`: none | pto | public_holiday | last_day_of_long_weekend | rest_day), rather than the Brief re-deriving it.
- Have the deterministic Brief select its frame from that field first, before window/load framing, so a bank-holiday Monday reads as the last day of the long weekend on both cards.
- Reuse the Plan's role vocabulary (Protect / Prevent / Prepare / Build) as the Brief's stance word for the day, so the two cards never disagree about the posture of the day.
- Tests: a UK bank-holiday fixture asserting Brief and Plan resolve the same day-state and stance.

## 2. The Brief said "awaiting" while MRS showed 86

Confirmed from the render logic: with a renderable MRS snapshot the Brief's neutral awaiting branch is off, so what appeared on screen was the **copy-only awaiting** branch — `phrase` fell back to "Today's read." and `bodyText` was empty. That is a copy-generation failure, not missing signals, and the awaiting wording is the wrong thing to print for it.

Work:
- Guarantee copy: when MRS is visible, the Brief snapshot must never be written without body copy — the deterministic fallback becomes the hard floor in `compute-outer-readiness` (throw/retry rather than persist an empty-copy row).
- Change the copy-only branch on the client so it never prints "Awaiting signals — connect your wearable and calendar" when a score exists; it renders the deterministic read instead.
- Add provenance to the existing `[brief-provenance]` log recording why copy was empty, so this is visible next time.

### Pills contradicting the score (diagnose first)

The screenshot shows MRS 86 (green) alongside Mind Mixed / Body Depleted / Reserve Spent (red) with HRV as effectively the only signal. The cause is not yet confirmed: it could be pill tiering firing off absent sleep data as if it were a deficit, or the two surfaces reading different windows. First step is a query of the stored snapshot for that morning to compare the MRS inputs against the pill contributors. Only after that:
- Suppress red tiers for pillars with no score-bearing input (render the existing neutral "unread" state instead of a deficit).
- Add an invariant test: no pill may sit two tiers away from the MRS band on the same snapshot.

## 3. Plan slot titles must differ from each other

Confirmed: on a day with no anchored event, `buildContractTitle` returns the no-anchor ladder, and three Protect slots all resolve to the identical string "Protect your edge".

Work:
- Make the no-anchor ladder window-aware and slot-aware so the three slots read differently (morning / midday / evening variants per role), using the existing `timeOfDay` input which is currently only consulted for a couple of branches.
- Fold the practice's own "how" into the title so each slot states what the block is: title = outcome + the move, e.g. "Protect your edge with a breath reset".
- De-duplicate across the day: if two slots resolve to the same title, the second takes the alternate variant — same approach already used for why-lines.
- Tests: three open-day slots always produce three distinct titles across all roles and windows.

## 4. Remove the framing labels; make the why-line quantified

- Delete the action-frame line ("Consolidate what's working", "Close the day with intention") from both `_shared/plan/action-frame.ts` consumers and `TodayThreePriorities.tsx`.
- Remove the PREPARE / PREVENT / RECOVER pill to the left of the title. Numbering and the slot card structure stay.
- Why-line: require a number when one exists in the evidence bundle. "Resting heart rate has settled back to baseline" becomes "Your RHR is back to your 58bpm baseline." Applies to the LLM contract, the evidence composer and the deterministic bank rows: if the top evidence item carries a value, the line must print it.
- Tests: a why-line contract test asserting a numeric evidence item is always rendered with its value.

## Technical notes

Files touched: `_shared/brief/deterministic-brief.ts`, `_shared/brief/copy-vocabulary.ts`, `compute-outer-readiness/index.ts`, `_shared/plan/copy-contract.ts`, `_shared/plan/why-signals.ts`, `_shared/plan/why-fallback-bank.ts`, `_shared/plan/why-llm.ts`, `_shared/plan/action-frame.ts`, `generate-mastery-plan/index.ts`, `src/components/home/DecisionReadinessBrief.tsx`, `src/components/home/TodayThreePriorities.tsx`. Deploys: `compute-outer-readiness`, `generate-mastery-plan`.

No changes to MRS scoring formulas.
