# Executive Home — Single Source of Truth (MRS · Brief · Plan)

**Scope:** This document is the single, authoritative reference for the three
cards rendered on the Executive Home screen — **Mental Readiness Score (MRS)**,
**Performance Readiness Brief**, and **Mastery Plan**. It supersedes scattered
notes in:

- `docs/MRS_V3_SPECIFICATION.md`
- `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md` / `..._LLM_PROMPT.md`
- `docs/GENERATE_MASTERY_PLAN_SSOT.md`
- `docs/MASTERY_PLAN_CONTEXT_LOGIC.md`
- `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md`
- `docs/CEO_BEHAVIOUR_RULE_MAP.md`
- `docs/SHARED_MODULES_DELEGATION_AUDIT.md`
- `docs/WEEK_AHEAD_TRIGGER_VERIFICATION.sql`

Where this document and those documents disagree, **this document wins**,
because it has been reconciled against the live code in `supabase/functions/`
and `src/`. Anything outside the three Executive Home cards (Onboarding,
Sanctuary, Coach, Connected Data, Notifications) is intentionally out of scope.

The end goal is to drive all three cards from **one centralised cron pipeline**
that fires three times on a regular working day and adapts to weekends / PTO /
holidays using existing shared-module rules.

---

## 1. Card Inventory & Frontend Entry Points

| Card | Component | Hook(s) | Edge function consumed | Persisted to |
|---|---|---|---|---|
| Mental Readiness Score | `MentalReadinessCard` (`src/components/home/`) | `useMentalReadiness`, `useMrsWindow` | `compute-inner-readiness` | `daily_context_snapshot` (`mrs_*` columns), `mental_fitness_scores` |
| Performance Readiness Brief | `DecisionReadinessBrief` (`src/components/home/`) | `useReadinessBrief`, `useBriefSnapshot` | `compute-outer-readiness` (orchestrator) | `brief_snapshots`, `daily_context_snapshot` |
| Mastery Plan (Today + Week Ahead) | `TodayThreePriorities`, `WeekAheadPriorities` | `useMasteryPlan`, `useWeekAheadMode` | `generate-mastery-plan` + `list-week-ahead-priorities` | `mastery_plan_snapshots`, `weekly_plan_snapshots`, `jit_event_context` |

All three cards read from **`daily_context_snapshot`** as their shared substrate.
The snapshot is the only intermediary between batch compute and the UI; the
cards never recompute scores on the client.

---

## 2. Data Sources (Inputs)

### 2.1 Wearable (Oura primary, Apple Health secondary)
- Table: `wearable_data` (HRV, RHR, sleep_score, sleep_quality, total_sleep_minutes, summary_date).
- Ingestion: `oura-sync-fanout` (hourly cron `7 * * * *`) → `oura-sync` → `wearable_data` upsert.
- Freshness contract: `wearable_status ∈ {fresh, stale, missing}` resolved in `compute-inner-readiness` using `summary_date >= today - 1` for *fresh*.
- 30-day HRV baseline read by `compute-outer-readiness` and `compute-inner-readiness` (`physComposite` calc).

### 2.2 Calendar (Google primary, Outlook, Apple via mobile)
- Tables: `primary_calendar_events`, `calendar_connections`, view `web_primary_calendar_events` (`security_invoker=true`).
- Ingestion: `sync-calendar-scheduled` (`*/30 * * * *`), `refresh-calendar-tokens` (`*/10 * * * *`), webhook `register-calendar-watch`.
- Merge/dedupe through `_shared/rules/calendarEvents.ts` + `calendar-merge.ts`.
- Classification + enrichment through `_shared/events/event-classifier.ts`, `enrich-event.ts`, `event-phase-map.ts`, `event-categories.ts`.

### 2.3 Check-ins / Mind Check-in (MRS v3 dimensions)
- Table: `daily_checkins` columns: `outcome`, `clarity_level`, `emotion_level`, `pressure_level`, `regulation_level`, `energy_balance`, `time_window`, `checkin_date`.
- Three windows per day: `morning | afternoon | evening` (the `time_window` column is canonical).
- Used directly by MRS refined-score path and by the Brief's "felt-state" framing layer.

### 2.4 Window Contexts (derived inputs)
- Built by `_shared/signal-engine/morning-context.ts`, `afternoon-context.ts`, `evening-context.ts`.
- All three return the same `WindowContext` shape (`window-context-types.ts`) composed via `window-context.ts → buildWindowContext()`.
- Inputs pulled: yesterday/today/tomorrow events, last 7-day check-in pattern, last 7-day wearable trend, CEO-behaviour flags (high-stakes count, back-to-back, deep-work blocks, travel, post-peak).

### 2.5 CEO-behaviour rule modules (`_shared/ceo-behaviour/*`)
- Each module exports a pure detector (e.g. `back-to-back`, `high-stakes-prep`, `travel`, `post-peak`, `pto-holiday`, `weekend`, `conference`, `deep-work`, `decision-density`, `upward-reporting`, `visibility-comms`, `influence-persuasion`, `interpersonal`, `multi-calendar`, `delivery`, `empty-slot`, `workweek`).
- Registered in `_shared/ceo-behaviour/index.ts`. Plan + Brief + MRS-context all invoke them through that registry — **no card may reimplement these rules inline**.

### 2.6 Strategic / coach context (read-only into the three cards)
- `user_coach_insights`, `coach_memory_index`, `coach_accountability_tracker`, `coach_pattern_observations`, `coach_breakthrough_moments` — read by the Brief for tone/lean-on and by Plan for accountability nudges.
- `causality_findings`, `event_priority_memory`, `event_priority_derived`, `attendee_relationships` — read by Plan for event-priority scoring.

### 2.7 Profile / preferences
- `profiles`: `archetype`, `component_scores`, `practice_priority_tag`, `pressure_context_tag`, `email`, `timezone_offset`.

---

## 3. Shared Modules Used By All Three Cards

| Module | Used by | Purpose |
|---|---|---|
| `_shared/signal-engine/build-daily-context.ts` | Brief, Plan, MRS write-back | `upsertDailyContextSnapshot()`, `composeDailyContext()` — single writer for `daily_context_snapshot`. |
| `_shared/signal-engine/window-context.ts` + morning/afternoon/evening | All three | Builds the three windowed context payloads. |
| `_shared/signal-engine/mrs-v4-subscores.ts` / `mrs-v4-weights.ts` / `mrs-v4-compose.ts` | MRS (authoritative), Brief (reads `bandValence`/`band`), Plan (reads `band` to bias practice difficulty) | MRS v4 baseline composer (§3 + §8.3 redistribution + §3.2a sleep cap). |
| `_shared/signal-engine/divergence-flag.ts` | MRS, Brief | Computes `ALIGNED / SUPPLY_DEMAND_GAP / RECOVERY_UNDERWAY / INTRADAY_DECLINE`. |
| `_shared/signal-engine/demand-scorer.ts` | MRS, Plan | `computeCalendarDemand()` → demand score 0–100. |
| `_shared/signal-engine/pattern-engine.ts` | MRS, Brief | HRV / RHR 3-day trend detection. |
| `_shared/signal-engine/strategic-context.ts` | Brief, Plan | Resolves `practice_priority_tag` + commitments + recent coach insights. |
| `_shared/signal-engine/day-kind-detector.ts` | All three | Classifies the day as `regular | light | weekend | pto | holiday | travel | conference`. |
| `_shared/ceo-behaviour/*` | All three (via registry) | Boolean detectors for CEO archetype day-shape. |
| `_shared/events/event-classifier.ts` + `enrich-event.ts` + `event-phase-map.ts` | Brief, Plan | Canonical event taxonomy + phase mapping. |
| `_shared/rules/calendarEvents.ts` + `calendar-merge.ts` | Brief, Plan | Calendar dedupe / multi-calendar merge. |
| `_shared/executive-state-taxonomy.ts` | Brief | `selectLeadEvent()` — picks the headline event. |
| `_shared/brief-prompt-version.ts` | Brief | Pins LLM prompt version for cache invalidation. |
| `_shared/anthropic.ts` + `anthropic-smoke.ts` | Brief, Plan ("Why" lines) | Claude / Lovable-AI text callers. |
| `_shared/auth.ts` | All three | Auth0 JWT verification (`sub` claim is canonical user id). |
| `_shared/plan/day-of-horizon.ts` | Plan | Strict 24h horizon (prevents Sunday → Saturday leak). |
| `_shared/plan/*` (event selection, JIT bridge) | Plan | Event prioritisation pipeline. |

No card may bypass these modules. Any new rule must be added inside the relevant shared module first.

---

## 4. Card 1 — Mental Readiness Score (MRS v4)

### 4.1 Edge function
`supabase/functions/compute-inner-readiness/index.ts`

### 4.2 Inputs (required)
- `mrsWindow ∈ morning | afternoon | evening` — **required**; the function returns `400 mrs_v4_inputs_required` if missing.
- `mrsSubScores: SubScore[]` — required, non-empty.
- `wearableHRV`, `wearableBaseline`, `sleepScore`, `sleepHours`, `rhrTrend`/`rhrElevated`, `hasWearable`, `wearableStatus`.
- `clarityLevel`, `emotionLevel`, `pressureLevel`, `regulationLevel`, `hasCheckIn`, `checkInOutcome` (MRS v3 dims).
- `demandScore`, `calendarLoad`, `highStakesCount`, `consecutiveStreak`, `patternSignals`, `hrvPatternContext`.
- `morningBaselineScore` (afternoon/evening only) — anchor for `INTRADAY_DECLINE`.
- `sleepDeficitMeasurement`, `decisionLeakageRisk`, `bodyLoadElevated`, `intradayHrDeviationPct`.

### 4.3 Scoring pipeline
1. **Sub-component scores** per window from `mrs-v4-subscores.ts`.
2. **Window-aware weights** from `mrs-v4-weights.ts`:
   - Morning: overnight wearable dominant (HRV/Sleep/RHR).
   - Afternoon: adds intraday HR deviation + decision-leakage signal.
   - Evening: adds tomorrow's pressure + body-load.
3. **Composer** `composeBaselineV4` → `{ baseline, weightProvenance, awaitingSignals }` after §8.3 missing-component redistribution and §3.2a measured-low sleep cap.
4. **Refined score** = baseline ⊕ Mind Check-in dims, hard-capped at `baseline ± 15` (`computeRefinedScore`).
5. **Gating (V4 product rule, 21 Jun 2026):** Refined ("Full Read") requires **fresh wearable AND a check-in**. If `wearableStatus !== 'fresh'`, the function forces `readinessState='baseline'` and `scoreRefined=null`.
6. **Awaiting state:** when sub-scores are insufficient the composer returns `awaitingSignals=true`; the function returns `score=null`, `tier='managing'`, `bandLabel='Awaiting signals'`.
7. **Tier + band** derived from `displayedScore` via `getEnergyTier`, `getEnergySubTier`, `resolveBand` (band SSOT — Brief and Plan **must read `band` / `bandValence` from the MRS response**, never re-derive).
8. **Divergence flag**: highest-priority MRS-side flag is `INTRADAY_DECLINE` (afternoon/evening with morning anchor).
9. **Tier cap** (`deriveTierCap`) applies the v3 soft-guard.

### 4.4 Outputs (response surface)
`score, tier, subTier, band, bandLabel, bandValence, contextStatement, layer3Statement, layersActive, divergenceFlag, hrvDeviation, dataSources, wearableStatus, confidence, timeOfDay, checkInOutcome, tierLabel, alreadyUsed[], weightingMode, demandStateScore, patternScore, physComposite, tierDisplayed, tierDisplayedLabel, tierCapReason, scoreBaseline, scoreRefined, readinessState, refinedContribution, mindWeights, mrsWindow, weightProvenance, mrsAwaitingSignals`.

### 4.5 DB writes
- `daily_context_snapshot` (`mrs_*` columns) via `upsertDailyContextSnapshot`.
- `mental_fitness_scores` (historical timeseries).

### 4.6 Reads
`wearable_data`, `daily_checkins`, `primary_calendar_events`, `profiles`, `daily_context_snapshot` (prior window for morning anchor).

---

## 5. Card 2 — Performance Readiness Brief

### 5.1 Edge function
`supabase/functions/compute-outer-readiness/index.ts` (orchestrator; writes `brief_snapshots`).

### 5.2 Pipeline
1. Build / fetch the active `WindowContext` (`buildWindowContext`).
2. Read MRS surface from `daily_context_snapshot` — **must** include `band`, `bandValence`, `readinessState`, `wearableStatus`. Brief never recomputes MRS.
3. Build `signalPills[]` via the v4 contract with `sourceTypes`, `isScoreBearing`, `freshness`, `hiddenReason`. Invariant: `wearableFresh=false` → all pills `tier='neutral'`, `isScoreBearing=false`, and the frontend suppresses `(Refined)` badges.
4. Resolve strategic context (`resolveStrategicContext`): commitments, coach insights, lead event (`selectLeadEvent`).
5. Classify and enrich today's events (`classifyEvent`, `enrichEvent`, `phaseForEvent`).
6. Compose the LLM prompt (version pinned by `BRIEF_PROMPT_VERSION`).
7. Two-model cascade:
   - Primary: Google Gemini Flash via `callLovableAIText`.
   - Fallback: Claude Sonnet via `callClaudeText`.
8. Validate & cache: write to `brief_snapshots` with `delivered=1` once a UI render is confirmed (powers the side-panel "Past Briefs" history).

### 5.3 Mode contract
- `briefMode ∈ { fullRead | earlyRead | awaiting }` derived from `wearableStatus` + `hasCheckIn` + `mrsAwaitingSignals` (see `brief-mode-contract.test.ts`).
- Awaiting copy is the unified string from `src/constants/awaitingSignals.ts`.

### 5.4 Tables read
`wearable_data`, `daily_checkins`, `primary_calendar_events`, `daily_context_snapshot`, `brief_snapshots`, `profiles`, `user_coach_insights`, `coach_memory_index`, `coach_accountability_tracker`, `coach_pattern_observations`, `coach_breakthrough_moments`, `coach_session_summaries`, `sanctuary_events`, `travel_state`, `daily_themes`.

### 5.5 Tables written
`brief_snapshots`, `daily_themes` (today theme upsert), `daily_context_snapshot` (band + brief metadata mirror).

---

## 6. Card 3 — Mastery Plan

### 6.1 Edge functions
- `supabase/functions/generate-mastery-plan/index.ts` — Day-of plan (today's three priorities).
- `supabase/functions/list-week-ahead-priorities/index.ts` — Sunday Week-Ahead; persists `weekly_plan_snapshots`.
- `supabase/functions/evaluate-week-ahead-mode/index.ts` — Routes UI between day-of and Week-Ahead (Sunday-only).

### 6.2 Day-of pipeline (Bridge → JIT)
1. Strict 24h horizon enforced via `_shared/plan/day-of-horizon.ts`. Saturday plans **cannot** anchor to Sunday events.
2. Pull `daily_context_snapshot` for the active window (MRS band, demand, pattern, day-kind).
3. Day-kind routing via `day-kind-detector.ts`:
   - `weekend / pto / holiday` → light-day playbook (no Coach/tiny-win synthetics — they were removed; Plan must not synthesize "Brief coaching check-in" / "Evening reflection").
   - `travel / conference` → travel split via `_shared/ceo-behaviour/travel.ts`.
   - `regular` → standard three-priority pipeline.
4. Event candidates pulled from `primary_calendar_events`, deduped through `calendarEvents.ts`, classified, enriched, phase-mapped, then scored by the JIT bridge using `jit_event_context` (primary), with legacy `event_priority_derived` as fallback.
5. Final three priorities chosen deterministically (no LLM for selection).
6. "Why" lines + tiny-win copy generated by Claude/Lovable-AI under the verified prompt; missing model → deterministic fallback strings.

### 6.3 Week-Ahead pipeline (Sunday)
1. `evaluate-week-ahead-mode` returns `weekAheadDecision` based on weekday + user time zone + presence of Mon–Fri events.
2. `list-week-ahead-priorities` selects up to 5 high-leverage Mon–Fri events using the **same** event-selector + JIT bridge as the day-of plan (no weaker legacy logic).
3. Persists to `weekly_plan_snapshots` (one row per ISO week per user).
4. Sunday Week-Ahead is hidden from Saturday by horizon rule.
5. On Mon–Fri, day-of plan reads `weekly_plan_snapshots` as **soft memory** (annotations only — never overrides today's selection).

### 6.4 Tables read
`profiles`, `daily_context_snapshot`, `primary_calendar_events`, `wearable_data`, `daily_checkins`, `causality_findings`, `jit_event_context`, `event_priority_memory`, `event_priority_derived`, `attendee_relationships`, `weekly_plan_snapshots`, `user_favorites`, `daily_ritual_completions`, `content_relevance_feedback`, `user_coach_insights`, `coach_accountability_tracker`, `practice_sessions`, `sanctuary_content`, `sanctuary_content_metadata`, `travel_state`, `calendar_connections`.

### 6.5 Tables written
`mastery_plan_snapshots`, `weekly_plan_snapshots` (Week-Ahead path), `jit_event_context` (upsert), `jit_shadow_v2_runs` (telemetry), `daily_context_snapshot` (plan summary mirror).

---

## 7. The Shared Substrate — `daily_context_snapshot`

`daily_context_snapshot` is the **only** table touched by all three cards. It holds one row per `(user_id, snapshot_date, window)`.

- **Writer:** `_shared/signal-engine/build-daily-context.ts :: upsertDailyContextSnapshot` — called by all three edge functions.
- **Composer:** `composeDailyContext` consolidates `morning|afternoon|evening` contexts and the MRS surface into the canonical shape.
- **Readers:** All three UI hooks, plus downstream Coach / Compass / Smart Nudges.

Columns (non-exhaustive, scoped to Executive Home):

- `mrs_score`, `mrs_baseline`, `mrs_refined`, `mrs_band`, `mrs_band_label`, `mrs_band_valence`, `mrs_window`, `mrs_weight_provenance`, `mrs_awaiting_signals`, `mrs_readiness_state`, `mrs_tier_displayed`, `mrs_tier_cap_reason`.
- `brief_text`, `brief_mode`, `brief_lead_event_id`, `brief_signal_pills`, `brief_prompt_version`, `brief_generated_at`.
- `plan_priorities`, `plan_day_kind`, `plan_horizon_iso`, `plan_week_ahead_decision`, `plan_generated_at`.
- `wearable_status`, `has_checkin`, `calendar_load`, `high_stakes_count`, `day_kind`, `divergence_flag`, `practice_priority_tag`.

---

## 8. Day-Shape & Window Schedule

### 8.1 Window definition (per user, user-local time)
| Window | Trigger time (local) | Inputs unlocked |
|---|---|---|
| Morning | 05:00 | Overnight wearable, today's calendar, last-night sleep, prior-day check-in |
| Afternoon | 12:00 | + Intraday HR deviation, decision-leakage signal, morning anchor (`morningBaselineScore`) |
| Evening | 18:00 | + Tomorrow's pressure, body-load, today's completed practices |

### 8.2 Day-shape adjustments (via `day-kind-detector` + `ceo-behaviour/*`)
| Day shape | Detector | Effect on the 3-card pipeline |
|---|---|---|
| Regular working day | default | Run all 3 windows. |
| Weekend (Sat) | `ceo-behaviour/weekend.ts` | Run **morning only**. Day-of plan uses light-day playbook. Sunday Week-Ahead **must not** leak to Saturday. |
| Weekend (Sun) | `weekend.ts` | Morning only + Sunday Week-Ahead Plan branch (`list-week-ahead-priorities`). |
| PTO | `ceo-behaviour/pto-holiday.ts` | Morning only; Brief uses recovery tone; Plan suppresses work events. |
| Public holiday | `pto-holiday.ts` | Same as PTO. |
| Travel day | `ceo-behaviour/travel.ts` | All 3 windows but with travel split; Plan uses travel playbook. |
| Light day (no high-stakes, demand<30) | derived in `day-kind-detector` | Morning + evening only (afternoon skipped). |
| Conference | `ceo-behaviour/conference.ts` | All 3 windows; CEO-behaviour overlays applied. |

The detector is run **once at the head of the cron** and the resulting `dayKind` is written to `daily_context_snapshot.day_kind` so every downstream call agrees.

---

## 9. Centralised Cron Pipeline (Target Architecture)

### 9.1 New orchestrator edge function
`supabase/functions/build-executive-home/index.ts` *(to be created — replaces the three independent invocations on the home screen and the existing per-card scheduled triggers).*

**Pseudocode:**
```ts
for each active user (with timezone) {
  const localNow = nowInTz(user.timezone)
  const window   = resolveWindow(localNow)        // morning|afternoon|evening|null
  const dayKind  = detectDayKind(user, localNow)  // shared module
  if (!shouldRunWindow(dayKind, window)) continue

  // 1. Build context (shared writer)
  const ctx = await buildWindowContext(user, window, dayKind)
  await upsertDailyContextSnapshot(user, ctx)

  // 2. MRS (authoritative band)
  const mrs = await invoke('compute-inner-readiness', mrsInputsFrom(ctx))

  // 3. Brief (reads MRS band, never recomputes)
  const brief = await invoke('compute-outer-readiness', briefInputsFrom(ctx, mrs))

  // 4. Plan — branch on dayKind + window
  if (dayKind === 'weekend-sun' && window === 'morning') {
    await invoke('list-week-ahead-priorities', { userId })
  } else {
    await invoke('generate-mastery-plan', {
      userId, window, dayKind,
      horizonIso: dayOfHorizon(localNow, dayKind),
    })
  }

  // 5. Mirror summaries back into daily_context_snapshot
  await upsertDailyContextSnapshot(user, { mrs, brief, plan })
}
```

### 9.2 pg_cron schedule (UTC)
Schedule the orchestrator at fine granularity; it self-gates per-user by local time + day-kind, so a single global schedule covers all timezones.

```sql
select cron.schedule(
  'build-executive-home-15m',
  '*/15 * * * *',
  $CRON$
  select net.http_post(
    url     := 'https://<project>.supabase.co/functions/v1/build-executive-home',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_anon_key')
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $CRON$
);
```

**Why 15-minute granularity?** Window boundaries (05:00 / 12:00 / 18:00 local) must fire within 15 min for every timezone offset. The orchestrator's per-user `resolveWindow` ensures each user is only computed **3× per regular workday** (or fewer for weekend/PTO/holiday/light).

### 9.3 Idempotency
- `daily_context_snapshot` row PK = `(user_id, snapshot_date, window)`. Re-runs upsert; downstream cards read the latest mirror.
- `brief_snapshots` keyed by `(user_id, window_started_at, brief_prompt_version)` so prompt-version bumps force regeneration.
- `mastery_plan_snapshots` keyed by `(user_id, plan_date, window)`.
- `weekly_plan_snapshots` keyed by `(user_id, iso_year, iso_week)`.

### 9.4 Deprecates / replaces
- Per-card client invocations from `useMentalReadiness`, `useReadinessBrief`, `useMasteryPlan` continue to **read** snapshots but no longer trigger compute on cold-cache except as a manual "Refine" action (which still calls the edge functions directly; the orchestrator path is the SoT).
- The existing 15-min `smart-nudges-every-15m` job is unrelated and stays.
- Any per-card scheduled job outside the four currently in `cron.job` should be removed in favor of `build-executive-home-15m`.

### 9.5 Observability
- `notification_evaluator_runs` / `notification_evaluator_traces` are the template — mirror this pattern with `executive_home_runs` / `executive_home_traces` so every orchestrator tick logs `(userId, window, dayKind, decisions, durations, errors)`.

---

## 10. Source-of-Truth Contracts (Invariants)

1. **Band is owned by MRS.** Brief and Plan must read `band` / `bandValence` from the MRS response or `daily_context_snapshot`. They must never call `resolveBand(score)` themselves.
2. **Full Read requires fresh wearable AND check-in.** Enforced in `compute-inner-readiness` (refined gate) and mirrored by `signalPills` invariant in `compute-outer-readiness` (`isScoreBearing=false` when `wearableFresh=false`). The frontend never renders `(Refined)` badges unless `isScoreBearing=true`.
3. **Awaiting copy is one string.** `src/constants/awaitingSignals.ts` is the only place that defines awaiting-state text. No double-dashes; em-dash only.
4. **Strict 24h horizon for day-of Plan.** `_shared/plan/day-of-horizon.ts` is mandatory; no edge function may filter events with its own cutoff.
5. **Sunday Week-Ahead is Sunday-only.** Routing decision lives in `evaluate-week-ahead-mode`. UI reads `weekAheadDecision` only — no client-side weekday math.
6. **Coach / tiny-win synthetics are removed from Plan.** Plan returns only real practice content from `sanctuary_content` + JIT bridge selections.
7. **Day-kind is computed once per window** and written to `daily_context_snapshot.day_kind`. All three cards read this value.
8. **Auth0 `sub` claim is the user id everywhere.** RLS policies now use `(auth.jwt() ->> 'sub')`. Edge functions verify via `_shared/auth.ts :: verifyAuth0JWT`.
9. **CEO-behaviour rules live in `_shared/ceo-behaviour/*` only.** No inlining in cards. The registry contract is enforced by `registry.contract.test.ts`.

---

## 11. Test & Verification Map

| Concern | Test file |
|---|---|
| MRS v4 composer | `_shared/signal-engine/mrs-v4-compose_test.ts` |
| Divergence flag | `_shared/signal-engine/divergence-flag.test.ts` |
| Demand scorer | `_shared/signal-engine/demand-scorer_test.ts` |
| Pattern engine (HRV/RHR trends) | `_shared/signal-engine/pattern-engine_test.ts` |
| Brief mode contract | `_shared/signal-engine/brief-mode-contract.test.ts` |
| Signal pills v4 invariants | `_shared/signal-pills-v4.test.ts` |
| Readiness labels | `src/utils/readinessLabels.test.ts` |
| Holiday/travel detection | `_shared/ceo-behaviour/holiday-travel-detection.test.ts` |
| Travel auto-derive | `_shared/ceo-behaviour/travel-day-autoderive.test.ts` |
| Travel load split | `_shared/ceo-behaviour/travel-load-split.test.ts` |
| CEO-behaviour registry | `_shared/ceo-behaviour/registry.contract.test.ts` |
| Week-Ahead trigger | `docs/WEEK_AHEAD_TRIGGER_VERIFICATION.sql` |

---

## 12. Open Items For Implementation

These are the engineering deltas required to land the centralised pipeline described in §9:

1. **Create** `supabase/functions/build-executive-home/index.ts` orchestrator.
2. **Create** migration adding `executive_home_runs` and `executive_home_traces` tables (mirror notification evaluator).
3. **Create** migration scheduling `build-executive-home-15m` via `pg_cron`.
4. **Extend** `daily_context_snapshot` columns listed in §7 if any are missing (audit current DDL before migrating).
5. **Update** `_shared/signal-engine/day-kind-detector.ts` to return the union type used in §8.2 (verify `light` and `conference` codes exist).
6. **Remove** any per-card cold-start triggers from the client hooks once the orchestrator is live; keep the on-demand "Refine" call path.
7. **Add** integration test that simulates one full day (3 windows) and asserts: one `daily_context_snapshot` per window, one `brief_snapshots` per window, one `mastery_plan_snapshots` per window on a regular weekday; `weekly_plan_snapshots` written on Sunday morning only.

---

_Last reconciled against code: this revision. When code changes in `compute-inner-readiness`, `compute-outer-readiness`, `generate-mastery-plan`, `list-week-ahead-priorities`, `evaluate-week-ahead-mode`, or any `_shared/signal-engine/*` / `_shared/ceo-behaviour/*` module, update this document in the same PR._
