## Goal

In the expanded glass-box card for **Decision Readiness**, **Physical Reserves**, and **Resilience Capacity** pills, stop showing **Qualifiers** as a separate section. Instead, render each qualifier (a.k.a. "pattern") inline next to its matching **Contributor**, styled grey, italic, in brackets. Also bump the Contributor font size to iOS-native body sizing.

Display-only change. No backend, no scoring, no server payload changes. MRS v3 contract is preserved.

## Scope

Single file: `src/components/home/PillTooltip.tsx` (the `PillDetailContent` component used by the three pillar pills in `DecisionReadinessBrief.tsx`).

Out of scope: server payload, signal pill order, tier logic, the front-of-pill qualifier already appended by `DecisionReadinessBrief.tsx` (Signal Pills v3 bracketed enrichment) — that stays untouched.

## Changes

1. **Merge Qualifiers into Contributors**
   - Remove the dedicated "Qualifiers" block (lines 93–107).
   - Keep one section labelled **Contributors**.

2. **Inline pattern per contributor**
   - For each `[k, v]` in flattened contributors, look up a matching entry in `qualifiers` using:
     - exact key match (`qualifiers[k]`), then
     - case-insensitive substring match between contributor key and qualifier dim (e.g. contributor `sleep_hours` ↔ qualifier dim `sleep`).
   - If matched, render `(<qualifier summary>)` immediately after the value, styled `text-muted-foreground/70 italic font-body`.
   - Any qualifier dim that does not map to a contributor is appended as its own row at the bottom of the Contributors list, with the dim name as the label and the summary as the bracketed italic pattern — so no pattern data is lost.

3. **iOS-native font sizing**
   - Contributor rows: `text-[15px]` (≈ iOS body 15pt, comfortable on a 320–390 dp screen, matches Apple HIG body minimum for dense lists).
   - Contributor key label: same size, `text-muted-foreground`.
   - Bracketed qualifier: `text-[13px]` (iOS footnote), grey italic, in `()`. Slightly smaller to keep visual hierarchy while still meeting HIG legibility.
   - Section header "Contributors" bumped from `text-[10px]` to `text-[11px]` uppercase to stay proportionate.
   - Switch the contributors list off `grid-cols-2` to a single-column stack (`space-y-1`) so the inline pattern can sit on the same line without truncation, and `truncate` is dropped.

4. **Spacing**
   - Bump row gap (`gap-y-0.5` → `gap-y-1`) and section top padding (`pt-2` → `pt-3`) to keep the larger type breathing.

## Example rendered row

```text
Sleep: 6h 12m  (below your 7d median · unusual for you)
HRV: 48ms     (1st day low · below baseline)
RHR: 62bpm    (above 30d median)
```

The text outside the parentheses is the Contributor (key + value, foreground colour, 15px). The text in parentheses is the pattern (grey, italic, 13px).

## Technical notes

- `flattenContributors` and `flattenQualifiers` keep their existing shapes; only the render and matching logic change.
- The bracketed qualifier already shown on the front of the pill (set in `DecisionReadinessBrief.tsx` around lines 1142–1199) is unrelated to this card body and remains as-is.
- No new dependencies. No design-token changes; colours come from existing semantic tokens (`muted-foreground`, `foreground`).

## QA

- Open Home → tap each of Decision Readiness, Physical Reserves, Resilience Capacity → confirm:
  - No separate "Qualifiers" header.
  - Each contributor that has a matching pattern shows it inline as grey italic in brackets.
  - Orphan qualifier dims (if any) appear as their own rows at the bottom, still bracketed.
  - Contributor text reads comfortably on iPhone SE / 14 / 15 Pro Max viewports.
- Run TypeScript build — no signature changes, should pass.
