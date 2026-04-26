---
name: Performance Causality (Cause & Effect card)
description: Single Insights card unifying Cause→Effect across calendar, wearables, check-ins, and PRS into 4 chevron lenses with strict CEO-grade gating.
type: feature
---

## What it is
The "Cause & Effect" card on the Insights page (`PerformanceCausalityCard`). One card. Top finding always visible. 4 chevron-revealed lenses underneath, each rendered as visual delta-bar rows — never paragraphs.

## CEO contract (locked rules)
Every rendered finding MUST contain:
1. **Cause** — a leader-controllable input (event type, sleep tier, consecutive-load streak).
2. **Effect** — a quantified Δ on a measured signal (HRV, RHR, clarity, sharpness, confidence, PRS) vs the user's own 30-day baseline.
3. **Magnitude** — % delta + sample size `n`.
4. **Recovery window** — days for the signal to return to ±5% of baseline (when computable).
5. **Confidence gate** — `n ≥ 3` AND `|Δ| ≥ 10%` (numeric signals) OR `|Δ| ≥ 0.5 tier` (1-5 scales).

Anything below these gates is **dropped, not softened**. No correlation-only fluff. Coach signals are deliberately excluded (`mem://features/coach/suppression-standard`).

## 4 lenses
- **A — Events That Cost You Physiologically** · `calendar_events` × `wearable_data.hrv|resting_heart_rate`. Surfaces only harmful direction (HRV ↓ / RHR ↑).
- **B — Events That Cost You Cognitively** · `calendar_events` × `daily_checkins.clarity_level|mental_sharpness_level|confidence_level`. Picks the most-impacted dimension per event-type; surfaces only declines.
- **C — Sleep → Decision Quality** · `wearable_data.sleep_score|total_sleep_minutes` (tertile-bucketed) → next-day morning check-in + `brief_snapshots.score` (PRS).
- **D — Recovery After Heavy-Day Streaks** · top-third daily calendar load → runs of ≥2 → measure PRS / HRV on day after run vs baseline of non-heavy non-tail days. Computes recovery days.

## Backend
- Edge function: `cause-effect-engine` (Auth0 JWT via `verifyAuth0JWT`, service-role client).
- Cache table: `causality_findings (user_id, computed_for_date, payload jsonb)` — RLS enabled, no policies (service-role only).
- Cache lifetime: 24h. Force-refresh via `{ force: true }` body.
- Window: 30 days default (14–90 allowed via `days` param).

## Frontend
- File: `src/components/insights/PerformanceCausalityCard.tsx` (visual rows + lenses inline; no separate sub-files needed).
- Calls: `supabase.functions.invoke('cause-effect-engine', { headers: { Authorization: \`Bearer ${token}\` } })`.
- Visual: each finding is a 3-line delta-bar (cause→signal+%Δ, bar, baseline→observed + recovery + n). No paragraph copy.
- All 4 lenses **collapsed by default**; chevron pattern matches `PerformanceRhythmCard`.
- The cross-lens highest-impact finding is rendered as the persistent "Highest-impact pattern" hero row above the lenses.

## Honest empty states
- No calendar → Lens A & D say `"Connect calendar to unlock"`.
- <5 wearable days → Lens A & C say `"Need 5+ wearable days — currently X"`.
- <7 check-ins → Lens B says `"Need 7+ check-ins — currently X"`.
- No findings clear gates anywhere → card collapses to `"Patterns are still forming — keep checking in."` with a coverage line. **Never invent a pattern to fill space.**

## Forbidden inputs
- Coach signals / coach summaries.
- Manually-typed wins / journal entries (text-only without a paired measured signal).
- Mood patterns (`outcome` text-only) without a paired numeric or tier delta.
- Correlations without recovery context for Lens A and D.

## Long-form text
Every Finding carries a `longText` (e.g. for the weekly insights email). The UI never renders `longText`; only the visual row.

## Files
- `supabase/functions/cause-effect-engine/index.ts`
- `supabase/migrations/<…>_causality_findings.sql`
- `src/components/insights/PerformanceCausalityCard.tsx`
- Wired in `src/pages/Insights.tsx` (Patterns tab).