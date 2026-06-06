# Insights — Comprehensive Architecture, Calculations & Audit

> **Last updated:** 2026-06-06
> **Scope:** Everything that powers `/insights` end-to-end — UI shell, every card and sub-section, edge functions, DB tables, scoring contracts, signal lists, what is live, what is suppressed, and an opinionated audit of what should change next.
> **Audience:** Product, design, engineering, and data. This is the canonical reference for *what is being calculated, from which signals, by which function, and rendered where*.
> **Companion docs:** `docs/INSIGHTS_PAGE_AUDIT_REPORT.md` (older line-by-line audit), `docs/MRS_V3_SPECIFICATION.md` (readiness scoring), `mem/features/insights/*` (locked card contracts).
>
> No code changes accompany this doc. All "recommendations" and "audit gaps" sections are advisory and explicitly marked.

---

## 0. TL;DR — The Insights Surface at a Glance

The Insights page is **2 tabs, 7 live cards, 5 production edge functions, ~14 DB tables**. Several legacy components remain in the repo but are not rendered.

| Tab | Card | Component | Backend | Primary signals | Status |
|---|---|---|---|---|---|
| Progress | Did You Show Up For Yourself? | `DailyShowUpCalendar` | direct DB (`daily_checkins`, `daily_ritual_completions` via `daily-rituals` EF) | check-in presence ∪ priority completion per local date | Live |
| Progress | Performance Streaks (this month) | `PerformanceStreaks` | direct DB / `daily-checkins` EF | per-dimension peak (4–5) and friction (1–2) counts | Live |
| Progress | Leadership Patterns (Trajectory) | `LeadershipPatternsCard` | `state-patterns-insights` | weighted 3-dim scores (Recalibration / Clarity / Renewal), archetype, friction%, themes, coach Lean-On / Watch-For | Live |
| Progress | Practice Effectiveness | `PracticeEffectiveness` | direct DB (`sanctuary_events` + `daily_checkins`) | next-day outcome delta vs baseline, per practice category | Live, gated ≥3 sessions |
| Progress | Your Momentum (Tiny Wins) | inline in `Insights.tsx` | `tiny-wins-insights` | wins count, dominant domain, themes, dimensions, optional LLM observation | Live |
| Patterns | Performance Causality (Cause & Effect) | `PerformanceCausalityCard` | `cause-effect-engine` (cached in `causality_findings`, `ENGINE_VERSION=3`) | calendar × HRV/RHR per-event peak deltas, sleep → next-day, recovery after streaks, burnout matrix | Live, CEO-grade |
| Patterns | Mind Readiness Rhythm | `PerformanceRhythmCard` + 3× `LevelTrendCalendar` | `performance-rhythm-insights` + `level-trend-calendar` | Energy / Clarity / Sharpness / Confidence per-slot levels, 3×7 heatmap, Best Window, Rhythm Signals v3.1 | Live, **self-check-in only today** |
| — | Mind Map / Inner World | `InnerWorldBubbles`, `SemanticBubbles`, `PsychologicalDimensionBubbles` | `insights-semantic-analysis` | LLM theme/relationship extraction | Code present, **not rendered** |
| — | Energy Rhythm curve, Calendar/Behavior correlations, Friction & Strength detail, Baseline Reference | various | direct DB | replaced by Causality + Trajectory | Code present, **not rendered** |

**One-liner verdict:** the live surface is correct and defensible. The biggest evolution gaps are (a) wearable layering on the Rhythm card, (b) pre/post-practice physiology on Practice Effectiveness, (c) sequential card unlock to avoid the empty-shell first impression, and (d) consolidating Causality copy so each finding renders the same way.

---

## 1. Page Shell — `src/pages/Insights.tsx`

### 1.1 Layout
- Sidebar (`LeftSidebar`) + main `SidebarInset` with `data-scroll-container`.
- Header: `SidebarDiscoveryPulse` + title `Mental Performance Insights` + sub-line.
- **Sticky file-folder tab bar:** `Progress | Patterns`. Default `progress`. URL `?highlight=…` deep-links the Patterns tab and pulses a `data-highlight` element (used by Smart Nudges).
- **Both tabs always mounted**, toggled via `display`. Switching tabs is free.
- Bottom padding accounts for the floating pill nav (`140px + safe-area`).

### 1.2 Loading model — Cached Render + Silent Verify
Follows `mem://ux/loading/cached-render-and-silent-verification`.

1. **Mount-time hydration (sync):** reads `cacheKeys.insightsData(uid, today)` via `persistentBriefCache`. TTL = midnight rollover.
2. **Scripted loader gate:** `EngravedLoader` (3 steps). Skipped if `cacheKeys.insightsScriptDone(uid, today)` is set OR the user has zero local input (`hasEverCheckedIn === false` AND no wearable rows). Otherwise an honest empty state is shown.
3. **Silent refresh:** `fetchStatePatterns` + `fetchTinyWinsInsights` always run after hydration; they never flip `*Loading` true on a cache hit.
4. **Per-section error state:** `patternsError`, `winsError`, `semanticError` — no global blocker.
5. **Per-section timeout:** every edge call is `withTimeout(15000ms)`.

### 1.3 What the shell fetches on mount
```ts
useEffect(() => {
  if (user?.id && !fetchedRef.current) {
    fetchedRef.current = true;
    fetchStatePatterns();      // → state-patterns-insights
    fetchTinyWinsInsights();   // → tiny-wins-insights
    // semantic analysis intentionally suppressed
  }
}, [user?.id]);
```
`PerformanceCausalityCard`, `PerformanceRhythmCard`, `DailyShowUpCalendar`, `PerformanceStreaks`, and `PracticeEffectiveness` each fetch their own data.

### 1.4 Insights tier (gating copy, read-only)
```
0 check-ins → 'baseline'
1–2         → 'early'
3           → 'summary'
4–6         → 'deepening'
≥7          → 'full'
```
Used today by `ProgressiveUnlockMessage` and `getWinsProgressMessage`. **Not** used to gate card *visibility*; that decision is made per-card. See §11.4 for the proposed sequential-unlock evolution.

### 1.5 DEV_MODE branches
Every fetcher has a parallel direct-DB branch keyed off `DEV_USER.id`. Treat the DEV branch as a *shape stub*, not a source of truth — canonical scoring lives in edge functions (`mem://security/proprietary-logic-protection`).

---

## 2. Tab 1 — Progress

Render order inside `<div data-highlight="consecutive_low" data-highlight-alt="recovery_deficit">`:

1. `DailyShowUpCalendar`
2. `PerformanceStreaks`
3. `LeadershipPatternsCard`
4. `PracticeEffectiveness` (in `LuxuryInsightCard`)
5. Your Momentum (inline, in `LuxuryInsightCard`)

---

### 2.1 Did You Show Up For Yourself? — `DailyShowUpCalendar`

**What renders:** Mon–Sun strip mirroring the homepage Weekly Ritual Streak, current streak count, and 3/7-day confetti.

**Rule:** a day = "showed up" if **any check-in** OR **any priority completion** exists for that local date.

**Sub-elements & signals**

| Sub-element | Signal | Source | Rule |
|---|---|---|---|
| Daily dot | did the user show up | `daily_checkins.checkin_date` ∪ `daily_ritual_completions.ritual_date` (via `daily-rituals` EF `getRitualRange`) | binary per local date |
| Streak count | consecutive showed-up days from today backwards | same | reset on first gap |
| Confetti | celebration | `canvas-confetti` | fire at 3-day and 7-day thresholds (per `mem://features/insights/progress-tab-v2`) |

**Why it's the hero:** it closes the loop between *opened the app* and *showed up for me*. Engagement-positive, zero analytical noise.

**Audit / gaps**
- ✅ Honest, simple, no scoring debt.
- ⚠️ Could surface a one-line context after a 7-day streak ("3 of those days were also wearable-tracked — your most consistent week") — pure additive copy, no scoring change.

---

### 2.2 Performance Streaks (this month) — `PerformanceStreaks`

**What renders:** two rows (Peak / Friction) × 4 dimensions (Clarity, Emotion, Pressure, Regulation), each with a counter pill and ThumbsUp / ThumbsDown affordance. Resets on the 1st of each month.

**Signals & rules**

| Sub-element | Signal | Source | Threshold |
|---|---|---|---|
| Peak count per dimension | level 4 or 5 at any slot in the month | `daily_checkins.{clarity,emotion,pressure,regulation}_level` | ≥4 |
| Friction count per dimension | level 1 or 2 at any slot in the month | same | ≤2 |

Helper: `src/utils/dimensionTiers.ts → computeDimensionStreaks`.

**Audit / gaps**
- ✅ Calm, scannable, glanceable.
- ⚠️ No "trend vs last month" context (the data exists in `daily_checkins`).
- ⚠️ No wearable mirror (e.g., HRV peak/floor days). See §11.5 for a proposed extension.

---

### 2.3 Leadership Patterns (Trajectory) — `LeadershipPatternsCard`

**Single richest card on the page.** Backend: `state-patterns-insights` (one fetch, all fields below come from one payload).

#### 2.3.1 Sub-elements

| Sub-element | What it shows | Source field |
|---|---|---|
| Baseline archetype | onboarding archetype | `baselineArchetypeId/Title` from `profiles.user_archetype` + `component_scores` |
| Current archetype | re-resolved against weighted 30-day scores | `currentArchetypeId/Title` |
| `archetypeEvolved` chip | shown when baseline ≠ current | derived |
| Lean On / Watch For | archetype dictionary copy | `archetypeLeanOn`, `archetypeWatchFor` |
| 3 dimension bars | Recalibration · Clarity · Renewal — Baseline vs Current with delta | `baselineScores`, `currentScores`, `scoreDeltas` |
| Trajectory scorecard | `frictionPct`, `frictionLabel`, `frictionDeltaPct` (last 7 vs prior 7), `positiveRate` (Consistency), `positiveDeltaPct`, `trendDirection` | direct EF fields |
| Recurring themes | top phrases (chips) | `daily_themes.theme_phrase` |
| Coach Strength / Friction | Lean-On / Watch-For overrides when active | `user_coach_insights.insight_type = 'strength' | 'growth_area'` (`is_active=true`), keyword fallback if absent |
| Data source note | "scoring uses check-ins + wearable + calendar" — varies per coverage | `hasWearable`, `hasCalendar` flags |

#### 2.3.2 Scoring contract (server-side, `state-patterns-insights/index.ts`)

All scores in 0–100. **Weight redistribution:** when a signal is unavailable, its weight is reproportioned across the remaining available signals (`computeWeightedScore(signals)`).

**Recalibration**

| Signal | Weight | Source | Availability |
|---|---:|---|---|
| Baseline | 0.30 | `profiles.component_scores.energyRegulation` | always |
| Pause-in-low practices | 0.15 | `sanctuary_events` (category=pause) × `daily_checkins` (low outcome) | ≥3 events |
| Pre-event session completion | 0.10 | `daily_ritual_completions` (session_period=pre-event, status=full) | ≥2 |
| HRV trend | 0.10 | `wearable_data.hrv` (30d) | ≥14 days |
| Coach regulation keywords | 0.15 | `dialogue_messages` (`REG_POSITIVE/NEGATIVE` regexes; ±15) | ≥1 session |
| Felt state | 0.20 | `daily_checkins.energy_balance` (7d) | ≥3 |

Penalty: −10 if ≥3 consecutive depleted/managing states.

**Clarity**

| Signal | Weight | Source | Availability |
|---|---:|---|---|
| Baseline | 0.30 | `profiles.component_scores.focusRecovery` | always |
| Flow practices under load | 0.15 | `sanctuary_events` (category=flow) | ≥3 + calendar |
| Coach clarity keywords | 0.15 | `dialogue_messages` (`CLARITY_POSITIVE/NEGATIVE`) | ≥1 |
| Theme recurrence penalty | 0.10 | `daily_themes` matching clarity patterns | ≥10 check-ins |
| Felt state | 0.30 | `daily_checkins.clarity_level` (7d) | ≥3 |

Penalty: −10 if scattered count ≥5 AND behavior logs ≥5.

**Renewal**

| Signal | Weight | Source | Availability |
|---|---:|---|---|
| Baseline | 0.30 | `profiles.component_scores.energyRenewal` | always |
| Renergise-in-depleted | 0.15 | `sanctuary_events` (category=renergise) × low outcome | ≥3 |
| Evening session rate | 0.15 | `daily_ritual_completions` (evening) | ≥10 |
| Tiny wins frequency | 0.10 | `tiny_wins` count | ≥5 |
| HRV recovery rate | 0.10 | `wearable_data.hrv` (30d) | ≥14 days |
| Coach renewal keywords | 0.10 | `dialogue_messages` (`RENEWAL_POSITIVE/NEGATIVE`) | ≥1 |
| Felt state | 0.10 | `daily_checkins.confidence_level` (7d) | ≥3 |

**Archetype resolution (cascade on current scores)**
```
1. Grounded Master:      energyReg ≥ 65 AND energyRenewal ≥ 55
2. Resilient Performer:  energyRenewal ≥ 65 AND energyReg ≥ 50
3. Clear Thinker:        focusRecovery ≥ 65 AND energyReg ≥ 45
4. Intensity Driver:     energyReg ≥ 60 AND focusRecovery < 50
5. Adaptive Navigator:   default fallback
```

**Friction / Consistency**
- Friction is **day-level** — a single low check-in marks the whole day.
- Consistency (positive rate) is **check-in-level**.
- Delta = last 7 days vs prior 7 days.
- `trendDirection ∈ {improving, stable, declining}` drives chevron.

#### 2.3.3 Audit / gaps
- ✅ Best executive summary on the page. Server-side and cached weekly.
- ⚠️ HRV signal is **available** only when wearable connected with ≥14 days. Honest empty falls back to redistribution; consider surfacing an explicit "Wearable raises confidence" chip when redistribution is active.
- ⚠️ Baseline weight is 0.30 even at 30+ days of fresh signal — the dial moves slowly. Consider a time-decayed baseline weight (`0.30 → 0.15` after 60 days of data).
- ⚠️ Coach keyword scan is regex-only; for high-frequency users it can saturate ±15 quickly. Consider a per-week cap on keyword contribution.
- ⚠️ DEV branch reimplements scoring — split into a thin shape fixture to prevent drift.

---

### 2.4 Practice Effectiveness — `PracticeEffectiveness`

**What renders:** per-practice-category cards showing next-day outcome improvement vs baseline.

#### 2.4.1 Today's calculation
- Source A: `sanctuary_events` where `event_type='completed'` (last 30d).
- Source B: `daily_checkins.outcome` on the **following day**.
- For each category (pause / flow / renergise / etc.):
  - `baseline` = average outcome score across all days the user has any check-in.
  - `withPractice` = average next-day outcome score on days following a practice in that category.
  - Surface category if `n ≥ 3` sessions AND `withPractice − baseline ≥ +0.5` outcome tier.
- Honest empty: *"Use a few practices and we'll surface what works for you."*

#### 2.4.2 Audit / gaps (this is where the user feedback bites)
- ❌ **No physiology layering today.** The card cannot answer "did my HRV recover faster after a Box-Breathing session?"
- ❌ Outcome is a coarse 5-tier label — small deltas are unstable at n=3.
- ❌ Self-report bias: users who check in after a practice are likely to over-report improvement.
- ⚠️ The card surfaces *categories*, not *specific protocols* — users want to know "did this exact 4-min breath drill help?".
- ⚠️ Visually it competes with the Trajectory card for attention without earning it at low n.

#### 2.4.3 Recommended evolution (advisory only, no code change)

**A. Pre/post physiology — feasible without app changes**

For wearable-connected users, the timeline already exists in `wearable_data.hr_samples` (jsonb of `{t, v}` HR points, added by the Apple Health bridge — see `mem://features/insights/performance-causality`). The same logic that powers Causality's per-event peak-HR delta can be reused for practices:

- For each `sanctuary_events.completed` row with `timestamp T` and known duration `D`:
  - `pre_window` = `[T − 5min, T]`
  - `post_window` = `[T + D, T + D + 10min]`
  - `delta_hr` = `mean(post) − mean(pre)` (negative = parasympathetic shift)
  - `delta_hrv_proxy` = SDNN of the 5-min `t` deltas in `post` vs `pre` (where sample density allows)
- Aggregate per practice category and per `sanctuary_content.id`. Require `n ≥ 3` sessions with usable pre/post coverage.

Limitations to call out in the UI:
- HR samples may not cover daytime practices on Apple Watch if the user is not actively wearing it.
- Practices under 3 minutes will rarely have enough samples to compute a meaningful delta.
- "Post" should exclude any obvious physical activity (e.g., walk-and-talk) — easy first guard: skip windows where `mean(post) > mean(pre) + 10bpm`.

**B. Less-is-more visual contract (proposed, not yet built)**

Replace the multi-card category grid with **one card, three lines max**:

```
┌──────────────────────────────────────────┐
│ What's restoring you                     │
│                                          │
│   Box Breathing  —  HRV +8% within 10m   │
│   n=6 · last 30 days                     │
│                                          │
│   Body Scan      —  Outcome +0.7 tier    │
│   n=4 · self-report                      │
│                                          │
│   See all practices →                    │
└──────────────────────────────────────────┘
```

Rules:
- Only show items at confidence `strong` (n ≥ 5 AND |Δ| ≥ 15% physio OR ≥1 outcome tier) or `emerging` (n ≥ 3, |Δ| ≥ 10% or ≥0.5 tier).
- Always show **at most 3** items. The card is a curator, not a directory.
- Each line is single-source (HRV or outcome) — never blended — so the user knows what evidence they're reading.

---

### 2.5 Your Momentum (Tiny Wins) — inline in `Insights.tsx`

**Sub-elements**

| Sub-element | Source |
|---|---|
| Wins count + dominant domain (Resilience / Leadership / Decision / Growth / Delivery) | derived inline from `growth_signal`, `agency_type`, `regulation_level`, content regex |
| Insight line at ≥3 wins when one domain holds ≥25% share | derived |
| Collapsible log: last 10 wins with domain tag + date | `tiny_wins` |
| Progressive copy | `getWinsProgressMessage(winsCount)` |

**Backend:** `tiny-wins-insights` returns `{themes, dimensions, observation, patternLine, summary, winsCount, winsContent}`. The four dimensions (`emotion`, `agency`, `regulation`, `growth`) are extracted server-side.

**Audit / gaps**
- ✅ Cheap to compute, high emotional payoff per session.
- ⚠️ No cross-link to Trajectory ("3 of your last 5 wins are Recalibration-tagged → that's why your Recalibration score moved +6").
- ⚠️ Domain inference is regex-based; a small LLM classifier (cached per win) would lift precision.

---

## 3. Tab 2 — Patterns

Render order:
1. `PerformanceCausalityCard`
2. `PerformanceRhythmCard` + 3× `LevelTrendCalendar` + 3×7 heatmap + Best Window + Rhythm Signals

---

### 3.1 Performance Causality (Cause & Effect) — `PerformanceCausalityCard`

Reference contract: `mem/features/insights/performance-causality.md`. **Backend: `cause-effect-engine`, `ENGINE_VERSION=3`**, cached in `causality_findings` (24h, force-refresh with `{force: true}`).

#### 3.1.1 CEO contract — every finding contains
1. **Cause** — leader-controllable input (event type, sleep tier, consecutive-load streak, practice).
2. **Effect** — quantified Δ on a measured signal (HRV, RHR, clarity, sharpness, confidence, PRS) vs the user's own 30-day baseline.
3. **Magnitude** — `%Δ` + sample size `n`.
4. **Recovery window** — days for the signal to return to ±5% of baseline (when computable).
5. **Confidence tier** (two-tier):
   - `strong`: `n ≥ 5` AND `|Δ| ≥ 15%` (numeric) OR `≥ 1.0 tier` (1–5 scales)
   - `emerging`: `n ≥ 3` AND `|Δ| ≥ 10%` (numeric) OR `≥ 0.5 tier`
   - Anything below `emerging` is dropped, not softened.

#### 3.1.2 Cards / lenses & UI tabs

The card currently exposes **two top-level tabs** — Stress Load and Burnout Risk. Sleep Disruption and Recovery Cost are computed silently and reserved for a follow-up.

**Stress Matrix** (Stress Load tab)
- Per event window, peak HR delta. `peakHr = max(wearable_data.hr_samples whose t ∈ [event.start, event.end])`. `restingBaseline = mean(resting_heart_rate over the window)`. Cell value = `peakHr − restingBaseline` (bpm).
- Cells with no overlapping samples are **omitted** — not proxied with a day-max.
- Coral ramp `#FAECE7 → #4A1B0C` driven by intensity.

**Burnout Matrix** (Burnout Risk tab)
- 4 dimensions × 5 weeks: `load`, `rhr`, `hrv`, `sleep`. Each mapped to 1–5 intensity.
- Per-dim color: load `#D85A30`, rhr `#EF9F27`, hrv `#534AB7`, sleep `#185FA5`. Opacity = `0.1 + (level/5) * 0.9`.
- `cardTrajectory` derived from worst-dim direction.
- `bannerCopy` is the only sentence the UI shows; no formulas, no weights.

**Latent lenses (computed, not rendered yet)**
- **C — Sleep → Decision Quality:** `wearable_data.sleep_score | total_sleep_minutes` (tertile-bucketed) → next-day morning check-in + `brief_snapshots.score` (PRS).
- **D — Recovery After Heavy-Day Streaks:** top-third daily calendar load → runs of ≥2 → PRS / HRV on day-after-run vs non-heavy non-tail baseline.

**Suppressed inputs:** coach signals, manually-typed wins, mood text, correlations without recovery context (`mem://features/coach/suppression-standard`).

#### 3.1.3 Honest empty states
- No calendar → "Connect calendar to unlock".
- <5 wearable days → "Need 5+ wearable days — currently X".
- No `sleep_score` → "Connect Apple Health sleep tracking".
- <7 check-ins → "Need 7+ check-ins — currently X".
- Nothing clears thresholds → "Patterns are still forming — keep checking in."

Preview / no-auth: falls back to `MOCK_CAUSALITY_PAYLOAD` so the card demos.

#### 3.1.4 Audit / gaps — this is the priority card

- ✅ Best-in-class scientific contract. Recovery window + sample size + confidence tier is rare in the category.
- ❌ **Inconsistent render shape.** Stress Load is a heatmap of events × intensity; Burnout Risk is a dim × week heatmap. Users have to learn two grammars on one card. Recommend a **unified finding card** shape (one row = Cause → Effect → n + tier + recovery), with the heatmap as a secondary "see the data" drawer.
- ❌ **Cause attribution is single-source.** A pre-board-meeting sleep deficit and the board meeting itself both spike HR; today they're attributed to the meeting. Recommend a joint regression or at minimum a "co-occurring contributor" tag when `sleep_score < 70` AND meeting is in top-third load.
- ⚠️ **Sample density gates everything.** Two-tier confidence is correct, but most CEOs will live in `emerging`. Consider exposing `n` and "X more sessions to upgrade to strong" as a first-class line in the card.
- ⚠️ **Day-max HR is not the cleanest stress proxy.** Adding `meanHr − restingBaseline` and `time_above_threshold_min` as alternative magnitudes would let us distinguish "spike" from "sustained load".
- ⚠️ **No practice causality.** Lens E candidate: `sanctuary_events.completed × HRV / outcome change`. Same engine, different cause column. See §11.6.
- ⚠️ **No cross-card linking.** A finding "Board meetings cost 12% HRV (n=6, strong)" should deep-link into the corresponding event in Plan or Calendar. Pure UI add.

---

### 3.2 Mind Readiness Rhythm — `PerformanceRhythmCard`

Reference: `mem/features/insights/level-trend-calendars.md`. Backend: `performance-rhythm-insights` + per-dim `level-trend-calendar`.

#### 3.2.1 Sub-elements

| Sub-element | Signal | Source |
|---|---|---|
| Energy Trend calendar | `outcome` (Focused/Steady/Scattered/Drained/Overloaded → 5..1) per slot | `daily_checkins.outcome` + `time_window` |
| Clarity Trend calendar | 1–5 per slot | `daily_checkins.clarity_level` |
| Sharpness Trend calendar | 1–5 per slot | `daily_checkins.mental_sharpness_level` |
| Confidence Trend calendar | 1–5 per slot | `daily_checkins.confidence_level` |
| 3×7 "How You Show Up" heatmap | mean composite per (Morning/Afternoon/Evening × Mon–Sun) | uses stored `time_window` (NOT UTC-derived hours) |
| Best Readiness Window | highest avg `composite_score` per cell | `inner_readiness_scores` |
| Rhythm Signals v3.1 | top 3 prioritised | 4-series miner across Energy / Clarity / Sharpness / Confidence; types: `peak-window`, `low-window`, `peak-day`, `low-day`, `consecutive-neg`, `consecutive-pos`, `cell-peak` |
| Calendar Insight | lightweight inline correlation | calendar events × outcome |
| Cause-Effect Insight | lightweight inline correlation | behavior → outcome |

**Palette** (also used by check-in outcome buttons + Energy Trend dots):

| Level | Outcome | Color | Dark |
|---:|---|---|---|
| 5 | Focused | `#3d6fa8` | `#2f5685` |
| 4 | Steady | `#7ba87a` | `#5f8a5e` |
| 3 | Scattered | `#d4b75a` | `#b89a3f` |
| 2 | Drained | `#e88a52` | `#c76d38` |
| 1 | Overloaded | `#d8553f` | `#b03d2a` |

Width-pinning is self-healing via ref callback + `ResizeObserver` — do not regress to a one-shot `useEffect` (known tab-switch race).

#### 3.2.2 Audit / gaps — user's central question

The user asked: *"can a wearable-layered version of the same card be available?"*

**Today:** the four trend calendars and the 3×7 heatmap are **entirely self-report** (`daily_checkins`). Wearable data is present in the DB and consumed by Causality + Trajectory, but it is not surfaced on the Rhythm card.

**Recommended evolution (advisory, not built)**

Three layers, sharing the same calendar grammar:

1. **Felt layer (today)** — Energy / Clarity / Sharpness / Confidence from check-ins.
2. **Body layer (new)** — HRV (z-score vs 30d baseline), RHR (delta vs baseline), Sleep Score, computed per local day from `wearable_data`. Same Mon–Sun calendar; tier scale 1–5 derived from quintiles of the user's own baseline.
3. **Convergence layer (new)** — per slot, whether felt and body agree:
   - **Aligned** (both peak / both low)
   - **Masking high** (felt peak, body low) — the most actionable executive signal
   - **Recovery underway** (felt low, body recovering)

UI: a single tab strip on top of the rhythm card — `Felt | Body | Both`. Cells render with the same palette but a small wearable glyph in the corner when the cell is body-sourced. Honest empty per layer.

This is **additive** — it reuses `wearable_data` columns already standardised in `mem://integrations/wearable/database-schema-standard` and the divergence vocabulary already encoded in MRS v3 (`SUPPLY_DEMAND_GAP`, `RECOVERY_UNDERWAY`, `LIGHT_DAY_STRONG_STATE`). No new EF required; extend `performance-rhythm-insights` with a `body` projection.

**Other gaps**
- ⚠️ Rhythm Signals v3.1 reads compelling but is hidden mid-card; promote to a top "Signal of the week" line.
- ⚠️ Best Window is one number — would benefit from "your Best Window is Tuesday afternoon **AND** your highest-stakes meetings sit there 4 of 5 weeks" calendar overlay.
- ⚠️ The four 1–5 dims have not yet been validated for orthogonality on real data; consider an internal-only PCA pass before adding a 5th.

---

## 4. Backend — Edge Functions

| Function | Lines | Auth | Caller | Cache | Purpose |
|---|---:|---|---|---|---|
| `state-patterns-insights` | 721 | `verifyAuth0JWT` | `Insights.tsx` (`fetchStatePatterns`) | none | Trajectory + archetype + friction + coach insights |
| `cause-effect-engine` | 1,603 | `verifyAuth0JWT` | `PerformanceCausalityCard` | `causality_findings` (24h, `ENGINE_VERSION=3`) | Stress matrix + burnout matrix + 4 latent lenses |
| `performance-rhythm-insights` | 1,174 | `verifyAuth0JWT` | `PerformanceRhythmCard` | none | 3×7 grid + best window + rhythm miner |
| `tiny-wins-insights` | 436 | `verifyAuth0JWT` | `Insights.tsx` | none | Wins themes + dimensions + optional LLM observation |
| `level-trend-calendar` | 120 | `verifyAuth0JWT` | `LevelTrendCalendar` (per dim) | none | Per-slot 1–5 levels for Clarity/Sharpness/Confidence/Energy |
| `learn-checkin-patterns` | 137 | `authenticateRequest` | background only | n/a | Feeds `coach_pattern_observations` |
| `insights-semantic-analysis` | 708 | `verifyAuth0JWT` | **suppressed** | none | Theme bubbles + relationships — kept for future revival |
| `generate-energy-insight` | 121 | `verifyAuth0JWT` | Brief (not Insights) | n/a | Single-line energy LLM observation |
| `generate-dashboard-insight` | 84 | `verifyAuth0JWT` | Homepage (not Insights) | n/a | Single-line dashboard LLM observation |

### 4.1 Upstream tables read by `state-patterns-insights` (12 parallel queries)

| Table | Columns |
|---|---|
| `profiles` | `user_archetype, component_scores, mental_fitness_baseline, growth_priority` |
| `daily_checkins` | `checkin_date, outcome, energy_balance, clarity_level, confidence_level, created_at, state_tags` |
| `daily_themes` | `theme_phrase, theme_driver` |
| `user_coach_insights` | `insight_content, created_at, insight_type, is_active` |
| `sanctuary_events` | `category, event_type, timestamp, context_data` |
| `daily_ritual_completions` | `session_period, completion_status, ritual_date` |
| `tiny_wins` | `win_date` |
| `wearable_data` | `hrv, summary_date` |
| `dialogue_sessions` | `id` (then `dialogue_messages` scoped by these IDs) |
| `calendar_connections` | `is_active` |
| `behavior_logs` | `behavior_type, created_at` |
| `inner_readiness_scores` | `composite_score, energy_tier, full_context_statement, divergence_flag, layers_active, score_date` |

### 4.2 Upstream tables read by `cause-effect-engine`
`calendar_events`, `wearable_data` (`hrv, resting_heart_rate, heart_rate, sleep_score, total_sleep_minutes, hr_samples (jsonb)`), `daily_checkins`, `brief_snapshots`. Writes only `causality_findings`.

### 4.3 Upstream tables read by `performance-rhythm-insights`
`daily_checkins`, `calendar_connections`, `calendar_events`, `behavior_logs`, `inner_readiness_scores`, `daily_ritual_completions`, `dialogue_sessions` → `dialogue_messages` (scoped), `jit_preferences`, `wearable_data`. **No writes.**

### 4.4 Why server-derived everywhere
Per `mem://architecture/mastery-plan-server-side-derivation` and `mem://security/proprietary-logic-protection`: archetype resolution, friction math, two-tier causality gating, and rhythm signal prioritisation must not live client-side. DEV branches are *shape stubs* only.

---

## 5. Database — Read & Write Map

**Read-only on the Insights surface**
`profiles`, `daily_checkins`, `daily_themes`, `daily_ritual_completions`, `sanctuary_events`, `tiny_wins`, `wearable_data` (incl. `hr_samples jsonb`), `calendar_connections`, `calendar_events`, `behavior_logs`, `inner_readiness_scores`, `brief_snapshots`, `user_coach_insights`, `dialogue_sessions → dialogue_messages` (scoped per `mem://security/auth0-dialogue-message-scoping-standard`), `coach_pattern_observations`, `jit_preferences`.

**Written by Insights stack**
- `causality_findings` — cache-write only, by `cause-effect-engine` (service role; RLS deny-by-default).

No other Insights surface writes user data.

---

## 6. Auth, RLS, Service-Role

- All Insights EFs authenticate via `verifyAuth0JWT` (one uses `authenticateRequest`).
- Tables are RLS deny-by-default. Insights EFs use the **service-role client** because Auth0 `sub` cannot satisfy `auth.uid()` (`mem://security/rls-auth0-access-protocol`).
- `dialogue_messages` is always scoped via the user's own `dialogue_sessions.id` set, then `.in('session_id', sessionIds)` — never raw `eq('user_id', …)`.
- `causality_findings`: RLS enabled, no policies — service-role only.

---

## 7. Caching, Performance, Resilience

| Layer | Mechanism | TTL |
|---|---|---|
| Per-day persistent cache | `persistentBriefCache` keys `insightsData(uid,date)` / `insightsScriptDone(uid,date)` | midnight rollover |
| Causality findings | DB row in `causality_findings`, `ENGINE_VERSION` gated | 24h |
| Edge timeouts | `withTimeout(15000ms)` per call | request |
| Mock fallback | `MOCK_CAUSALITY_PAYLOAD` | preview / no-auth only |
| Tab content | Both tabs always mounted | — |

Known race-condition fix: `LevelTrendCalendar` width pinning via ref callback + `ResizeObserver`. Do not revert.

---

## 8. Suppressed / Removed (and why)

| Component(s) | Why removed | Replacement |
|---|---|---|
| `InnerWorldBubbles`, `SemanticBubbles`, `PsychologicalDimensionBubbles` | Cognitively heavy; not actionable | Causality lenses |
| `CalendarStateCorrelations`, `BehaviorOutcomeCorrelations` | Single-table correlations without recovery context | Causality Lens A/B |
| `EnergyRhythm`, `EnergyRhythmCurve`, `WeeklyRhythmHeatmap` | Multiple takes on the same data | 3×7 grid + Best Window in Rhythm card |
| `FrictionAndStrengthDetail`, `BaselineReferenceCard` | Split executive summary | Folded into `LeadershipPatternsCard` |

Deleting these reclaims ~3,500 LOC and one 708-line EF.

---

## 9. Cross-Surface Dependencies (don't break these)

- **Smart Nudges** deep-link `/insights?highlight=consecutive_low|recovery_deficit`. `data-highlight` / `data-highlight-alt` on the Progress tab container are a public contract (`mem://features/notifications/smart-nudges-mvp-framework`).
- **Homepage** `InsightProgressCard` reuses `WeeklyRitualStreak` — keep visually in sync with `DailyShowUpCalendar`.
- **Weekly insights email** consumes `mindRhythmPatterns.all` (`performance-rhythm-insights`) and `Finding.longText` (`cause-effect-engine`). Don't strip these "unused" fields — they're consumed off-app.
- **Brief** uses `brief_snapshots.score` (PRS) which Causality reads.
- **Coach** signals are excluded from causality (`mem://features/coach/suppression-standard`) but included by `state-patterns-insights`.

---

## 10. Full Signal Inventory (single reference table)

Every signal currently consumed by the Insights surface, where it lives, and which card reads it.

| Signal | Source table | Owner EF | Read by |
|---|---|---|---|
| `outcome` | `daily_checkins` | rhythm, causality, state-patterns | Energy Trend, 3×7, Trajectory, Practice Eff |
| `energy_balance` | `daily_checkins` | state-patterns | Trajectory |
| `clarity_level` | `daily_checkins` | rhythm, state-patterns, level-trend | Clarity Trend, Trajectory |
| `mental_sharpness_level` | `daily_checkins` | rhythm, level-trend | Sharpness Trend |
| `confidence_level` | `daily_checkins` | rhythm, state-patterns, level-trend | Confidence Trend, Trajectory |
| `emotion_level`, `pressure_level`, `regulation_level` | `daily_checkins` | direct | Performance Streaks |
| `state_tags` | `daily_checkins` | state-patterns | Trajectory |
| `time_window` | `daily_checkins` | rhythm | 3×7 heatmap (NOT derived from UTC) |
| `checkin_date` | `daily_checkins` + `daily_ritual_completions` | direct | Did You Show Up |
| `ritual_date`, `session_period`, `completion_status` | `daily_ritual_completions` | state-patterns | Trajectory (Recalibration, Renewal) |
| `category, event_type, timestamp, context_data` | `sanctuary_events` | state-patterns + direct | Trajectory + Practice Effectiveness |
| `theme_phrase, theme_driver` | `daily_themes` | state-patterns | Trajectory (themes, clarity penalty) |
| `insight_content, insight_type, is_active` | `user_coach_insights` | state-patterns | Trajectory Lean-On / Watch-For |
| `dialogue_messages.content` (scoped) | `dialogue_sessions → dialogue_messages` | state-patterns, rhythm | Trajectory keyword scan |
| `hrv, resting_heart_rate, sleep_score, total_sleep_minutes, sleep_efficiency` | `wearable_data` | state-patterns, causality | Trajectory (HRV trend), Causality (sleep + burnout matrix) |
| `hr_samples jsonb` | `wearable_data` | causality | Stress matrix per-event peak |
| `composite_score, energy_tier, divergence_flag` | `inner_readiness_scores` | rhythm | Best Window, divergence overlay |
| `start_time, end_time, attendees_count, title, event_metadata` | `calendar_events` | causality, rhythm | Stress matrix, Calendar insight |
| `is_active` | `calendar_connections` | state-patterns, rhythm | coverage flags |
| `score (PRS)` | `brief_snapshots` | causality | Sleep → PRS (Lens C, latent) |
| `behavior_type` | `behavior_logs` | state-patterns, rhythm | Clarity penalty, cause-effect inline |
| `tiny_wins (win_date, growth_signal, agency_type, regulation_level, content)` | `tiny_wins` | tiny-wins-insights | Your Momentum |
| `component_scores, user_archetype, mental_fitness_baseline` | `profiles` | state-patterns | Trajectory baseline & archetype |

---

## 11. Audit & Recommendations (no code changes here — advisory)

### 11.1 What we're **not** currently assessing that could be added

1. **Pre/post-practice physiology** — `wearable_data.hr_samples` already supports it (§2.4.3 A). Best ROI of any addition.
2. **Practice → outcome causality** — Lens E in `cause-effect-engine` with same contract as Lens A. Would let "Box Breathing recovers your HRV 8% within 10m (n=6, strong)" sit *next to* the cost findings.
3. **Calendar architecture insights** — composition of the week (deep-work block share, back-to-back ratio, meeting cadence). Lives entirely in `calendar_events` — no new ingestion.
4. **Travel impact** — `travel_state` × HRV / outcome on departure / arrival / +1 / +2 days. The data is there; no card surfaces it today.
5. **Decision pattern from check-ins** — using `state_tags` to identify recurring contexts the user names ("after the leadership call", "before board prep"). Pure aggregation.
6. **Recovery velocity** — average time to return to baseline HRV after a top-third load day. Single number per user, evolves slowly, deeply CEO-relevant.
7. **Wearable adherence** — % of last 30 days with HRV + sleep samples. Confidence multiplier for every other card.

### 11.2 Cause & Effect — consistency recommendation

Today the card mixes two grids (event-spike heatmap vs dim×week burnout heatmap). Recommend a single **Finding row** as the atomic UI unit, with the heatmap as an optional drill-down:

```
┌──────────────────────────────────────────────────────────┐
│ ⚠ Board Mondays cost you 12% HRV         emerging · n=4 │
│   Recovers in 2 days on average                          │
│   See the data ▾                                          │
└──────────────────────────────────────────────────────────┘
```

- Same shape whether the cause is an event, a sleep tier, a streak, or a practice.
- Always exposes `n`, confidence tier, and recovery window.
- The current Stress Load and Burnout Risk grids become "See the data" expansions, not the primary surface.

### 11.3 Mind Readiness Rhythm — evolution layers

See §3.2.2. Three layers (Felt / Body / Both) sharing one grammar. Reuses existing schema. No new EF.

### 11.4 Sequential card unlock (UX, no scoring change)

User feedback: *"don't want to see the full insights page in full go with empty charts; prefer cards unlock as I do more"*.

Recommended unlock ladder (the *tier* already exists at §1.4; today it doesn't gate visibility — proposing it should):

| Tier | Triggered by | Cards visible | Locked cards shown as |
|---|---|---|---|
| `baseline` | 0 check-ins | Did You Show Up only | "Your first check-in unlocks your first pattern" hero |
| `early` | 1–2 check-ins | + Performance Streaks (Peak/Friction emerging) | Trajectory shown as locked tile with single-line teaser |
| `summary` | 3 check-ins | + Trajectory (Lean-On / Watch-For; bars hidden until tier `deepening`) | Causality shown as locked tile |
| `deepening` | 4–6 check-ins | + Rhythm Felt layer | Causality + Practice Eff locked tiles |
| `full` | ≥7 check-ins (and ≥5 wearable days where applicable) | + Causality + Practice Effectiveness | none |

Pattern: **never show an empty chart**. Show either (a) a real value, or (b) a locked tile with a tiny progress bar and the exact action that unlocks it ("3 more morning check-ins"). This is consistent with `mem://constraints/forbidden-loading-copy`.

### 11.5 Wearable mirror for Performance Streaks

Add a third row "Body" alongside Peak / Friction:
- HRV peak days (top quintile vs personal baseline)
- HRV floor days (bottom quintile)

Same visual grammar (thumbs / counter). Resets monthly. Gracefully hidden without wearable.

### 11.6 Practice Effectiveness — proposed contract

- Single card, max 3 lines (§2.4.3 B).
- Two evidence types: **HRV/HR shift** (wearable-backed) and **next-day outcome** (self-report). Never blended on one line.
- Two-tier confidence (`strong` / `emerging`), identical to Causality.
- Drill-down (drawer) shows per-protocol breakdown with the same row shape.

### 11.7 What's safe to delete now
- All "suppressed" components in §8. ~3,500 LOC.
- `insights-semantic-analysis` EF (708 LOC) — only the suppressed Mind Map consumes it.
- DEV duplicates of scoring math (replace with thin fixtures).

---

## 12. UX / UI Recommendations — iOS-native lens

Written as if a senior UX/UI designer is reviewing the page for an iOS shipping bar.

### 12.1 Information hierarchy

Today: scroll = chronology of build decisions. Recommend scroll = **executive narrative**:

1. **You today** — Did You Show Up + a single one-line "where you stand" (already computed by Trajectory).
2. **You this week** — Performance Streaks + Rhythm signal of the week (promoted from inside the Rhythm card).
3. **You over time** — Trajectory + Rhythm calendars.
4. **What's costing you** — Causality.
5. **What's restoring you** — Practice Effectiveness.
6. **Your momentum** — Tiny Wins, last by design (reward closer).

The two-tab `Progress | Patterns` split is not pulling its weight — most cards belong to both stories. Recommend collapsing to a **single scroll** with section headers, plus a sticky "jump to" pill (Today · Week · Trends · Costs · Restores · Wins).

### 12.2 iOS-native primitives to lean on

- **Large title + scroll-collapse** (`UINavigationBar` large title behaviour) for the page header — Apple-grade vertical rhythm and frees vertical pixels on scroll.
- **Section headers in SF Pro Semibold 13pt, all-caps tracking** — already aligned with our minimalist exec aesthetic.
- **Card chrome:** continuous corner-radius 16 on iPhone (matches the system app-icon curvature) with `systemBackground` material and 0.04 separator hairlines. No drop shadows on iOS.
- **Haptics:** `UIImpactFeedbackGenerator(.soft)` on tab change, `.success` on streak confetti — give the page a tactile signature.
- **Pull-to-refresh** revalidates the silent fetchers (today these run only on mount).
- **Live activities / widgets** (out of scope but obvious next): Did You Show Up streak as a Home Screen widget; Rhythm Signal of the Week as a Smart Stack rotation.

### 12.3 Typography

- Title: SF Pro Display Semibold 28/34.
- Card title: SF Pro Display Semibold 17/22.
- Metric: SF Pro Rounded Medium 32/36 (tabular figures so deltas don't jitter).
- Body: SF Pro Text Regular 15/20.
- Sub / caption: SF Pro Text Regular 12/16 in `secondaryLabel`.

### 12.4 Color & state

- Keep the locked palette (§3.2.1) — it is the page's signature.
- Use **fill, not text color**, for tier semantics. Red text against white is over-loud; a small fill chip carries the same meaning at a calmer volume.
- Dark mode: invert the chrome, keep the tier palette identical (already specified per `mem://brand/color-palette/tier-traffic-light-tokens`).

### 12.5 Motion

- Card reveal: 200ms ease-out fade + 8pt rise. No bouncing.
- Numbers: animate from 0 to value over 600ms ease-out **only on first reveal of the session**. On subsequent renders, snap to value.
- Confetti: keep, but cap to once-per-day per threshold.

### 12.6 Empty / locked tiles

Replace empty charts with a 96pt tall **locked tile**:

```
┌──────────────────────────────────────────────┐
│ 🔒 Cause & Effect                            │
│ 4 more check-ins and 2 more wearable days    │
│ ▓▓▓▓▓▓░░░░  60%                              │
└──────────────────────────────────────────────┘
```

Locked tiles are tappable → opens the relevant action (check-in flow, wearable connect). This is the single biggest UX lift available on the page.

### 12.7 Sharing

Each card already has `ShareCardButton`. iOS-native: present `UIActivityViewController` with a pre-rendered 1080×1920 image. Default share copy should be **one finding line**, not a full screenshot — finding-as-shareable is the brand differentiator.

---

## 13. File / Function Index

### Pages
- `src/pages/Insights.tsx` (1,164) — shell, tabs, hydration, suppressed semantic path.
- `src/pages/InsightDetail.tsx` — per-card detail route (Leadership / Rhythm / Causality / Practice Effectiveness).

### Live components (`src/components/insights/`)
- `DailyShowUpCalendar.tsx` (202)
- `PerformanceStreaks.tsx`
- `LeadershipPatternsCard.tsx` (528)
- `PerformanceCausalityCard.tsx` (523) + `causalityMockData.ts`
- `PerformanceRhythmCard.tsx` (1,515)
- `LevelTrendCalendar.tsx`
- `PracticeEffectiveness.tsx` (594)
- `LuxuryInsightCard.tsx`, `LuxuryProgressRing.tsx`, `InsightInfoModal.tsx`, `ProgressiveUnlockMessage.tsx`, `LockedInsightSection.tsx`, `ShareCardButton.tsx`, `InsightSummaryRow.tsx`, `InnerReadinessDial.tsx`, `StreakWreath.tsx`

### Suppressed (delete candidates)
`BaselineReferenceCard`, `BehaviorOutcomeCorrelations`, `CalendarStateCorrelations`, `EnergyRhythm`, `EnergyRhythmCurve`, `FrictionAndStrengthDetail`, `InnerWorldBubbles`, `SemanticBubbles`, `PsychologicalDimensionBubbles`, `WeeklyRhythmHeatmap`.

### Edge functions
`state-patterns-insights` (721), `cause-effect-engine` (1,603), `performance-rhythm-insights` (1,174), `tiny-wins-insights` (436), `level-trend-calendar` (120), `learn-checkin-patterns` (137, background), `insights-semantic-analysis` (708, suppressed), `generate-energy-insight` / `generate-dashboard-insight` (consumed by Brief / Homepage).

### Memory anchors
- `mem://features/insights/performance-causality` — Cause & Effect contract (locked).
- `mem://features/insights/level-trend-calendars` — Trend calendar palette/scale (locked).
- `mem://features/insights/progress-tab-v2` — Show-Up calendar; PRS in `brief_snapshots`; confetti at 3/7-day streaks.
- `mem://features/coach/suppression-standard` — coach signals excluded from causality.
- `mem://architecture/mastery-plan-server-side-derivation` — server-derived signals rule.
- `mem://security/proprietary-logic-protection` — algorithms in EFs only.
- `mem://security/rls-auth0-access-protocol` — service-role pattern.
- `mem://security/auth0-dialogue-message-scoping-standard` — `dialogue_messages` scoping.
- `mem://ux/loading/cached-render-and-silent-verification` — loading model.
- `mem://integrations/wearable/database-schema-standard` — canonical wearable columns.
- `mem://architecture/signal-engine/checkin-pattern-aggregator` — shared aggregator powering Rhythm + Pills.
- `docs/MRS_V3_SPECIFICATION.md` — baseline/refined scoring + divergence vocabulary used in §3.2.2.

---

## 14. What "good" looks like for the next iteration

1. **Sequential unlock** (§11.4) — biggest UX win, zero scoring change.
2. **Unify Causality card to the Finding row** (§11.2) — make every CEO finding visually identical.
3. **Rhythm Body layer** (§3.2.2) — wearable-backed mirror of the Felt grid.
4. **Practice Effectiveness pre/post HRV** (§2.4.3) — the user's central ask; data is already in `wearable_data.hr_samples`.
5. **Delete suppressed code** (§8 / §11.7) — ~40% of `src/components/insights/` and one EF.
6. **iOS-native chrome pass** (§12) — locked tiles, single-scroll narrative, haptics, widgets.

End of document.