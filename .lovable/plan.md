# Hide MRS Score + Tier on the Brief Card (UI-only)

## Goal
Remove the duplicated MRS score (`51/100`) and tier one-liner from the **Performance Readiness Brief** card on the home screen. The score already lives on the dedicated MRS card. Keep the code in place so it can be resurfaced later if needed. The Brief phrase and body copy should visually start higher in the freed space.

## Scope
- Frontend presentation only — `src/components/home/DecisionReadinessBrief.tsx`.
- No backend, edge-function, scoring, or data-contract changes.
- No logic changes to how the score is computed or fetched.

## Implementation
1. Add a local feature flag near the top of `DecisionReadinessBrief.tsx`:
   ```ts
   const SHOW_BRIEF_SCORE_AND_TIER = false;
   ```
2. Wrap the existing score/tier block (lines ~2541–2589) in `{SHOW_BRIEF_SCORE_AND_TIER && (...)}` so it is hidden by default but remains in source.
3. Adjust the top margin of the phrase/body copy block so it occupies the freed vertical space:
   - When `SHOW_BRIEF_SCORE_AND_TIER` is `false`, reduce the top margin on the phrase and awaiting-copy blocks (e.g. from `mt-4` to `mt-2`) so the copy starts higher under the eyebrow row.
   - When `true`, keep the existing margins unchanged.
4. Add a short inline comment explaining why the block is retained and how to re-enable it.

## Downstream Impact Assessment
Hiding the score is a pure UI change. No downstream client reads the MRS value **from the Brief card itself**:
- **MRS card** (`MrsPage.tsx`) renders from `useMrsSnapshot()` and falls back to `outerBrief?.innerReadinessScore` from the `useOuterReadiness` payload — never from the Brief card DOM.
- **Plan / TodayThreePriorities** sends `mrsReadinessScore` to `generate-mastery-plan`, sourced from the MRS snapshot or `useOuterReadiness`, not from Brief card UI.
- **Insights InnerReadinessDial** reads `innerReadinessScore` directly from `useOuterReadiness`.
- **Inner readiness computation** lives in `compute-inner-readiness` / `mrs-v4-compose.ts` and is unaffected by whether the Brief card displays the number.

Therefore, no clients need to be moved to the MRS card, and inner readiness logic is not impacted.

## Verification
- Run `tsgo` (TypeScript typecheck) to confirm no type errors.
- Run the existing frontend test suite, especially `briefFlickerGuard.test.ts`, to ensure helper exports still work.
- Visually verify in the preview that the Brief card no longer shows the numeric score or tier line, and that the phrase/body copy starts closer to the eyebrow row.

## Out of scope
- No changes to `useOuterReadiness`, `compute-outer-readiness`, MRS v4 scoring, signal pills, or calendar pill logic.
- No changes to the MRS card (`MrsPage.tsx`).
