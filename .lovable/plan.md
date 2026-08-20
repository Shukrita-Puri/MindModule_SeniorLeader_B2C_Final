# When You Perform Best — Part 1: split the pattern section in two

Scope: layout and structure only, inside `PerformanceRhythmCard.tsx`. No edge function, scoring, selection-logic, or data-source changes. Finding selection, ranking and sentence text stay exactly as they are today (that is Part 2).

## What changes

Today there is one boxed "PERFORMANCE PATTERNS" block with two small sub-labels inside it. It becomes two separate, visually distinct sections.

### Section 1 — CHECK-IN PATTERNS
- Sits directly below the pill chart (Clarity / Emotion / Pressure / Regulation tabs and the trend grid).
- Stays scoped to the active tab's dimension, as it is now.
- Label: `CHECK-IN PATTERNS`
- Sub-label, small and muted: `Based on your self-reported check-ins`
- Collapsible: a chevron toggle on the header row using the same chevron pattern used elsewhere in the app (rotating `ChevronDown`, 200ms transition). Default state: expanded.

[thin full-width divider — same weight as existing card dividers]

### Section 2 — MENTAL PERFORMANCE PATTERNS WHEN YOU PERFORM BEST
- Sits below the divider.
- Not tab-scoped; always renders regardless of the active tab.
- Label: `MENTAL PERFORMANCE PATTERNS WHEN YOU PERFORM BEST`
- Sub-label, small and muted: `Based on physiology & demand (wearable + calendar)`
- Not collapsible (always open).
- Content is exactly today's "Baseline patterns": wearable findings plus the sharpest-window, calendar and category-lift lines.

### Chrome
- Drop the single gradient/bordered wrapper box and the shared `Sparkles` + "Performance Patterns" header; each section gets its own label block.
- One lightweight `h-px` divider between the sections, matching existing card dividers.
- No new cards, modals, or accordion primitives beyond the chevron toggle.
- If a section has no lines, it renders nothing (including its label and the divider), as today.

## Technical notes

Single file: `src/components/insights/PerformanceRhythmCard.tsx` — restructure `PatternAnalysisSection` (lines ~290–368) into the two labelled sections, add local `useState` for the check-in collapse, keep `dedupeFindings`, `buildBaselineLiftLines`, `PatternLine`, and the tab-scoping filter untouched.

## Verification

`tsgo` typecheck plus the existing insights test suite; visual pass on `/insights/performance-rhythm` at mobile width across all four tabs.

## Not in this pass

Ranking changes, sentence templates, empty-state copy, dimension polarity, soft caps and the reliability audit — those are Part 2, after you sign off on this layout.
