# When You Perform Best — Part 1 revision: move check-in header above the chart

Scope: layout and structure only, inside `PerformanceRhythmCard.tsx`. No edge function, scoring, selection-logic, or data-source changes.

## What changes

### 1. New section header above the chart
- Insert a full-width header between the card title "When You Perform Best" and the tab pills.
- Header text: `MENTAL PERFORMANCE PATTERNS`
- Sub-label: `Based on check-in data`
- Use the same Sparkles icon + uppercase tracking style already used in the pattern sections.

### 2. Chart stays where it is
- The `Clarity / Emotion / Pressure / Regulation` tab switcher and the `LevelTrendCalendar` chart render directly under the new header.
- The chart's own title (e.g. "Clarity Trend") and legend remain unchanged.

### 3. Collapsible analysis block below the chart
- After the chart/legend, show only a chevron toggle that opens/closes the check-in pattern lines.
- No repeated title or sub-label inside this block — the header is already above the chart.
- Keep the rotating `ChevronDown` + 200 ms transition used elsewhere.
- Default state: expanded.
- The lines shown are the same tab-scoped check-in findings as today.

### 4. Physiology/demand section unchanged
- Keep the divider and the existing `MENTAL PERFORMANCE PATTERNS WHEN YOU PERFORM BEST — Based on physiology and demand data (wearable + calendar)` header below the divider.
- Keep its content exactly as today.

## Chrome
- Remove the old check-in section title from inside the collapsible block so it does not duplicate the new header.
- Keep the existing `h-px` divider between check-in analysis and physiology/demand sections.
- If a section has no lines, it renders nothing (including its header and the divider), as today.

## Technical notes

Single file: `src/components/insights/PerformanceRhythmCard.tsx`.
- Move the check-in header markup out of `PatternAnalysisSection` and place it above the tab switcher.
- Keep `PatternAnalysisSection` responsible for the collapsible analysis list and the physiology/demand section.
- Keep `dedupeFindings`, tab-scoping filter, `buildBaselineLiftLines`, and `PatternLine` untouched.

## Verification

- `tsgo` typecheck plus the existing insights test suite.
- Visual pass on `/insights/performance-rhythm` at mobile width across all four tabs, confirming the header sits above tabs, the chevron-only analysis block sits below the chart, and the physiology section remains below the divider.
