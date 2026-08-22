# "When You Perform Best" — visually separate Section A and Section B

Scope: UI-only presentation change inside `PerformanceRhythmCard.tsx`. No changes to ranking, sentence assembly, guards, caps, data fetching, or edge functions.

## Problem

The tab switcher (Clarity / Emotion / Pressure / Regulation) changes the chart and Section A (check-in patterns), but Section B (physiology + demand patterns) is intentionally global. Because both sections currently sit in one continuous text block, users expect Section B to change when they toggle tabs.

## Proposed solution

Wrap each section in its own subtle sub-card within the existing `LuxuryInsightCard`. This keeps the whole surface as one shareable card while making the two sections visually self-contained.

### Section A sub-card — check-in patterns

- Container: `rounded-xl bg-[--surface-card-v2] border border-[--border-strong] shadow-[--elev-1] p-3.5` (or the equivalent `.card-standard` utility if available).
- Header row inside the sub-card:
  - Left: `A.` marker + "Mental Performance Patterns" + "Based on check-in data".
  - Right: collapsible `ChevronDown` toggle (existing behaviour, existing 200ms rotation).
- Body: the existing `checkInOpen` block — early-pattern note (when every line is emerging), bullet list, or empty-state copy.

### Section B sub-card — physiology and demand patterns

- Container: identical sub-card styling as Section A.
- Header row:
  - Left: `B.` marker + "Mental Performance Patterns" + "Based on physiology and demand data".
  - Right: existing `InsightInfoModal` tooltip.
- Body: the existing global baseline findings + ranked lift lines, or empty-state copy.
- Not collapsible.

### Between the sub-cards

- Replace the current `h-px` divider with plain vertical spacing (`space-y-4` or `gap-4`). The two boxes already create separation; an extra line is redundant.

### What stays exactly the same

- The outer `LuxuryInsightCard` remains the single capture boundary for sharing.
- Tab switcher, chart, progressive messages, unlock incentives, and debug panel stay untouched outside the sub-cards.
- Section A stays scoped to the active tab; Section B stays global.
- Existing logic in `patternSentences.ts` (`buildSection`, `buildLiftLines`, caps, guards, affinity weights) is not modified.

## Files touched

- `src/components/insights/PerformanceRhythmCard.tsx` only.

## Verification

- `tsgo` typecheck.
- Existing insights test suite passes.
- Playwright screenshots of `/insights/performance-rhythm` on desktop and mobile viewports, one per tab, confirming:
  - Two clearly separated sub-cards.
  - Section A collapses/expands; Section B does not.
  - Share capture still exports the whole card as one image.
