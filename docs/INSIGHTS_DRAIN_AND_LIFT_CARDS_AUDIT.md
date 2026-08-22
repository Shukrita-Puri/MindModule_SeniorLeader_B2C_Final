# What Drains / What Restores Your Performance — data lineage and calculation audit

Written 22 Aug 2026. Reference document only; no code changes accompany it.

Scope: the two Insights pattern cards —

- **What Drains Your Performance** (`PerformanceCausalityCard`): Stress Load, Burnout Risk, Recovery Time
- **When You Perform Best** (`PerformanceRhythmCard`): Section A check-in rhythm, Section B physiology x demand lift

Everything below is read from the current source: `supabase/functions/cause-effect-engine/index.ts` (ENGINE_VERSION 12), `supabase/functions/performance-rhythm-insights/index.ts`, and `supabase/functions/_shared/signal-engine/checkin-pattern-aggregator.ts`.

---

## 1. Upstream clients (what feeds the cards)

| Source table | Columns used | Populated by | Used by |
|---|---|---|---|
| `calendar_events` | `title`, `start_time`, `end_time`, `attendees_count` | Google Calendar sync, iOS EventKit sync | Stress Load, Burnout (load dim), Recovery, Section B lift |
| `wearable_data` | `hr_samples` (jsonb `[{t,v}]`) | iOS HealthKit bridge / Capacitor health path via `persist-wearable-data` | Stress Load, Section B lift |
| `wearable_data` | `resting_heart_rate` | same | Stress Load baseline, Burnout RHR dim, Recovery |
| `wearable_data` | `hrv` | same + Oura | Burnout HRV dim, Recovery (lens A) |
| `wearable_data` | `sleep_score`, `total_sleep_minutes` | same | Burnout sleep dim, `sleep_to_peak` |
| `daily_checkins` | `clarity_level`, `emotion_level`, `pressure_level`, `regulation_level`, `time_window` | in-app check-ins | Section A rhythm patterns, lens B |
| `brief_snapshots` | PRS / readiness score | `compute-outer-readiness` | Section B composite lift, lens C/D |
| `event_priority_memory` | `event_subcategory` | user overrides + learning loop | subcategory rollup in Stress Load |

Event classification on every path goes through the single A–H resolver (`events/event-classifier.ts` → `classifyEvent`), with an attendee-count fallback. No card carries its own keyword list.

## 2. Downstream clients (who reads the output)

- `causality_findings` row per `(user_id, pattern_kind, computed_for_date)` holds the whole payload.
- `PerformanceCausalityCard` reads `stressMatrix`, `burnoutMatrix`, `recoveryByEvent`, `coverage`, `diagnostics`.
- `PerformanceRhythmCard` reads `performance_lift` (`hr_event_lift`, `category_lift`, `subcategory_lift`, `sleep_to_peak`, `rhr_recovery_window`, `recovery_streak_to_peak`).
- `smart-nudges` reads `signal_summary` only (`event_to_hrv`, `event_to_rhr`, `sleep_to_prs`, `consecutive_load`) and can deep-link to `/insights/performance-causality`.
- Nothing else recomputes these numbers client-side.

## 3. Data duration and gates

| Tab | Window | Minimum to unlock | Confidence tiers |
|---|---|---|---|
| Stress Load | 60 days (request can narrow to 14–90) | ≥5 days with intraday HR samples, ≥7 check-ins | emerging n≥3, strong n≥5 |
| Burnout Risk | last 5 calendar weeks (Mon–Sun) | ≥7 HRV days | none shown; cells are 1–5 intensity |
| Recovery Time | 60 days, 7-day post-event lookahead | ≥2 recovery samples per event type | inherited from lens A finding |
| Section B lift | 60 days | emerging n≥3 per bucket | emerging / strong |

Missing source behaviour: a cell with no overlapping HR samples is **omitted**, never back-filled with a day-max proxy. Historical days never gain retroactive samples.

## 4. Calculations

### 4.1 Stress Load (heart rate x events — no HRV anywhere)

ENGINE_VERSION 12 changes are in **bold**.

```text
resting baseline (per event) =
    mean(resting_heart_rate) over the 14 days immediately before the event date,
    falling back to 30 days, then to the whole-window mean
    (needs >= 3 readings in the chosen lookback)

per calendar event with start_time and end_time:
    samples = wearable_data.hr_samples for the event's local date
    if none -> event skipped
    **mean_hr = mean(v) for samples where start <= t <= end**
    **if event duration > 90 minutes, use only the first 45 minutes (focus window)**
    **if the focus window has fewer than 3 samples, fall back to the full window**
    **delta   = mean_hr - per-event trailing baseline**

cell(day-of-week, event category) = round(mean(all deltas in that bucket))
n                                  = number of contributing events
Peak / Quietest                    = extreme eligible cells (category needs n >= 3 overall)
Heaviest day                       = day-of-week with the highest mean cell value
```

Columns are the top 7 event types by number of distinct days they occur on. The subcategory line under the grid uses the same per-event maths rolled up to `(categoryId, subcategoryId`).

### 4.2 Burnout Risk

Four dimensions across the last five Mon–Sun weeks, each mapped to a 1–5 intensity:

- **Calendar load** — total scheduled minutes in the week, scaled 1–5 against that user's own max week.
- **RHR trend ↑** — weekly mean resting HR, expressed as deviation from the 5-week mean, centred at 3.
- **HRV trend ↓** — weekly mean HRV, inverted (lower HRV = higher intensity), needs ≥4 HRV days in the week.
- **Sleep deficit** — count of nights below the window's mean sleep score, scaled 1–5 against the worst week.

Per-dimension trajectory = last valid week minus first valid week (≥1.5 escalating, ≤−1.5 improving). Card trajectory = escalating if any dimension escalates; improving only if all four improve. The banner is the only sentence.

### 4.3 Recovery Time

Derived from lens A findings, not from HR samples:

```text
for each event type, compare event-day mean vs non-event-day mean of HRV and RHR
keep only harmful directions (HRV down, RHR up) that clear the confidence gate
recovery = for each event day, the first of the next 1..7 days where the signal
           returns within +/-5% of baseline; averaged (needs >= 2 samples)
```

The card shows the top 6 event types by recovery days, with the RHR delta in bpm.

### 4.4 When You Perform Best

- **Section A** — check-in rhythm mined by `checkin-pattern-aggregator` per dimension from its own column, expressed as "top band" rate by weekday and by time window. Observation guards: n≥3 per bucket and a ≥15pp gap before a sentence is emitted; capped at 3 sentences per section.
- **Section B** — positive-side physiology: per-subtype and per-category HR lift vs resting baseline plus same-day PRS lift, `sleep_to_peak` (high-sleep nights → next-day PRS), `rhr_recovery_window` (well-recovered days → best window), `recovery_streak_to_peak`.

## 5. Open questions and known weaknesses

Stated plainly rather than defended:

1. **Burnout Risk has no event attribution at all.** It is a four-signal weekly rollup. It never says which events, day types, or categories drove the risk, and the weekly unit is an editorial choice, not something derived from the data. If the intent is "what causes my burnout", the tab currently cannot answer it — it would need the Stress Load per-event bucket joined to the weekly dims.
2. **Burnout intensities are self-relative.** Every dimension is scaled against the same 5-week window, so a uniformly heavy five weeks still shows a mid-scale reading, and one extreme week compresses the others. There is no absolute reference.
3. **Stress Load is correlation, not causation.** Nothing controls for exercise, caffeine, travel, or a second meeting inside the same window. The 8 Aug flight/hotel rows in the verification dump below are exactly this: high peak HR during a travel block, not meeting stress.
4. **The resting baseline is a whole-window mean**, not a trailing pre-event baseline, so a drifting baseline flattens or inflates every delta equally.
5. **Weekend events are now included** (resolved 22 Aug 2026, ENGINE_VERSION 7). The engine previously bucketed Mon–Fri only and discarded Saturday and Sunday events before any maths. It now buckets a full Mon–Sun week with the identical per-event formula, so Israel/Gulf working weeks are represented — and for this account the Sat 15 Aug and Sun 9 Aug deltas now appear in the grid. Note this makes weakness 3 more visible: the Sunday rows are a flight and a hotel block, i.e. activity, not meeting stress.
6. **Recovery Time is HRV/RHR day-level**, while Stress Load is intraday HR. The two tabs therefore answer different questions on different granularities under one card.

## 6. Verification appendix — per-event dump

Read-only query over `calendar_events` joined to `wearable_data.hr_samples` for shukrita@mindmodule.me, 60-day window, reproducing the exact cell maths (`peak in window − resting baseline`). Resting baseline over the window: **76.9 bpm**.

| Date | Day | Event | Peak HR | Samples in window | Delta bpm |
|---|---|---|---|---|---|
| 2026-08-15 | Sat | Statue of Liberty and Ellis Island | 138 | 80 | +61.1 |
| 2026-08-13 | Thu | Chief AI Thursday connects | 124 | 10 | +47.1 |
| 2026-08-09 | Sun | Stay at DoubleTree by Hilton NY | 160 | 652 | +83.1 |
| 2026-08-09 | Sun | Flight to New York (BA 183) | 144 | 473 | +67.1 |
| 2026-08-07 | Fri | Chris / Shukrita — Chat | 96 | 6 | +19.1 |
| 2026-08-07 | Fri | chat with Denise | 87 | 12 | +10.1 |
| 2026-08-05 | Wed | Meeting Nav | 98 | 26 | +21.1 |
| 2026-08-03 | Mon | Catchup with Sophie for board role | 110 | 18 | +33.1 |
| 2026-07-16 | Thu | How To Claim R&D Tax Credits | 113 | 10 | +36.1 |
| 2026-07-16 | Thu | Chief AI Thursday connects | 95 | 12 | +18.1 |
| 2026-07-01 | Wed | Robinhood Presents: The World is Flat | 138 | 11 | +61.1 |
| 2026-06-25 | Thu | Chief AI Thursday connects | 88 | 12 | +11.1 |
| 2026-06-25 | Thu | Interview with EY CEO | 86 | 11 | +9.1 |

Reading of this dump:

- The maths reconciles: the on-screen Thu "+36" style cells are means of rows like these, and the numbers are heart rate throughout — HRV never enters the Stress Load path.
- Only 13 events in 60 days have HR samples overlapping their window, so most cells are legitimately empty. Sample density is the binding constraint, not the formula.
- The three largest deltas are a sightseeing day, a hotel stay block and a flight — long multi-hour windows where peak HR reflects physical activity. A duration cap or an activity-aware exclusion would make the card materially more honest.
- Two of those three fall on Sat/Sun and are currently discarded by the engine.
