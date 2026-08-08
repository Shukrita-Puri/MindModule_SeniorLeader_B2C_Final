# Insights Feature — Full Audit (2026-08-08)

Audit only. No code was changed.
Scope: every Insights card, its upstream data, its edge function, its gates, real beta-user coverage, downstream consumers, and an MVP + cascaded-unlock recommendation.

---

## 0. Headline findings

1. **"What Restores Your Performance" is structurally starved.** `content-feedback → GET_PRACTICE_IMPACT` counts practice completions from `sanctuary_events`. That table's **last row is 2026-04-24** (153 rows, 12 users). The live completion ledger is `daily_ritual_completions` (405 rows, 18 users, current to today). The main plan player (`src/pages/MicroPracticePlayer.tsx`) never calls `trackSanctuaryEvent`. So the card can effectively never reach its own `n≥3` unlock for any current user. **This is the single biggest break.**
2. **HR × Event correlation — the card CEOs love — is real, computed correctly, but only fires for 1 of 37 users.** `performance_lift.hr_event_lift` is non-empty for exactly one account (shukrita, 2 event types, n=3, `hrDeltaBpm` 9–10). Everyone else: `[]`.
3. **`event_to_hrv` is empty for 100% of users.** Every `lensReasons.A` reads "Classified N event type(s); none cleared the threshold yet". The HRV-based drain lens has never once produced a finding in production. HR-per-event-window (the newer v6 path) *does* work — HRV-per-event does not and should be retired.
4. **`cause-effect-engine` has no cron.** It only computes when a user opens the card (cached one row per user per view-day). Latest row for the richest user is **2026-07-30 — 9 days stale**. `smart-nudges` reads that same `signal_summary`, so nudges can cite weeks-old patterns.
5. **`hr_samples` coverage is the real constraint on the drains/perform-best cards.** Only 5 users have any minute-level HR at all; only 3 have meaningful volume (shukrita 32 days, emilyisaac 35, emily.isaac@sky 30). `itsmanojkdev` has 14 days but `max_samples = 1` — a single sample/day, useless for event-window peaks.
6. **~40% of `src/components/insights/` is dead code** (12 components, ~2,500 lines, zero importers) and 4 feature flags are hard-`false`. The page is far smaller than the codebase implies.
7. **The stress heatmap renders mostly empty cells even for the best user.** shukrita's `stressMatrix.n` grid across Mon–Fri × 7 buckets contains a total of 10 events; most cells are `null`. Honest, but it looks broken.

---

## 1. What is actually on the page today

`/insights` renders a Progress tab + Patterns tab of summary rows; taps deep-link to `/insights/:cardId` (`InsightDetail.tsx`).

| Surface | Component | Live? |
|---|---|---|
| Inner Readiness Dial | `InnerReadinessDial.tsx` | ✅ |
| Performance Streaks | `PerformanceStreaks.tsx` | ✅ |
| Your Performance Trajectory | `LeadershipPatternsCard.tsx` | ⚠️ detail route only — summary row suppressed (`SHOW_TRAJECTORY_SUMMARY_ROW=false`) |
| When You Perform Best | `PerformanceRhythmCard.tsx` | ✅ |
| What Drains Your Performance | `PerformanceCausalityCard.tsx` | ✅ |
| What Restores Your Performance | `PracticeEffectiveness.tsx` | ✅ (but starved — see §0.1) |
| Your Momentum (Tiny Wins) | inline in `Insights.tsx` | ❌ `SHOW_MOMENTUM_LUXURY_CARD=false` + `TINY_WINS_ENABLED=false` |
| Daily Show-Up Calendar | `DailyShowUpCalendar.tsx` | ❌ `SHOW_DAILY_SHOW_UP_CALENDAR=false` |
| Mind Map / Semantic bubbles | `SemanticBubbles`, `InnerWorldBubbles`, `PsychologicalDimensionBubbles` | ❌ removed from UI; `insights-semantic-analysis` still deployed |

**Dead code, zero importers:** `BaselineReferenceCard`, `BehaviorOutcomeCorrelations`, `CalendarStateCorrelations`, `EnergyRhythm`, `EnergyRhythmCurve`, `FrictionAndStrengthDetail`, `InnerWorldBubbles`, `LockedInsightSection`, `LuxuryProgressRing`, `PsychologicalDimensionBubbles`, `SemanticBubbles`, `WeeklyRhythmHeatmap`.

---

## 2. Upstream / downstream map (data lineage)

### 2.1 What Drains Your Performance
- **Component:** `PerformanceCausalityCard.tsx:681` → `cause-effect-engine`
- **Engine:** `supabase/functions/cause-effect-engine` (`ENGINE_VERSION = 6`)
- **Upstream tables:**
  - `wearable_data.hr_samples` (jsonb `[{t,v}]`) — peak HR inside `[event.start_time, event.end_time]`
  - `wearable_data.resting_heart_rate` — 30-day mean = baseline (needs ≥3 valid days)
  - `wearable_data.hrv / sleep_score / total_sleep_minutes` — burnout matrix dims
  - `calendar_events` (title, start/end, attendees_count) → classified via `_shared/events/event-classifier.ts` into A–H taxonomy
  - `daily_checkins` / `brief_snapshots` for PRS
- **Cell formula:** `peakHr − restingBaseline` (bpm). If no `hr_samples` overlap the window the cell is **omitted** (no day-max proxy — deliberate honesty rule).
- **Persistence:** `causality_findings` (`pattern_kind='cause_effect_v2'`), one row per user per compute-day.
- **Gates:** `n≥3` emerging / `n≥5` strong; Δ≥10% / ≥15%; `hasWearable = wearable.length ≥ 5`.
- **Downstream readers:** `smart-nudges/index.ts:1184` (`loadPatternSummary`), `:4842` (pattern_alert nudge deep-linking to `/insights/performance-causality`), `:5832` (`ctx.pattern`); `performance-rhythm-insights/index.ts:118`; `generate-mastery-plan` (references `causality_findings`).

### 2.2 When You Perform Best
- **Component:** `PerformanceRhythmCard.tsx:1105` → `performance-rhythm-insights`
- **Engine reads:** `daily_checkins`, `calendar_events`, `calendar_connections`, `behavior_logs`, `inner_readiness_scores`, `daily_ritual_completions`, `dialogue_sessions/messages`, `jit_preferences`, `wearable_data` — **plus** `causality_findings.signal_summary.performance_lift` written by `cause-effect-engine`.
- **Blocks:** `hr_event_lift`, `category_lift`, `subcategory_lift`, `sleep_to_peak`, `rhr_recovery_window`, `recovery_streak_to_peak`.
- **Also embeds:** `LevelTrendCalendar` → `level-trend-calendar` (pure read-through of `daily_checkins`; no persistence).
- **Gates:** `GATE_REASON_COPY` table (7 nights sleep, 7 days RHR, etc.).
- **Downstream:** none — terminal display surface.

### 2.3 What Restores Your Performance
- **Component:** `PracticeEffectiveness.tsx:93` → `content-feedback` action `GET_PRACTICE_IMPACT`
- **Upstream tables:**
  - `sanctuary_events` — **the only source of "a practice happened"** ⚠️ dead since 2026-04-24
  - `content_relevance_feedback` (star ratings, 90d) — 139 rows / 9 users, live to 2026-08-07 ✅
  - `daily_checkins` (`clarity_level`, `mental_sharpness_level`, `confidence_level`) — before/after composite
  - `wearable_data` (`hrv`, `resting_heart_rate`) — next-morning delta, **morning sessions only**
  - `user_favorites`, `sanctuary_content`
- **Does it truly measure practice impact with wearables?** Partially, and weakly:
  - Self-declared: prior check-in vs next check-in composite (clarity/sharpness/confidence) → the main "restores" number.
  - Wearable: only `HRV (next AM)` and `RHR (next AM)`, only for practices completed in the morning window, comparing day-of vs day-after **daily summary** values. There is **no intra-day pre/post HR measurement around the practice itself**, even though `hr_samples` now exists and is exactly the right signal for that.
  - Server uses `getUTCHours()` to bucket window — wrong for non-UTC users, misclassifies morning sessions.
- **Gates:** row locked at `sessions < 3`; "strong" at `≥5`; card stage early/building/deepening at 3/10 practices; physiology rows need `n≥2`.
- **Downstream:** none.

### 2.4 Your Performance Trajectory
- `LeadershipPatternsCard.tsx:356` → `state-patterns-insights`; also direct reads of `brief_snapshots`, `daily_checkins`, `daily_themes`, `profiles(user_archetype, component_scores)`. Detail-route only. No downstream.

---

## 3. Beta-user reality check (live DB, 37 profiles / 21 flagged beta)

Data volume, top accounts:

| user | check-ins | wearable days | days w/ HR samples | calendar events | ritual completions | sanctuary events |
|---|---|---|---|---|---|---|
| shukrita@mindmodule.me | 247 | 67 | 32 | 133 | 169 | 78 (all pre-Apr) |
| itsmanojkdev@gmail.com | 128 | 16 | 14 (max 1 sample/day) | 13 | 68 | 16 |
| emilyisaac484@gmail.com | 15 | 59 | 35 | 45 | 13 | 0 |
| emily.isaac@sky.com | 10 | 51 | 30 | 29 | 2 | 0 |
| joydeepcha75@gmail.com | 10 | 75 | 0 | 0 | 44 | 7 |
| richert.lisa@gmail.com | 14 | 0 | 0 | 33 | 23 | 0 |
| fsteiner.uk@gmail.com | 13 | 0 | 0 | 58 | 6 | 6 |

Latest `causality_findings` per user (17 users have any row at all):

| user | computed | engine v | `event_to_hrv` | `hr_event_lift` | `sleep_to_peak` |
|---|---|---|---|---|---|
| shukrita | 2026-07-30 | 6 | 0 | **2** | null |
| itsmanojkdev | 2026-07-20 | 6 | 0 | 0 | n=4, Δ1.2% |
| emilyisaac484 | 2026-07-14 | 6 | 0 | 0 | n=3, Δ16.2% |
| richert.lisa | 2026-06-08 | 6 | 0 | 0 | null |
| whirlwind84 / mannan / s.echeverria | ≤2026-06-04 | 6 | 0 | 0 | null |
| 10 others | Apr–May | **0** (never re-ran on v6) | 0 | 0 | null |

**Interpretation:**
- 10 of 17 users still hold `version 0` payloads — they haven't opened the card since the v6 rewrite, and nothing recomputes for them.
- `event_to_hrv`: **0 across the board, always.** Dead lens.
- `hr_event_lift`: 1 user. `rhr_recovery_window`, `recovery_streak_to_peak`: 0 users. `sleep_to_peak`: 2 users.
- `recoveryByEvent` is absent from every payload.
- Empty/near-empty upstream tables: `energy_snapshots` (0 rows), `session_feedback` (0 rows), `behavior_logs` (dead since 2026-04-22), `tiny_wins` (dead since 2026-05-03), `practice_reflections` (16 rows / 2 users, dead since 2026-05-04), `mental_fitness_scores` (dead since 2026-06-16).
- `brief_snapshots.user_rating`: 0 of 2,286 rated — the feedback loop on briefs is unused.

**Bottom line: not one beta user currently sees a fully-formed Drains or Restores card.** Only "When You Perform Best" partially forms, and only for 2–3 accounts.

---

## 4. Root causes, ranked

| # | Issue | Root cause | Fix shape |
|---|---|---|---|
| 1 | Restores card can never unlock | `content-feedback` counts from dead `sanctuary_events`; live ledger is `daily_ritual_completions.completed_practice_ids` | Repoint the completion source; backfill from ritual completions |
| 2 | Practice impact isn't measured physiologically | Only day-level next-AM HRV/RHR, morning-only | Use `hr_samples` for intra-day pre/post HR around the practice timestamp — the data now exists |
| 3 | Window bucketing wrong for non-UTC users | `getUTCHours()` in `content-feedback` | Use the user's timezone (already resolved elsewhere via `tz-to-country`) |
| 4 | HR × Event forms for 1 user | `hr_samples` coverage (5 users), plus `n≥3` per *subtype* across a 30-day window fragments a busy calendar into 16 buckets of 1–3 events | Aggregate at **category A–H** first, subtype only when it clears; widen window to 60–90 days |
| 5 | `event_to_hrv` never fires | HRV is a daily morning signal — structurally cannot attribute to a single event | Retire the lens; HR-per-window replaces it |
| 6 | Stale patterns power nudges | No cron for `cause-effect-engine`; lazy compute on card view | Add a nightly cron for active users, same pattern as `build-executive-home-cards-morning` |
| 7 | 10 users stuck on v6-incompatible payloads | Version bump doesn't force recompute for non-visitors | Cron in #6 resolves it |
| 8 | Heatmap looks broken | Cells omitted when no `hr_samples`; most cells null | Render category-level rollup as the default view, subtype grid as a drill-in |
| 9 | Codebase noise | 12 dead components, 4 hard-`false` flags, 3 orphaned edge functions (`insights-semantic-analysis`, `tiny-wins-insights`, plus `level-trend-calendar` used only nested) | Delete or archive |

---

## 5. MVP recommendation — keep 4, cut the rest

**Keep (in priority order):**

1. **What Drains Your Performance — HR × Event correlation.** This is the differentiator. But ship it as: *category-level* (A–H) HR delta list first, subtype drill-in second, heatmap grid third. Drop the burnout-risk tab from MVP (4 synthetic dims × 5 weeks is hard to trust and impossible to act on).
2. **When You Perform Best.** Keep `sleep_to_peak` and `category_lift`; these are the two blocks that actually form. Drop `rhr_recovery_window` and `recovery_streak_to_peak` (0 users, ever).
3. **What Restores Your Performance** — but only after fixing #1–#3 in §4. Its value proposition (does the practice actually move my physiology?) is the natural counterpart to Drains, and with `hr_samples` it can finally be true rather than self-reported.
4. **Progress tab: Inner Readiness Dial + Performance Streaks + Show-Up calendar.** Cheap, always forms, drives return visits. Re-enable `DailyShowUpCalendar` — it needs only `daily_checkins`.

**Cut / archive:**
- Tiny Wins / Your Momentum (`tiny_wins` dead since May)
- Semantic Mind Map (`insights-semantic-analysis` — never invoked in prod)
- Burnout Risk tab, Sleep Disruption matrix, Recovery Cost timeline (computed, never rendered, never validated)
- `event_to_hrv` and `event_to_rhr` lenses
- Your Performance Trajectory as a standalone card — its archetype/friction content belongs on MRS, not Insights
- All 12 dead components

---

## 6. Cascaded unlock model (recommended)

Today unlock is per-block and invisible: the user sees "Awaiting…" with no sense of progress or of what to do. Recommend an explicit **4-stage ladder**, shown as a progress rail at the top of Insights, with each stage naming its own unlock condition.

| Stage | Unlocks | Requirement | Rationale |
|---|---|---|---|
| **Day 1 — Baseline** | Show-Up calendar, Inner Readiness dial, Streaks | 1 check-in | Something on day one; no empty page |
| **Stage 2 — Rhythm** (~day 7) | *When You Perform Best* → time-of-day + day-of-week blocks | 7 check-ins across ≥5 distinct days | Pure check-in maths; no integrations needed |
| **Stage 3 — Physiology** (~day 14) | *What Drains You* → category-level HR deltas; `sleep_to_peak` | wearable connected + ≥10 days with `hr_samples` + ≥10 classified calendar events | The integration ask lands *after* the user has felt value |
| **Stage 4 — Causation** (~day 21–30) | *What Restores You*; subtype drill-in; strong-confidence labels | ≥5 logged practices with a paired before/after; ≥3 occurrences per event subtype | The hardest claim requires the most evidence |

Design rules:
- Every locked card shows **the specific next action and the remaining count** ("3 more mornings of Apple Health to unlock event drain patterns"), never a generic "not enough data".
- Confidence is always visible: `emerging (n=3)` vs `strong (n≥5)`.
- Never invent a conclusion to fill a slot. The existing "honest omission" rule in `cause-effect-engine` is correct and should be preserved.
- Stage state should be persisted server-side (an `insights_stage` projection) so nudges can say "you're one day from unlocking X" — currently smart-nudges has no visibility into unlock progress at all.

---

## 7. Downstream consumer summary

| Producer | Store | Consumer | File |
|---|---|---|---|
| `cause-effect-engine` | `causality_findings.signal_summary` | `smart-nudges` pattern alerts | `smart-nudges/index.ts:1184, 4842, 5832` |
| `cause-effect-engine` | `causality_findings.signal_summary.performance_lift` | `performance-rhythm-insights` | `performance-rhythm-insights/index.ts:118` |
| `cause-effect-engine` | `causality_findings` | `generate-mastery-plan` | grep hit, shallow usage |
| `content-feedback` | none (computed live) | UI only | — |
| `state-patterns-insights` / `level-trend-calendar` / `tiny-wins-insights` / `insights-semantic-analysis` | none | UI only (2 of 4 disabled) | — |

No JIT selector, Brief, MRS or executive-home surface reads any Insights output. Insights is a near-terminal branch — `smart-nudges` is its only real downstream customer, and it is reading stale data.
