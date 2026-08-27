# Executive Cards: Restore MRS Gate + Awaiting Copy Parity

Gating and presentation only. No changes to MRS formulas, scoring, brief/plan generation, prompts, edge functions or the database.

## 1. Restore the existing gate: Brief and Plan wait for MRS

The gating requirement already exists — the Brief has drifted from it and renders its prose off its own snapshot even when the MRS score has not formed (wearable missing). That is the copy leak.

Re-enforce the existing contract on the frontend:

- Treat MRS as visible only when the MRS snapshot is renderable with a numeric score (the same condition the MRS card already uses to show its number).
- If MRS is not visible, the Brief shows the awaiting state instead of phrase/body/beats.
- Plan already gates on the MRS snapshot; point it at the identical shared check so the three cards flip together rather than each holding its own variant of the condition.

## 2. One awaiting statement across all three cards

All three cards read the awaiting line from a single shared source with identical input precedence (MRS snapshot first, then live readiness payload), so they always print the same sentence — for example "Awaiting signals — calendar signal received, sync wearable for a fuller read."

The Brief already computes the correct reason-aware string but hardcodes the generic constant in two render branches; those branches switch to the shared value.

## 3. Same typography on all three

The MRS card's treatment becomes the standard: small uppercase "Awaiting signals" label plus a muted one-line explanation, same font family, size and colour token everywhere. The Brief stops rendering the awaiting line in the serif italic quote style; Plan keeps its layout but adopts the same label and copy classes.

## Technical notes

- Add `src/components/home/AwaitingSignalsNotice.tsx` — one presentational component owning label + copy typography, used by `DecisionReadinessBrief.tsx`, `TodayThreePriorities.tsx`, `MrsPage.tsx`.
- Add a shared hook (e.g. `src/hooks/useAwaitingSignalsCopy.ts`) resolving the awaiting string once via the existing `getReadinessAwaitingCopy`, MRS-snapshot-aware, so the cards cannot diverge.
- Add a shared `isMrsVisible(mrsSnapshot)` helper co-located with `useMrsSnapshot`, consumed by both the Brief and Plan gates.
- In `DecisionReadinessBrief.tsx`: fold MRS visibility into `showNeutralAwaitingCopy`, and replace both `READINESS_AWAITING_MESSAGE` render sites with the shared copy.
- Fix the malformed fallback string in `src/constants/awaitingSignals.ts` ("AWAITING SIGNALS Connect…") so it matches `getAwaitingCopy('first_time')`.
- Tests: parity test asserting the three surfaces derive the same string, and a guard test that the Brief renders no phrase/body when MRS is not visible.

## Out of scope

No edge function, scoring, prompt, copy-generation or migration changes.
