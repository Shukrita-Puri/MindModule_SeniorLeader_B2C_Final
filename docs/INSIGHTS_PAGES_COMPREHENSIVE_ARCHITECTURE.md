# Insights Pages — Comprehensive Architecture & Decision Reference

> **Last updated:** 2026-04-30
> **Scope:** Everything that powers `/insights` end-to-end — UI, edge functions, DB tables, scoring contracts, what is live, what was suppressed, and what is safe to build on.
> **Audience:** Product + engineering. Anyone making a *keep / cut / extend* decision on the Insights surface.

---

## 0. TL;DR — Decision Map

The Insights page today is **2 tabs, 7 cards, 5 edge functions, and ~12 DB tables**. It used to be much larger; the bloat was deliberately cut down. Here is the live shape and the call on each piece.

| Tab | Card | Component | Backend | Status | Recommendation |
|---|---|---|---|---|---|
| Progress | Did You Show Up For Yourself? | `DailyShowUpCalendar` | direct DB (`daily_checkins`, `daily_ritual_completions` via `getRitualRange`) | **Live, hero of Progress** | **Keep + invest.** This is the core engagement loop. |
| Progress | Leadership Patterns (Trajectory) | `LeadershipPatternsCard` | `state-patterns-insights` | **Live** | **Keep.** This is the executive summary of *who you are now vs baseline*. Highest-leverage card. |
| Progress | Practice Effectiveness | `PracticeEffectiveness` | direct DB (`sanctuary_events` + `daily_checkins`) | **Live, gated** | **Keep**, but tighten thresholds — currently silent until ≥3 sessions per category. |
| Progress | Your Momentum (Tiny Wins log) | inline in `Insights.tsx` | `tiny-wins-insights` (prod) / direct DB (DEV) | **Live** | **Keep** — high emotional payoff, low compute cost. |
| Patterns | Cause & Effect (Performance Causality) | `PerformanceCausalityCard` | `cause-effect-engine` (cached in `causality_findings`) | **Live, CEO-grade** | **Keep + extend.** Best science card; needs more wearable + calendar coverage. |
| Patterns | Mind Readiness Rhythm | `PerformanceRhythmCard` + 3× `LevelTrendCalendar` | `performance-rhythm-insights` + `level-trend-calendar` | **Live** | **Keep.** Visual anchor for the Patterns tab. |
| — (suppressed) | Mind Map / Inner World | `InnerWorldBubbles`, `SemanticBubbles`, `PsychologicalDimensionBubbles` | `insights-semantic-analysis` | **Code present, not rendered** | **Decide:** delete or revive behind a feature flag. See §10. |
| — (suppressed) | Calendar/Behavior correlations | `CalendarStateCorrelations`, `BehaviorOutcomeCorrelations` | direct DB | **Code present, not rendered** | **Delete.** Replaced by `cause-effect-engine` Lens A/B. |
| — (suppressed) | Energy Rhythm curve | `EnergyRhythm`, `EnergyRhythmCurve`, `WeeklyRhythmHeatmap` | direct DB | **Code present, not rendered** | **Delete.** Replaced by 3×7 grid in `PerformanceRhythmCard`. |
| — (suppressed) | Friction & Strength detail | `FrictionAndStrengthDetail`, `BaselineReferenceCard` | direct DB | **Code present, not rendered** | **Delete.** Folded into `LeadershipPatternsCard`. |

**One-liner verdict:** the active surface is **lean and defensible**. The dead code in `src/components/insights/` is the single biggest cleanup opportunity.

---

## 1. Page Shell — `src/pages/Insights.tsx` (1,179 lines)

### 1.1 Layout
- Sidebar (`LeftSidebar`) + main `SidebarInset` with `data-scroll-container` (used by `ScrollToTop`).
- Header: `<SidebarDiscoveryPulse />` + page title `Mental Performance Insights` + sub `What's consistently true about how you lead, perform, and recover`.
- **Sticky tab bar** (file-folder style): `Progress` | `Patterns`. Default `progress`. URL `?highlight=…` deep-links to the Patterns tab and pulses a `data-highlight` element (used by Smart Nudges).
- **All tabs always rendered**, toggled via `display`. No remount cost when switching.
- Bottom padding accounts for the floating pill nav (`140px + safe-area`).

### 1.2 Loading model — Cached Render + Silent Verify
Follows the global `mem://ux/loading/cached-render-and-silent-verification` standard.

1. **Mount-time hydration (sync):** reads `cacheKeys.insightsData(uid, today)` via `persistentBriefCache`. Cache TTL = midnight rollover.
2. **Scripted loader gate:** `EngravedLoader` (3 steps: *Reading patterns → Connecting wins & themes → Synthesising insights*). Skipped if either:
   - `cacheKeys.insightsScriptDone(uid, today)` is set, **or**
   - the user has zero local input (`hasEverCheckedIn === false` AND no wearable rows). Honest empty state instead.
3. **Silent refresh:** `fetchStatePatterns` + `fetchTinyWinsInsights` always run after hydration. They never flip `*Loading` true if cache hit.
4. **Per-section error state:** `patternsError`, `winsError`, `semanticError`. No global blocker.
5. **Per-section timeout:** every edge call wrapped in `withTimeout(15000ms)`. Mobile networks won't hang the page.

### 1.3 What it actually fetches on mount

```ts
useEffect(() => {
  if (user?.id && !fetchedRef.current) {
    fetchedRef.current = true;
    fetchStatePatterns();      // → state-patterns-insights (Trajectory, archetype, friction)
    fetchTinyWinsInsights();   // → tiny-wins-insights (Your Momentum)
    // semantic analysis is INTENTIONALLY suppressed — Mind Map tab is removed
  }
}, [user?.id]);
```

`PerformanceCausalityCard`, `PerformanceRhythmCard`, `DailyShowUpCalendar`, `PracticeEffectiveness` each fetch their own data when their tab becomes visible (or on mount, since both tabs are mounted).

### 1.4 Insights tier (read-only, governs gating copy)

```
0  check-ins → 'baseline'
1–2          → 'early'
3            → 'summary'
4–6          → 'deepening'
≥7           → 'full'
```
Used by `ProgressiveUnlockMessage` and the `winsProgressMessage` helper.

### 1.5 DEV_MODE branch
Every fetcher has a parallel direct-DB branch keyed off `DEV_USER.id` so the page is fully testable without Auth0. **Important:** scoring logic (archetype, friction tiers, trajectory) is duplicated client-side in DEV — keep server logic canonical (`mem://architecture/proprietary-logic-protection`). Treat the DEV branch as a *render-the-shape* tool, not a source of truth.

---

## 2. Tab 1 — Progress

Order (top → bottom) inside `<div data-highlight="consecutive_low" data-highlight-alt="recovery_deficit">`:

1. `DailyShowUpCalendar`
2. `LeadershipPatternsCard`
3. `PracticeEffectiveness` (inside `LuxuryInsightCard`)
4. `Your Momentum` block (inline, inside `LuxuryInsightCard`)

### 2.1 DailyShowUpCalendar — *"Did you show up?"*

- **Visual:** Mon–Sun strip mirroring the homepage Weekly Ritual Streak.
- **Logic:** a day = "showed up" if **any check-in** OR **any priority completion** for that local date.
- **Streak:** consecutive showed-up days from today backwards, plus 3-day / 7-day **confetti** triggered with `canvas-confetti` (per `mem://features/insights/progress-tab-v2`).
- **Sources:** `getRitualRange()` (which calls `daily-rituals` EF) + `daily_checkins` (DEV: direct, prod: through EF for service-role bypass).
- **Why it's the hero:** this is the only card that closes the loop between *I opened the app* and *I showed up for me*. Engagement-positive, not analytical.

### 2.2 LeadershipPatternsCard — *Trajectory + Archetype evolution*

Single richest card on the page. Uses `state-patterns-insights` payload directly (no second fetch).

**What it shows:**
- **Baseline archetype** (from onboarding `component_scores`) → **Current archetype** (re-resolved against last-30d weighted scores). When they differ, an `archetypeEvolved` chip surfaces.
- **Lean on / Watch for** lines from the archetype dictionary (5 archetypes: Grounded Master, Resilient Performer, Clear Thinker, Intensity Driver, Adaptive Navigator).
- **3 dimension bars:** Recalibration · Clarity · Renewal. Baseline vs Current with `scoreDeltas`.
- **Trajectory scorecard:** `frictionPct` · `frictionLabel` · `frictionDeltaPct` (recent 7 vs prior 7) · `positiveRate` (Consistency) · `positiveDeltaPct`. `trendDirection ∈ {improving, stable, declining}` drives the chevron icon.
- **Recurring themes** chips (top phrases from `daily_themes`).
- **Coach strength / friction lines** when `user_coach_insights` rows of type `strength` or `growth_area` are active.
- **Data source note** computed server-side from coverage flags (`hasWearable`, `hasCalendar`).

**Scoring contract (server-side, `state-patterns-insights/index.ts`):**
- Component scores re-derived weekly via `computeWeightedScore(signals)` with redistribution for missing signals.
- Coach dialogue keyword scanning: `REG_POSITIVE/NEGATIVE`, `CLARITY_POSITIVE/NEGATIVE`, `RENEWAL_POSITIVE/NEGATIVE` regexes nudge the live score by ±15.
- Outcome → tier proxy: `focused|steady → peak`, `scattered → managing`, `drained|overwhelmed → depleted`.
- Friction is **day-level** (a single low check-in marks the whole day), Consistency is **check-in-level**.

### 2.3 PracticeEffectiveness
- Pulls `sanctuary_events (event_type=completed)` + next-day `daily_checkins.outcome`.
- Surfaces practices whose next-check-in outcome is consistently better than baseline.
- **Gated:** silent until ≥3 sessions in a category.
- Honest empty: *"Use a few practices and we'll surface what works for you."*

### 2.4 Your Momentum (Tiny Wins log)
- KPIs: `winsCount` + dominant **Win Topic** (Resilience / Leadership / Decision / Growth / Delivery — derived inline from `growth_signal`, `agency_type`, `regulation_level`, and content regex).
- Insight line at ≥3 wins when one domain holds ≥25% share: *"35% of your wins this month were resilience wins — that's your dominant pattern right now."*
- Collapsible win log: last 10 wins with domain tag + date.
- Progressive copy via `getWinsProgressMessage(winsCount)`.
- **Backend:** `tiny-wins-insights` returns `{themes, dimensions, observation, patternLine, summary, winsCount, winsContent}`. The four dimensions (`emotion`, `agency`, `regulation`, `growth`) are extracted server-side.

---

## 3. Tab 2 — Patterns

Order:
1. `PerformanceCausalityCard` (Cause & Effect — top finding always visible, 4 chevron lenses below)
2. `PerformanceRhythmCard` (Mind Readiness Rhythm — Energy Trend + 3 Level Trend calendars + 3×7 heatmap + Best Window + Rhythm Signals)

### 3.1 PerformanceCausalityCard

Authoritative reference: `mem/features/insights/performance-causality.md`. Summary of locked rules:

**CEO contract — every finding contains:**
1. **Cause** — leader-controllable input (event type, sleep tier, consecutive-load streak).
2. **Effect** — quantified Δ on a measured signal (HRV, RHR, clarity, sharpness, confidence, PRS) vs the user's own 30-day baseline.
3. **Magnitude** — `%Δ` + sample size `n`.
4. **Recovery window** — days for the signal to return to ±5% baseline (when computable).
5. **Confidence tier** — two-tier:
   - `strong`: `n ≥ 5` AND `|Δ| ≥ 15%` (numeric) OR `≥ 1.0 tier` (1–5 scales)
   - `emerging`: `n ≥ 3` AND `|Δ| ≥ 10%` (numeric) OR `≥ 0.5 tier` (1–5 scales) — rendered with an "Emerging" pill

Anything below `emerging` is **dropped, not softened**.

**4 lenses:**
- **A — Events That Cost You Physiologically**
  - A.1 Per event-type (calendar × HRV/RHR) using a broad keyword bucket (board, investor, reviews, 1:1s, all-hands, client, interview, deep work, exec, networking, intro/discovery, catch-ups, school/family, internal builds) + attendee-count fallback (Solo / Small-group / Group).
  - A.2 Calendar-load tertile — top-third daily meeting minutes vs the rest. Independent of titles, so any calendar+wearable user gets coverage.
- **B — Events That Cost You Cognitively** — calendar × `clarity_level | mental_sharpness_level | confidence_level`. Picks the most-impacted dim per event-type.
- **C — Sleep → Decision Quality** — `wearable_data.sleep_score | total_sleep_minutes` (tertile-bucketed) → next-day morning check-in + `brief_snapshots.score` (PRS).
- **D — Recovery After Heavy-Day Streaks** — top-third daily calendar load → runs of ≥2 → PRS / HRV on day-after-run vs non-heavy non-tail baseline.

**Suppressed inputs:** coach signals, manually-typed wins, mood text, correlations without recovery context. (`mem://features/coach/suppression-standard`.)

**Backend:** `cause-effect-engine` (Auth0 JWT, service role). 30-day window default, 14–90 allowed via `days`. Cache: `causality_findings` table (24h, force-refresh via `{force: true}`). `ENGINE_VERSION = 2` — cached rows missing this version auto-recompute.

**Honest empty states** (not invented findings):
- No calendar → Lens A & D say *"Connect calendar to unlock"*.
- <5 wearable days → Lens A says *"Need 5+ wearable days — currently X"*.
- No `sleep_score` → Lens C says *"Connect Apple Health sleep tracking"*.
- <7 check-ins → Lens B says *"Need 7+ check-ins — currently X"*.
- Nothing clears thresholds → *"Patterns are still forming — keep checking in."*

**Preview UX:** in Lovable preview / no-auth states, falls back to `MOCK_CAUSALITY_PAYLOAD` (`causalityMockData.ts`) so the card never demos as broken.

### 3.2 PerformanceRhythmCard

Owns the entire **Mind Readiness Rhythm** section. Reference: `mem/features/insights/level-trend-calendars.md`.

- **Energy Trend** (`LevelTrendCalendar` driven by `daily_checkins.outcome`).
- **Clarity Trend** (`clarity_level`, 1–5).
- **Sharpness Trend** (`mental_sharpness_level`, 1–5).
- **Confidence Trend** (`confidence_level`, 1–5).
- **How You Show Up** — 3×7 heatmap (Morning/Afternoon/Evening × Mon–Sun) using stored `time_window` (NOT UTC-derived hours) to avoid TZ skew.
- **Best Readiness Window** (highest avg composite from `inner_readiness_scores`).
- **Your Rhythm Signals (v3.1)** — top 3 prioritised from a 4-series rhythm miner across Energy / Clarity / Sharpness / Confidence (`peak-window`, `low-window`, `peak-day`, `low-day`, `consecutive-neg`, `consecutive-pos`, `cell-peak`). `all` is preserved for the weekly insights email.
- **Calendar Insight** + **Cause-Effect Insight** (lightweight inline correlations; the heavy lifting lives in `cause-effect-engine`).

**Width-pinning is self-healing** via ref callback + `ResizeObserver`. Do **not** revert to a one-shot `useEffect` (race condition on tab switch — known regression).

**Locked palette** (also used by check-in outcome buttons + Energy Trend dots):

| Level | Outcome | Color | Dark |
|------:|---------|-------|------|
| 5 | Focused | `#3d6fa8` | `#2f5685` |
| 4 | Steady | `#7ba87a` | `#5f8a5e` |
| 3 | Scattered | `#d4b75a` | `#b89a3f` |
| 2 | Drained | `#e88a52` | `#c76d38` |
| 1 | Overloaded | `#d8553f` | `#b03d2a` |

---

## 4. Backend — Edge Functions

| Function | Lines | Auth | Caller | Cache | Purpose |
|---|---:|---|---|---|---|
| `state-patterns-insights` | 721 | `verifyAuth0JWT` | `Insights.tsx` (`fetchStatePatterns`) | none (per request) | Trajectory + archetype + friction + coach insights — the LeadershipPatternsCard payload |
| `cause-effect-engine` | 868 | `verifyAuth0JWT` | `PerformanceCausalityCard` | `causality_findings` table, 24h, `force:true` bypass | 4-lens cause→effect with two-tier confidence |
| `performance-rhythm-insights` | 1,091 | `verifyAuth0JWT` | `PerformanceRhythmCard` | none | 3×7 grid + best window + 4-dim rhythm miner |
| `tiny-wins-insights` | 436 | `verifyAuth0JWT` | `Insights.tsx` (`fetchTinyWinsInsights`) | none | Wins themes + dimensions + observation |
| `level-trend-calendar` | 117 | `verifyAuth0JWT` | `LevelTrendCalendar` (per dim) | none | Read-only per-slot 1–5 levels for Clarity/Sharpness/Confidence trends |
| `learn-checkin-patterns` | 137 | `authenticateRequest` | (background — not on Insights mount path) | n/a | Background pattern learner, feeds `coach_pattern_observations` |
| `insights-semantic-analysis` | 708 | `verifyAuth0JWT` | **suppressed** (Mind Map removed) | none | Theme bubbles + relationships — kept for future revival |
| `generate-energy-insight` | 121 | `verifyAuth0JWT` | not Insights — used by Brief | n/a | Single-line energy LLM observation |
| `generate-dashboard-insight` | 84 | `verifyAuth0JWT` | not Insights — used by homepage | n/a | Single-line dashboard LLM observation |

### 4.1 `state-patterns-insights` — upstream tables (12 parallel queries)

| Table | Columns read |
|---|---|
| `profiles` | `user_archetype`, `component_scores`, `mental_fitness_baseline`, `growth_priority` |
| `daily_checkins` | `checkin_date, outcome, energy_balance, clarity_level, confidence_level, created_at, state_tags` |
| `daily_themes` | `theme_phrase, theme_driver` |
| `user_coach_insights` | `insight_content, created_at, insight_type, is_active` (general + scoped strength/growth_area) |
| `sanctuary_events` | `category, event_type, timestamp, context_data` |
| `daily_ritual_completions` | `session_period, completion_status, ritual_date` |
| `tiny_wins` | `win_date` |
| `wearable_data` | `hrv, summary_date` |
| `dialogue_sessions` | `id` (then scopes `dialogue_messages` by these IDs — never raw scan) |
| `calendar_connections` | `is_active` |
| `behavior_logs` | `behavior_type, created_at` |
| `inner_readiness_scores` | `composite_score, energy_tier, full_context_statement, divergence_flag, layers_active, score_date` |

### 4.2 `cause-effect-engine` — upstream tables

`calendar_events`, `wearable_data` (incl. `sleep_score`, `total_sleep_minutes`), `daily_checkins`, `brief_snapshots`. Writes only to `causality_findings`.

### 4.3 `performance-rhythm-insights` — upstream tables

`daily_checkins`, `calendar_connections`, `calendar_events`, `behavior_logs`, `inner_readiness_scores`, `daily_ritual_completions`, `dialogue_sessions` → `dialogue_messages` (scoped), `jit_preferences`, `wearable_data`. **No writes.**

### 4.4 Why server-derived everywhere

Per `mem://architecture/mastery-plan-server-side-derivation` and `mem://security/proprietary-logic-protection`: archetype resolution, friction math, two-tier causality gating, and rhythm signal prioritisation **must not** live client-side. The DEV branches in `Insights.tsx` and `LeadershipPatternsCard.tsx` are *shape stubs* only and must stay behind `DEV_MODE`.

---

## 5. Database Tables — Read & Write Map

### Read-only on the Insights surface
- `profiles`
- `daily_checkins`
- `daily_themes`
- `daily_ritual_completions`
- `sanctuary_events`
- `tiny_wins`
- `wearable_data`
- `calendar_connections` / `calendar_events`
- `behavior_logs`
- `inner_readiness_scores`
- `brief_snapshots`
- `user_coach_insights`
- `dialogue_sessions` → `dialogue_messages` (scoped, see `mem://security/auth0-dialogue-message-scoping-standard`)
- `coach_pattern_observations` (read by some background paths)
- `jit_preferences`

### Written by Insights stack
- `causality_findings` — cache-write only, by `cause-effect-engine` (service role; RLS deny-by-default).

No other Insights surface writes to user data.

---

## 6. Auth, RLS, and Service-Role Access

- All Insights edge functions authenticate with `verifyAuth0JWT(req)` from `_shared/auth.ts` (one uses `authenticateRequest`).
- Tables are RLS deny-by-default. The Insights functions use the **service-role client** because Auth0 `sub` cannot satisfy `auth.uid()` (`mem://security/rls-auth0-access-protocol`).
- `dialogue_messages` is **always** scoped by the user's own `dialogue_sessions.id` set first, then `.in('session_id', sessionIds)` — never raw `eq('user_id', …)`. (Bug fix encoded in `state-patterns-insights` and `performance-rhythm-insights`.)
- `causality_findings`: RLS enabled, **no policies** — service-role only.

---

## 7. Caching, Performance, and Resilience

| Layer | Mechanism | TTL | Where |
|---|---|---|---|
| Per-day persistent cache | `persistentBriefCache.write/read` | midnight rollover | `cacheKeys.insightsData(uid,date)` and `cacheKeys.insightsScriptDone(uid,date)` |
| Causality findings | DB row in `causality_findings` | 24h, version-gated (`ENGINE_VERSION`) | server |
| Edge function timeouts | `withTimeout(15000ms)` per call | per request | `Insights.tsx` |
| Mock fallback | `MOCK_CAUSALITY_PAYLOAD` | n/a | `PerformanceCausalityCard` (preview/no-auth only) |
| Tab content | Both tabs always mounted | n/a | `Insights.tsx` |

**Known race condition fixed:** `LevelTrendCalendar` width pinning previously collapsed to 0 when the Patterns tab first became visible. Fix: ref callback + `ResizeObserver`. Do not regress.

---

## 8. Suppressed / Removed (Why)

These cards are **intentionally not rendered** but their files still exist. Treat them as either a *deletion candidate* or a *future feature flag*.

| Component(s) | Why removed | Replacement | Recommendation |
|---|---|---|---|
| `InnerWorldBubbles`, `SemanticBubbles`, `PsychologicalDimensionBubbles` (Mind Map tab) | Visually rich but cognitively heavy; signal-to-noise was low and users couldn't act on it. | Cause & Effect lenses give *actionable* causality instead of fuzzy theme co-occurrence. | **Decide:** delete or revive as an opt-in *Mind Map* page, not a tab. |
| `CalendarStateCorrelations`, `BehaviorOutcomeCorrelations` | Single-table correlations without recovery window violated the CEO contract. | Lens A/B in `cause-effect-engine`. | **Delete.** |
| `EnergyRhythm`, `EnergyRhythmCurve`, `WeeklyRhythmHeatmap` | Multiple visual takes on the same data; user couldn't tell which to trust. | 3×7 grid + Best Window in `PerformanceRhythmCard`. | **Delete.** |
| `FrictionAndStrengthDetail`, `BaselineReferenceCard` | Separate cards for archetype/friction split the executive summary. | Folded into `LeadershipPatternsCard`. | **Delete.** |
| Old `WeeklyInsights.tsx` (root component) | Pre-tab era. | Tabs + dedicated cards. | **Delete.** |

If we delete: ~3,500 LOC removable from `src/components/insights/` and one 708-line edge function (`insights-semantic-analysis`). That is **~40% of the Insights surface** as dead weight today.

---

## 9. Cross-Surface Dependencies (don't break these)

- **Smart Nudges** deep-link into `/insights?highlight=consecutive_low|recovery_deficit`. The `data-highlight` and `data-highlight-alt` attributes on the Progress tab container are part of the public contract. (`mem://features/notifications/smart-nudges-mvp-framework`.)
- **Homepage** `InsightProgressCard` reuses the same Weekly Ritual Streak component (`WeeklyRitualStreak`) — keep visually in sync with `DailyShowUpCalendar`. (`mem://features/insights/progress-tab-v2`.)
- **Weekly insights email** consumes `mindRhythmPatterns.all` (long form) from `performance-rhythm-insights` and `Finding.longText` from `cause-effect-engine`. Don't strip these "unused" fields — they're consumed off-app.
- **Brief** uses `brief_snapshots.score` (PRS) which Lens C reads. PRS scoring rules live in `mem://features/performance-readiness/brief-logic`.
- **Coach** signals are deliberately excluded from `cause-effect-engine` (`mem://features/coach/suppression-standard`) but *included* by `state-patterns-insights` for the Trajectory card.

---

## 10. Decision Checklist

Use this when planning the next iteration of `/insights`.

### Keep (high signal, low cost)
- ✅ DailyShowUpCalendar — engagement loop hero.
- ✅ LeadershipPatternsCard — executive summary.
- ✅ PerformanceCausalityCard — only CEO-grade causal card; protect the contract.
- ✅ PerformanceRhythmCard + 3 Level Trend calendars — visual anchor.
- ✅ Your Momentum (Tiny Wins) — emotional payoff per session.

### Cut (recommended deletes)
- ❌ All "suppressed" components in §8 unless we're committing to revive Mind Map.
- ❌ `insights-semantic-analysis` edge function (only the suppressed Mind Map calls it).

### Invest (logical next builds)
- 🔨 **Causality coverage uplift** — push `cause-effect-engine` adoption by surfacing the *connect calendar* / *connect Apple Health* honest-empty CTAs as inline integration prompts.
- 🔨 **Cross-window signals** — Lens E candidate: `daily_checkins.time_window` × outcome over 30d (rhythm-by-window vs aggregate). Re-uses existing data, no new tables.
- 🔨 **Weekly insights email card-on-page** — render the email's long-form findings in a *Read this week's review* drawer, since the data already exists in `mindRhythmPatterns.all` and `Finding.longText`.
- 🔨 **Trajectory delta narrative** — the numbers are there (`scoreDeltas`, `frictionDeltaPct`, `positiveDeltaPct`); a 1-line LLM summary would land hard. Keep prompt server-side.

### Re-evaluate
- ⚠️ Mind Map / semantic bubbles — only revive if there is an explicit user job-to-be-done. Today there isn't.
- ⚠️ DEV_MODE branches duplicating server scoring — refactor to a thin "shape stub" that *cannot* drift from canonical.

---

## 11. File / Function Index

### Pages
- `src/pages/Insights.tsx` (1,179 lines) — page shell, tab logic, hydration, suppressed semantic-analysis path.

### Live components (`src/components/insights/`)
- `DailyShowUpCalendar.tsx` (202)
- `LeadershipPatternsCard.tsx` (522)
- `PerformanceCausalityCard.tsx` (419) + `causalityMockData.ts`
- `PerformanceRhythmCard.tsx` (1,132)
- `LevelTrendCalendar.tsx` (343)
- `PracticeEffectiveness.tsx` (232)
- `LuxuryInsightCard.tsx` (27), `LuxuryProgressRing.tsx` (99)
- `InsightInfoModal.tsx` (57)
- `ProgressiveUnlockMessage.tsx` (75), `LockedInsightSection.tsx` (82)

### Suppressed components (delete candidates)
- `BaselineReferenceCard.tsx` (115)
- `BehaviorOutcomeCorrelations.tsx` (264)
- `CalendarStateCorrelations.tsx` (270)
- `EnergyRhythm.tsx` (205) + `EnergyRhythmCurve.tsx` (237)
- `FrictionAndStrengthDetail.tsx` (183)
- `InnerWorldBubbles.tsx` (430), `SemanticBubbles.tsx` (49), `PsychologicalDimensionBubbles.tsx` (334)
- `WeeklyRhythmHeatmap.tsx` (183)

### Edge functions
- `supabase/functions/state-patterns-insights/` (721)
- `supabase/functions/cause-effect-engine/` (868)
- `supabase/functions/performance-rhythm-insights/` (1,091)
- `supabase/functions/tiny-wins-insights/` (436)
- `supabase/functions/level-trend-calendar/` (117)
- `supabase/functions/learn-checkin-patterns/` (137) — background only
- `supabase/functions/insights-semantic-analysis/` (708) — **suppressed**

### Memory anchors
- `mem://features/insights/performance-causality` — Cause & Effect contract (locked).
- `mem://features/insights/level-trend-calendars` — Trend calendar palette/scale (locked).
- `mem://features/insights/progress-tab-v2` — Show-Up calendar above Trajectory; PRS in `brief_snapshots`; confetti at 3/7-day streaks.
- `mem://features/coach/suppression-standard` — why coach signals are excluded from causality.
- `mem://architecture/mastery-plan-server-side-derivation` — server-derived signals rule.
- `mem://security/proprietary-logic-protection` — algorithms must live in EFs.
- `mem://security/rls-auth0-access-protocol` — service-role pattern.
- `mem://security/auth0-dialogue-message-scoping-standard` — dialogue_messages scoping.
- `mem://ux/loading/cached-render-and-silent-verification` — loading model.

---

## 12. What "good" looks like for the next iteration

1. **Delete the suppressed code** in one PR. The Insights surface gets ~40% smaller with zero user-visible change. This is the highest-leverage refactor available right now.
2. **Pick a position on Mind Map** — keep deleted, or commit to a real job-to-be-done before reviving.
3. **Move DEV_MODE scoring stubs to thin fixtures** so server logic stays canonical.
4. **Lens E** (rhythm-by-window) inside `cause-effect-engine` — cheap, obvious next finding, no new data needed.
5. **Inline integration CTAs** when Lens A/C return *connect-to-unlock* states — converts honest-empty into an action.

End of document.