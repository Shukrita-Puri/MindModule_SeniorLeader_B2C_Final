# Three-card coherence: Brief copy, long-weekend language, Plan slot distinctiveness

## 1. Long-weekend / holiday language only (no slot changes)

The hydration helper (`_shared/availability/week-ahead-hydration.ts`) already runs in both `generate-mastery-plan` and `compute-outer-readiness`, so both know PTO / public-holiday / long-weekend state. This item is language only.

- Pass the hydration verdict into the Brief as an explicit day-state field (`none | pto | public_holiday | last_day_of_long_weekend | last_day_of_weekend | rest_day`) instead of re-deriving it.
- The same language covers the last day of a *regular* weekend: Sunday for most countries, Saturday for the Gulf states and Israel, using the existing `planningDayOfWeek` / `weekendDays` locale logic (no new locale rules).
- On that last day — long weekend, holiday, PTO closing into a workday, or a normal weekend — the Brief names it and states the aim: it is the last day, today's job is to hold recovery and set up the week, and the week ahead is what's next. Same wording family the Plan uses when it flips to Week Ahead, so the handoff reads seamless.
- Both paths know it: the LLM prompt gets the day-state as a hard fact with the required frame, and the deterministic brief has the matching frame as its floor.
- Plan behaviour on that day is unchanged beyond already showing Week Ahead — the three slots are not touched here.

## 2. Brief body copy must exist whenever MRS is visible

Confirmed from the render logic: with a renderable MRS snapshot the neutral awaiting branch is off, so the screenshot was the **copy-only awaiting** branch — `phrase` fell back to "Today's read." and `bodyText` was empty. Signals existed (morning uses the prior day's data); the awaiting-wearable-and-calendar wording was simply wrong.

Scope is strictly this. Awaiting behaviour when data genuinely is missing stays exactly as it is on all three cards.

- In `compute-outer-readiness`: one LLM attempt, then fall straight through to the deterministic brief rather than retrying into an empty result. A brief row is never persisted with empty copy when a score exists — the deterministic output is the hard floor.
- On the client: when a score is visible, the copy-only branch renders the read — LLM on first try, deterministic if that fails — and never renders empty, and never the "connect your wearable and calendar" line while signals are present (signal pills have data and MRS has a score).
- Record the fallback reason in the existing `[brief-provenance]` log.

## 3. Plan slot titles: real differentiation, not a time-of-day suffix

Confirmed: with no anchored event, `buildContractTitle` returns the no-anchor ladder and all three Protect slots resolve to the identical "Protect your edge".

- Each slot gets a distinct intent, not the same title with a different time word. Morning sets the edge, midday holds it through the dip, evening closes and banks it — e.g. "Protect your edge this morning" / "Sustain steadiness ahead of the afternoon dip" / "Close the day so tomorrow starts clean".
- The good action-frame lines feed this: the frame vocabulary in `action-frame.ts` becomes title material rather than a separate line.
- Hard rule: no two slots in a day may share a title; a collision forces the alternate variant, the same mechanism already used for why-lines.
- Tests: three open-day slots always produce three distinct, non-suffix-differentiated titles across roles and windows.

## 4. Action-frame line folded in; why-lines must name the fact

- Remove the standalone italic action-frame line from the slot card (`TodayThreePriorities.tsx`). The copy is not deleted — it moves into the title (item 3) or into the why-line where it adds reason.
- Why-lines must name the evidence, in both the LLM contract and the deterministic path:
  - Numeric evidence prints its number: "Resting heart rate has settled back to baseline" → "Your RHR is back to your 58bpm baseline."
  - Strategic evidence names the source fact: "You identified <goal> as a growth goal" — sourced today from onboarding v8 (`protection_goals` / growth intention), with the composer written so coach, roleplay and end-of-day / reframe notes can feed the same slot later.
  - Tactical and behavioural evidence follow the same name-the-fact rule. Which of the four signal types a line uses, and the existing relevance ranking that picks it, are unchanged.
- Applies to `why-llm.ts` (contract + validator), the evidence composer in `why-signals.ts`, and the rows in `why-fallback-bank.ts`.
- Tests: when the top evidence item carries a value or a named fact, the rendered line contains it.

## Technical notes

Files: `_shared/brief/deterministic-brief.ts`, `_shared/brief/copy-vocabulary.ts`, `compute-outer-readiness/index.ts`, `_shared/plan/copy-contract.ts`, `_shared/plan/action-frame.ts`, `_shared/plan/why-signals.ts`, `_shared/plan/why-llm.ts`, `_shared/plan/why-fallback-bank.ts`, `generate-mastery-plan/index.ts`, `src/components/home/DecisionReadinessBrief.tsx`, `src/components/home/TodayThreePriorities.tsx`. Deploys: `compute-outer-readiness`, `generate-mastery-plan`.

Launch-safety: two days from launch, so the blast radius is exactly the four items above. No changes to MRS scoring, pill tiering, evidence ranking, practice selection, awaiting behaviour when signals are genuinely absent, or any other surface or feature.
