# Executive Cards: MRS Gate + Awaiting Copy Parity

Three fixes so the Brief, Plan and MRS cards behave as one system when signals are incomplete.

## 1. Brief and Plan wait for MRS

Today the Brief renders its prose from its own snapshot even when the MRS score has not formed (e.g. wearable missing). That is the copy leak.

New rule, applied on the frontend only:

- MRS is "visible" when the MRS snapshot is renderable and carries a numeric score (the same condition the MRS card already uses to show a number).
- If MRS is not visible, the Brief renders the awaiting state (no phrase, no body, no beats) instead of its prose.
- Plan already gates on the MRS snapshot; align its condition to the exact same shared check so the three cards flip together.

This does not change any backend generation, scoring or prompts — only what the cards are allowed to display.

## 2. One awaiting statement across all three cards

All three cards will read the awaiting line from a single shared source with identical input precedence (MRS snapshot first, then the live readiness payload), so they always print the same sentence:

- "Awaiting signals — calendar signal received, sync wearable for a fuller read." (or whichever reason applies)
- never a mix of the reason-aware line on MRS/Plan and the generic line on Brief.

The Brief currently hardcodes the generic constant in two render branches even though it already computes the correct reason-aware string; those branches switch to the shared value.

## 3. Same typography on all three

The MRS card's treatment becomes the standard: a small uppercase "Awaiting signals" label with a muted single-line explanation beneath it, same font family, size and colour token on all three cards. The Brief stops rendering the awaiting line in the serif italic quote style. Plan keeps its layout but adopts the same label and copy classes.

## Technical notes

- Add `src/components/home/AwaitingSignalsNotice.tsx` — one presentational component owning label + copy typography, used by `DecisionReadinessBrief.tsx`, `TodayThreePriorities.tsx`, `MrsPage.tsx`.
- Add a shared hook (e.g. `src/hooks/useAwaitingSignalsCopy.ts`) that resolves the awaiting string once via `getReadinessAwaitingCopy`, taking MRS snapshot renderability into account, so the three cards cannot diverge.
- Add a shared `isMrsVisible(mrsSnapshot)` helper (co-located with `useMrsSnapshot`) used by both Brief and Plan gates.
- In `DecisionReadinessBrief.tsx`: fold the MRS-visibility check into `showNeutralAwaitingCopy`, and replace both `READINESS_AWAITING_MESSAGE` render sites with the shared copy.
- Fix `src/constants/awaitingSignals.ts` fallback string (currently the malformed "AWAITING SIGNALS Connect…") to match `getAwaitingCopy('first_time')`.
- Tests: extend `src/utils/readinessLabels.test.ts` and add a parity test asserting the three cards derive the same string, plus a guard test that the Brief renders no phrase/body when MRS is not visible.

## Out of scope

No edge function, scoring, prompt or migration changes.
