## Goal

Replace the multiple awaiting-state strings on MRS, Brief, and Plan cards with one canonical sentence, rendered exactly once per card, in each card's existing eyebrow/quote text style. No logic changes, no other UI changes.

## Canonical copy

```
Awaiting signals — sync your wearable, calendar to get an early read and check in to sharpen it.
```

The leading "Awaiting signals" stays as the eyebrow/label style each card already uses; the rest is the descriptive line. Update the shared constant so all three cards stay in lock-step.

## Files & exact edits

### 1. `src/constants/awaitingSignals.ts`
Replace `READINESS_AWAITING_MESSAGE` value with:
`"Sync your wearable, calendar to get an early read and check in to sharpen it."`
(The "Awaiting signals" prefix is rendered separately by each card as its eyebrow/title.)

### 2. `src/utils/readinessLabels.ts` (drives the eyebrow line beneath the MRS gauge and beside the Brief score)
For both `awaiting` and `refined-without-wearable` branches, change `subtitle` from `"sync your wearable and check in"` to `"sync your wearable, calendar to get an early read and check in to sharpen it"`. Label stays `"Awaiting signals"`.

### 3. `src/components/home/mrs/MrsPage.tsx` (MRS page)
Delete the `<p>{READINESS_AWAITING_MESSAGE}</p>` paragraph (lines ~94-99) in the `!hasScore` block. The eyebrow line (`stateLabel.label` + `stateLabel.subtitle`) now carries the full message via change #2.

### 4. `src/components/home/DecisionReadinessBrief.tsx` (Brief card)
- Line 2013: change `--` to a single `—` (or single `-`) — remove the doubled dashes so only one dash shows next to the score.
- Line 2014: delete the inline `AWAITING SIGNALS · sync your wearable and check in` span (the eyebrow next to the score is already rendered by the `stateLabel` block above for the normal path; for the awaiting fallback the message is shown once via the block below).
- Lines 2043-2052: in the `showNeutralAwaitingCopy` block, remove the "We do not have enough fresh signals yet for today's readiness read." `<p>` and keep one paragraph rendering `Awaiting signals — {READINESS_AWAITING_MESSAGE}` in the existing quote style.

### 5. `src/components/home/TodayThreePriorities.tsx` (Plan card)
Lines 1224-1230: keep the button + chevron structure, keep "Awaiting today's signal" replaced with `"Awaiting signals"` as the quote title, and the body span renders `READINESS_AWAITING_MESSAGE` (updated via change #1). Net effect on screen: "Awaiting signals" + one descriptive line.

## Out of scope
- No changes to gating logic, hooks, edge functions, MRS scoring, brief generation, pill rendering, calendar pills, weekly delta dial, sidebar, or any other component.
- `DailyRitual.tsx` line 602 ("Awaiting today's signal") is a separate code path not shown in the screenshots; leave untouched unless the user flags it.

## Verification
Reload `/executive-home` in the awaiting state and confirm:
- MRS card: gauge → single eyebrow line "AWAITING SIGNALS · sync your wearable, calendar to get an early read and check in to sharpen it"; no second paragraph below.
- Brief card: single dash next to score, no inline AWAITING SIGNALS subtitle next to it; body shows one paragraph "Awaiting signals — sync your wearable, calendar…".
- Plan card: "Awaiting signals" + one descriptive line, chevron preserved.
