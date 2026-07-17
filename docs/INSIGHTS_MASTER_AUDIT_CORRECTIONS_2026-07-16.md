# Insights Master Audit Corrections

**Date:** 2026-07-16  
**Re-baselined:** 2026-07-17  
**Purpose:** Correct and complete the claims in `MindModule_Insights_MASTER_Audit_and_Dev_Plan.md` after validating against the current repo state.

## Summary

The master audit is useful as historical context, but it is stale and must not be used as an implementation plan against current `HEAD`.

The current codebase has already shipped nearly every Section 4 remediation from the master audit. A developer applying that document verbatim would mostly re-apply existing work, and in a few places would overwrite tighter current code with weaker draft patches.

Use this addendum as the HEAD baseline. The characterization guard is:

- `src/components/insights/__tests__/insightsAuditFixes.test.ts`

That suite asserts the core Insights audit fixes and should stay green for any follow-up work.

## Already Fixed In Code

These should be removed from the master audit's open-gap list or marked as resolved.

| Master audit item | Current status | Verified location |
|---|---|---|
| GAP 1 — Box3 physiological dims never rendered | Fixed | `src/components/insights/PracticeEffectiveness.tsx` |
| GAP 2 — `evaluatePatternAlert` is a permanent stub | Body fixed, still intentionally dormant | `supabase/functions/smart-nudges/index.ts` |
| GAP 3 — Burnout unlock uses generic wearable-day count | Fixed via HRV-day count | `src/components/insights/PerformanceCausalityCard.tsx` |
| GAP 4 — Stress Load unlock uses generic wearable-day count | Fixed via intraday HR sample-day count | `src/components/insights/PerformanceCausalityCard.tsx` |
| GAP 5 — Recovery lookahead too short | Fixed (`RECOVERY_LOOKAHEAD_DAYS = 7`) | `supabase/functions/cause-effect-engine/index.ts` |
| GAP 6 — Burnout Risk lacks historical reading guide | Fixed structurally | `src/components/insights/PerformanceCausalityCard.tsx` |
| GAP 7 — `PerformanceRhythmCard` silently disappears on error | Fixed | `src/components/insights/PerformanceRhythmCard.tsx` |
| GAP 8 — null score shows `EARLY READ` | Fixed | `src/components/insights/InnerReadinessDial.tsx` |
| GAP 9 — trend panel collapsed by default | Fixed | `src/components/insights/InnerReadinessDial.tsx` |
| GAP 10 — Practice Effectiveness stage keys use day-range names | Fixed with cache back-compat | `src/components/insights/PracticeEffectiveness.tsx`, `supabase/functions/content-feedback/index.ts` |
| Change 5 — Burnout trajectory banner copy too terse | Fixed | `supabase/functions/cause-effect-engine/index.ts` |

## Important Corrections To The Master Audit

### Pattern-alert evaluator

The master audit says `evaluatePatternAlert` returns `null` unconditionally. That is false in current `HEAD`.

Current state:

- `MVP_POST_LAUNCH` remains `false`, so all post-MVP evaluators are dormant.
- `evaluatePatternAlert` has a real implementation with event-to-HRV and consecutive-load branches.
- `PATTERN_ALERT_ENABLED` is now a separate sub-flag and remains `false`, so pattern alerts can be staged independently when the global post-MVP bucket is later enabled.

Do not replace the current evaluator with the thinner draft in the master audit.

### Practice Effectiveness stage keys

Current code uses session-based stage keys:

- `early`
- `building`
- `deepening`

The frontend also keeps a `LegacyStage` normalizer for cached payloads that may still contain:

- `day_1_6`
- `day_7_29`
- `day_30_plus`

Do not delete this compatibility shim unless cache migration/expiry has been explicitly handled.

### Wearable gates

The master audit's proposed field name `coverage.hvDays` is wrong and should not be introduced. Current code reads:

- `data.diagnostics.counts.hrvDays`
- `data.diagnostics.counts.hrSamplesDays`

### Inner Readiness expanded state

The current implementation defaults the trend panel open unless session storage is exactly `'0'`. This is cleaner than the master audit's draft, which would collapse on unexpected stored values.

### Burnout copy

The structural fix is shipped: info modal, historical reading guide, and self-explanatory server banner copy exist. Any remaining work here is copy polish only, not a feature gap.

## Still Open

These remain valid, but they are not direct re-application of the master audit's Section 4 patches.

### 1. Smart nudges post-MVP rollout decision

The post-MVP nudge path is still intentionally dormant:

- `MVP_POST_LAUNCH = false`
- `PATTERN_ALERT_ENABLED = false`

Recommended rollout shape:

1. Keep `MVP_POST_LAUNCH` off until all post-MVP evaluators are staging-verified.
2. When the global bucket is ready, turn on one evaluator at a time with sub-flags.
3. For pattern alerts, enable `PATTERN_ALERT_ENABLED` only after copy, suppression, and `/insights/performance-causality` deep-link behavior are verified.

**File:** `supabase/functions/smart-nudges/index.ts`

### 2. Optional Burnout Risk copy polish

Product may still choose to adjust the exact modal/guide wording from the master audit. Treat that as a copy-only PR against `PerformanceCausalityCard.tsx`, not as the missing structural implementation described in the stale plan.

### 3. V3 spec correction

The master audit's Section 6 remains conceptually valid: Practice Effectiveness physiology should be documented as HRV next AM plus RHR next AM, not `hr_samples`-based within-session HR delta.

This repo does not currently contain `INSIGHTS_DRAINS_RESTORES_REDESIGN_SPEC_V3.md`; if that source doc lives outside this repo, update it there. In this repo, the implemented behavior is already visible in:

- `supabase/functions/content-feedback/index.ts`
- `src/components/insights/PracticeEffectiveness.tsx`

## Partially Completed — `/insights` page cleanup

A cleanup pass on `src/pages/Insights.tsx` removed clearly dead code while preserving intentionally dormant or re-enableable surfaces.

**Removed:**

- `mindMapReady` useMemo (calculated but never consumed)
- `tinyWinsBubbleData` useMemo (calculated but never consumed)
- Unused imports (`Loader2`, `Card`, `ProgressiveUnlockMessage`, `LeadershipPatternsCard`, `PerformanceRhythmCard`, `PerformanceCausalityCard`, and unused React hooks)
- Dead tab/tier state (`INSIGHT_TABS`, `activeTab`/`setActiveTab`, `InsightsTier`) and the `setActiveTab('patterns')` side effect
- Unattached `highlightRef`

**Intentionally preserved:**

- Semantic Analysis dormant state, helper functions, and types — retained by design for future re-enable and clearly commented.
- Tiny Wins and State Patterns pipelines — they feed rendered JSX or named-flag re-enable blocks.
- Named-flag re-enable blocks for `DailyShowUpCalendar`, `LuxuryInsightCard`, and related summary-row routing — kept as explicit opt-in scaffolding for product to re-enable.

**Flag cleanup:**

The former magic `{false && ...}` guards are now named local constants at the top of `src/pages/Insights.tsx`. Each defaults to `false` and is documented with an owner/reason comment:

- `SHOW_DAILY_SHOW_UP_CALENDAR` — gates the `DailyShowUpCalendar` card. Suppressed while streaks live on the homepage.
- `SHOW_TRAJECTORY_SUMMARY_ROW` — gates the trajectory summary row. Derivation is live but redundant with dial deep-links.
- `SHOW_MOMENTUM_LUXURY_CARD` — gates the "Your Momentum" `LuxuryInsightCard`. Suppressed pending a product copy-rewrite.

All three remain `false` pending a product decision. They have active data pipelines, so deletion is premature, but re-enabling requires explicit sign-off on copy, placement, and feature-flag ownership.

**Status:** Partially complete. The remaining cleanup is a product decision about which suppressed blocks to delete, product-copy-rewrite, or feature-flag properly at the app/config level—not a mechanical dead-code removal.

## Missing From The Master Audit

These areas are active in the current `/insights` implementation but are not covered meaningfully by the master audit.

### 1. Suppressed but still-loaded Tiny Wins pipeline

`Insights.tsx` still fetches and caches Tiny Wins data, but the rendered card is hard-disabled behind `false &&`.

This creates:

- unnecessary fetch/load work
- stale maintenance surface
- mismatch between runtime behavior and documented page scope

**Partial cleanup note:** Dead-only memos and unused imports have been removed. The active fetch/cache path remains because it feeds an explicit `{false && ...}` re-enable block.

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

**Partial cleanup note:** The dormant state, functions, and types are intentionally preserved with in-file comments that document their future re-enable purpose. They were not removed in the latest cleanup pass.

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
4. Change 6 contains the field typo `hvDays`; the current code uses `hrvDays`.
5. Change 2 would overwrite a richer shipped pattern-alert evaluator with a thinner draft.

## Recommended Next Pass

The master audit should be refreshed with these sections:

1. `Resolved since audit`
2. `Still open`
3. `Partially fixed / needs revalidation`
4. `Suppressed but still active runtime paths`
5. `Page-level cleanup opportunities` — including a decision to delete, product-copy-rewrite, or feature-flag properly at the app/config level the remaining named constants in `src/pages/Insights.tsx` (`SHOW_DAILY_SHOW_UP_CALENDAR`, `SHOW_TRAJECTORY_SUMMARY_ROW`, `SHOW_MOMENTUM_LUXURY_CARD`)
6. `Rollout decisions / feature flags`

## Bottom Line

Do not implement the old master audit as written.

The highest-value correction is keeping the audit aligned with current code so it accurately reflects:

- what is already fixed
- what is still missing
- what hidden `/insights` runtime paths are still active
- what rollout switches are product decisions, not mechanical code fixes

Without that refresh, teams can waste time re-implementing already-shipped fixes while missing the still-loaded hidden surfaces in `Insights.tsx`.
