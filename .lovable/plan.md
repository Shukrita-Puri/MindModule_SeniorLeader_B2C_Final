# "When You Perform Best" — wrap Section A and Section B in separate sub-cards

Scope: UI-only layout change inside `PerformanceRhythmCard.tsx`. No changes to content, ranking, sentence assembly, guards, caps, data fetching, or edge functions.

## What changes

Wrap the existing Section A and Section B elements each in their own subtle sub-card, while keeping everything else on the card exactly as it is today.

### Section A sub-card

Contains the existing Section A elements verbatim:
- "A. Mental Performance Patterns / Based on check-in data" header.
- Collapsible `ChevronDown` toggle and its existing open/close behaviour.
- The pattern bullet list, early-pattern note, or empty-state copy.
- The `SegmentedToggle` tabs (Clarity / Emotion / Pressure / Regulation).
- The active `LevelTrendCalendar` chart.

Wrap these elements in a single container with the project's card surface tokens (`--surface-card-v2`, `--border-strong`, `--elev-1`, `rounded-xl`, `p-3.5` or the equivalent `.card-standard` utility). No visual restyling of the child elements.

### Section B sub-card

Contains the existing Section B elements verbatim:
- "B. Mental Performance Patterns / Based on physiology and demand data" header.
- Existing `InsightInfoModal` tooltip.
- The global baseline pattern bullet list or empty-state copy.

Wrap these in an identical sub-card container. No changes to the header, bullets, or info modal.

### Between the sub-cards

- Keep a clear vertical gap (`space-y-4`) between the two sub-cards. The current `h-px` divider lives inside `PatternAnalysisSection`; it will be removed because the two boxes now provide the separation.

### What stays exactly the same

- All text, labels, icons, bullets, toggle behaviour, tab switcher, chart, progressive messages, unlock incentives, and debug panel remain unchanged.
- Section A stays scoped to the active tab; Section B stays global and non-collapsible.
- The outer `LuxuryInsightCard` remains the single capture boundary for sharing.
- No logic in `patternSentences.ts` is touched.

## Files touched

- `src/components/insights/PerformanceRhythmCard.tsx` only.

## Verification

- `tsgo` typecheck.
- Existing insights test suite passes.
- Playwright screenshots of `/insights/performance-rhythm` on a mobile viewport (primary iOS frame) and desktop, one per tab, confirming:
  - Section A and Section B each sit in their own sub-card.
  - All existing child elements (header, toggle, tabs, chart, bullets, info icon) look unchanged apart from the wrapper.
  - Section A still collapses/expands; Section B does not.
  - Share capture still exports the whole card as one image.

