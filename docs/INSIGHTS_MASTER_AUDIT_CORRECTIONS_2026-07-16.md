# Insights Master Audit Corrections

**Date:** 2026-07-16  
**Purpose:** Correct and complete the claims in `MindModule_Insights_MASTER_Audit_and_Dev_Plan.md` after validating against the current repo state.

## Summary

The master audit is useful, but it is no longer safe to treat as fully definitive.

Three problems were found:

1. Several listed gaps are already fixed in the current codebase.
2. Some items are only partially fixed, but the document presents them as fully open.
3. Important active `/insights` surface area is omitted entirely from the audit scope.

This addendum should be read alongside the master audit until that document is refreshed.

## Already Fixed In Code

These should be removed from the master audit's open-gap list or marked as resolved.

| Master audit item | Current status | Verified location |
|---|---|---|
| GAP 1 — Box3 physiological dims never rendered | Fixed | `src/components/insights/PracticeEffectiveness.tsx` |
| GAP 5 — Recovery lookahead too short | Fixed (`RECOVERY_LOOKAHEAD_DAYS = 7`) | `supabase/functions/cause-effect-engine/index.ts` |
| GAP 7 — `PerformanceRhythmCard` silently disappears on error | Fixed | `src/components/insights/PerformanceRhythmCard.tsx` |
| GAP 8 — null score shows `EARLY READ` | Fixed | `src/components/insights/InnerReadinessDial.tsx` |
| GAP 9 — trend panel collapsed by default | Fixed | `src/components/insights/InnerReadinessDial.tsx` |

## Partially Fixed

These items need the master audit to be rewritten more precisely.

| Area | Current state | Remaining issue |
|---|---|---|
| Burnout Risk reading guidance | Inline historical guidance exists in the card | No evidence yet that the richer modal/banner copy from the master audit has been fully applied |
| Burnout/Stress gating | HRV-specific and intraday-HR-specific gating is implemented client-side | The audit should be updated to reflect this as done, not still open |
| Burnout trajectory banner | Card copy still comes from generic server text | Backend copy remains terse in `cause-effect-engine` |

## Still Open

These remain valid issues.

### 1. Practice Effectiveness stage keys still use misleading day-range names

The master audit is correct that the labels are backed by session-count logic but still use day-range internal keys.

- Frontend still uses `day_1_6 | day_7_29 | day_30_plus`
- Backend still emits the same stage values

**Files:**
- `src/components/insights/PracticeEffectiveness.tsx`
- `supabase/functions/content-feedback/index.ts`

### 2. Smart nudges pattern-alert loop is still effectively disabled

The post-MVP nudge path is still gated behind:

- `const MVP_POST_LAUNCH = false`

And the pattern-alert evaluator still requires verification before the audit can call that loop live.

**File:**
- `supabase/functions/smart-nudges/index.ts`

### 3. Burnout trajectory banner copy is still too generic

The backend still emits:

- `Risk trajectory: escalating`
- `Risk trajectory: improving`
- `Risk trajectory: stable`

This remains weaker than the more explanatory copy proposed in the audit.

**File:**
- `supabase/functions/cause-effect-engine/index.ts`

## Missing From The Master Audit

These areas are active in the current `/insights` implementation but are not covered meaningfully by the master audit.

### 1. Suppressed but still-loaded Tiny Wins pipeline

`Insights.tsx` still fetches and caches Tiny Wins data, but the rendered card is hard-disabled behind `false &&`.

This creates:

- unnecessary fetch/load work
- stale maintenance surface
- mismatch between runtime behavior and documented page scope

**Files:**
- `src/pages/Insights.tsx`
- `supabase/functions/tiny-wins-insights/index.ts`

### 2. Suppressed but still-loaded Semantic Analysis pipeline

`Insights.tsx` still owns `semanticAnalysis`, loading state, error state, cache storage, and helper logic, even though the visible semantic card flow is currently suppressed.

This is a missing audit area because it affects:

- page complexity
- network behavior
- cache behavior
- future re-enable risk

**Files:**
- `src/pages/Insights.tsx`
- `supabase/functions/insights-semantic-analysis/index.ts`

### 3. `/insights` page-level fetch and cache overhead for hidden surfaces

The master audit focuses on detail cards, but the page still hydrates and stores hidden sections.

The audit should explicitly answer:

- which `/insights` fetches are still necessary
- which cached sections belong to visible UI
- which suppressed sections should be deleted vs preserved intentionally

**Primary file:**
- `src/pages/Insights.tsx`

### 4. Scope mismatch between current page and audit framing

The master audit is framed around four detail cards, but the actual page still contains:

- hidden/suppressed cards
- summary-row routing
- non-rendered state for wins and semantic themes
- historical page orchestration concerns

That means the audit is currently more of a detail-card remediation plan than a full `/insights` surface audit.

## Document Hygiene Fixes Needed

These are documentation problems in the master audit itself.

1. The section index says QA is in Section 6, but the QA checklist is actually Section 7.
2. The document claims “definitive single document,” but no revalidation pass was done against the current repo state.
3. Open gaps, resolved gaps, and partially resolved gaps are not separated.

## Recommended Next Pass

The master audit should be refreshed with these sections:

1. `Resolved since audit`
2. `Still open`
3. `Partially fixed / needs revalidation`
4. `Suppressed but still active runtime paths`
5. `Page-level cleanup opportunities`

## Bottom Line

The highest-value correction is not just fixing individual code items. It is updating the audit so it accurately reflects:

- what is already fixed
- what is still missing
- what hidden `/insights` runtime paths are still active

Without that refresh, teams can waste time re-implementing already-shipped fixes while missing the still-loaded hidden surfaces in `Insights.tsx`.
