# What Restores Your Performance — data lineage and calculation audit

Written 23 Aug 2026. Reference document only; no code changes accompany it.

Scope: the Insights card **What Restores Your Performance** (`PracticeEffectiveness`), its detail route `/insights/practice-effectiveness`, and its single data owner, the `GET_PRACTICE_IMPACT` action inside `supabase/functions/content-feedback/index.ts`.

Everything below is read from the current source: `src/components/insights/PracticeEffectiveness.tsx` (card v4), `supabase/functions/content-feedback/index.ts`, `src/pages/Insights.tsx`, `src/pages/InsightDetail.tsx`.

Companion document: `docs/INSIGHTS_DRAIN_AND_LIFT_CARDS_AUDIT.md` (the two negative/rhythm cards). This card is the positive counterpart — it answers "what did I do that helped", not "what cost me".

---

## 1. Upstream clients (what feeds the card)

| Source table | Columns used | Populated by | Used for |
|---|---|---|---|
| `sanctuary_events` | `content_id`, `category`, `timestamp`, `event_type` in (`completed`, `session_complete`) | practice player completion, Mastery Plan slot completion | session counts, every before/after pairing, window + day-of-week buckets |
| `content_relevance_feedback` | `content_id`, `star_rating`, `trigger_context`, `created_at`, `feedback_type = 'star_rating'` | post-practice and post-plan rating prompts | thumbs-up rate, composite score boost |
| `daily_checkins` | `clarity_level`, `mental_sharpness_level`, `confidence_level`, `timestamp`, `checkin_date`, `time_window` | in-app check-ins | the whole self-report delta (before vs after) |
| `wearable_data` | `hrv`, `resting_heart_rate`, `summary_date` | HealthKit bridge via `persist-wearable-data`, Oura | next-morning physiology rows |
| `sanctuary_content` | `id`, `title`, `category` | content library | row titles and category subtitles |
| `user_favorites` | `content_id` | favouriting in the library | star glyph + 1.1x composite multiplier |

Note: `user_favorites` is queried **without a `user_id` filter** in the edge function — it relies on RLS, but the function runs with the service role, so this read is not user-scoped. See §6.1.

Plan practices are not a separate table: any `content_id` beginning with `plan-` is treated as a Mastery Plan row and gets the `Daily plan` badge.

## 2. Downstream clients (who reads the output)

- `src/pages/Insights.tsx` renders the card inline in the **Patterns** tab and links to `/insights/practice-effectiveness`.
- `src/pages/InsightDetail.tsx` lazy-loads the same component for the full-card / share view.
- Nothing else consumes `GET_PRACTICE_IMPACT`. It does not feed Brief, Plan, Smart Nudges, or JIT selection. The practice-recommendation weights used by the Mastery Plan are a separate path and do not read this payload.
- The payload is **not persisted**. There is no cache row; every card mount is a live recompute.

## 3. Request contract

The component invokes:

```ts
supabase.functions.invoke('content-feedback', {
  headers: { Authorization: `Bearer ${auth0Token}` },
  body: { action: 'GET_PRACTICE_IMPACT', lookbackWindow: 'all_time' },
});
```

`lookbackWindow` only controls the **session-count** window:

| Window | Applies to | Value |
|---|---|---|
| `all_time` (what the card sends) | `sanctuary_events` completions | since 2020-01-01 |
| `thirty_days` (function default, unused by this card) | `sanctuary_events` completions | last 30 days |
| fixed | `content_relevance_feedback`, `daily_checkins`, `wearable_data` | last **90 days**, always |

So session counts are lifetime, while every measured delta is bounded to the last 90 days. `windowDays: 30` is returned in the payload but is vestigial — nothing reads it and it does not describe the actual delta window.

## 4. Duration and gates

| Element | Window | Minimum to unlock | Confidence tiers |
|---|---|---|---|
| Summary line "Most effective" | all-time sessions | first practice with `sessions >= 3` | — |
| Summary line "Building signal" | all-time sessions | `sessions >= 1` | — |
| Finding row (unlocked) | 90-day deltas | `sessions >= 3`; below that the row renders as "Log N more sessions" | `n >= 5` strong, else emerging |
| "What's measurably shifting" rows | 90-day deltas | `n >= 2` per dimension | `n >= 5` strong, else emerging |
| Stage chip | all-time sessions | — | `< 3` Baseline, `< 10` Building, else Deepening |

Empty state: zero practices renders "Complete 3 practice sessions to see the first restoring signal." Between 1 and 2 total practices, a footer line counts down the remaining sessions.

## 5. Calculations

### 5.1 Before/after pairing (the core primitive)

For every completed practice event, the engine takes the **nearest check-in strictly before** the completion timestamp and the **nearest check-in strictly after** it — with no maximum gap:

```text
before = composite(last check-in with timestamp < event.timestamp)
after  = composite(first check-in with timestamp > event.timestamp)

composite(c) = round( mean(clarity_level, mental_sharpness_level, confidence_level) / 10 * 100 )
               using only the dimensions present; null if none present

delta = after - before        (points on a 0–100 scale)
```

If either side is missing, the event contributes to `sessions` only — no delta, no window bucket, no dimension row.

### 5.2 Per-practice rows (box1)

```text
avgDelta    = mean(delta) over that content_id's paired events
baseScore   = clamp(0..100, 50 + avgDelta)
thumbsRate  = thumbsUp / thumbsTotal        (star_rating >= 4 counts as up)
thumbsBoost = thumbsTotal > 0 ? (thumbsRate - 0.5) * 20 : 0
favBoost    = isFavourite ? 1.1 : 1.0
composite   = clamp(0..100, baseScore * favBoost + thumbsBoost)
clarityDelta = round(avgDelta)              -- shown as "Outcome +N% vs baseline"
```

Rows are sorted by `compositeScore` descending. The card then splits them: plan rows (`planBadge` set) render first with the plan name as the title, then standalone practice rows. Only `star_rating` feedback with `trigger_context` of `post_practice_completion`, `post_plan_completion`, or null is counted.

`clarityDelta` is labelled "Outcome … % vs baseline" in the UI but it is a **point difference on a 0–100 composite**, not a percentage change. See §6.2.

### 5.3 Window and day-of-week (box2)

For each paired event the *after* composite (not the delta) is added to the bucket for that event's window and weekday:

```text
window(t) = UTC hour of completion: 05–11 morning, 12–17 afternoon, else evening
byWindow[w]      = { score: round(mean(after)), n }
byDayOfWeek[dow] = { score: round(mean(after)), n }
best             = window with the highest score, ties resolved to morning
```

Only `best` reaches the screen, as the "· usually AM/afternoon/evening" suffix on the summary line. `byDayOfWeek` is computed and returned but currently unrendered.

Two integrity notes: the bucket measures the *post-practice state*, not the *lift*, so a user who simply feels better in the mornings will always show "usually AM"; and the hour is **UTC**, not the user's timezone, which contradicts the project-wide standardized-time-windows rule.

### 5.4 What's measurably shifting (box3)

Five dimensions, each averaged over its own paired-sample count:

| Row | Before | After | Lift formula | Gate |
|---|---|---|---|---|
| Clarity | mean prior `clarity_level` × 10 | mean next `clarity_level` × 10 | `(after − before) / before × 100` | n ≥ 2 |
| Sharpness | mean prior `mental_sharpness_level` × 10 | mean next | same | n ≥ 2 |
| Confidence | mean prior `confidence_level` × 10 | mean next | same | n ≥ 2 |
| HRV (next AM) | mean `hrv` on practice day | mean `hrv` on day + 1 | same | n ≥ 2 |
| RHR (next AM) | mean `resting_heart_rate` on practice day | mean on day + 1 | `(before − after) / before × 100` (inverted) | n ≥ 2 |

The wearable rows only accumulate for **morning-window practices** (UTC), comparing day D to day D+1, and only when both days have a value. Direction colouring: green "Improving" when the lift is positive (or negative for the inverted RHR row), amber "Monitoring" otherwise.

### 5.5 Summary line resolution

```text
if any practice has sessions >= 3   -> "Most effective: <title> · usually <best window>"
else if the top row has >= 1 session -> "Building signal: <title> — N more sessions to confirm"
else                                 -> "Log practices to reveal what restores your performance"
```

`confirmedPractice` is the **first row in composite order** with `sessions >= 3` — so it is the highest-scoring qualifying practice, not the most-used one.

## 6. Open questions and known weaknesses

Stated plainly rather than defended:

1. **`user_favorites` is read without a user filter.** The function uses the service-role client, so the favourites set is global, not per user. Any favourited `content_id` anywhere in the system grants the 1.1x composite boost and the star glyph. This is a correctness and privacy-adjacent defect, not a cosmetic one.
2. **"Outcome +N% vs baseline" is not a percentage.** It is a raw delta of a 0–100 composite. The `box3` rows *are* percentages, so two different units share the same visual language on one card.
3. **Before/after pairing has no time bound.** The "after" check-in can be days later; the "before" can be days earlier. Anything that happened in between — sleep, a hard meeting, a second practice — is attributed to the practice. This is the single largest source of noise on the card.
4. **Multiple practices in one interval are double-counted.** Each completion independently claims the same before/after pair, so a day with three practices records three copies of one improvement.
5. **Windows are UTC.** §5.3 and the wearable next-AM logic both use `getUTCHours()`, breaking the project's local-timezone window standard for any user outside UTC±0. A user practising at 22:00 in Dubai is bucketed to the previous afternoon.
6. **Box 2 measures level, not lift.** It ranks windows by post-practice absolute state, so it reports circadian preference dressed as practice effectiveness.
7. **Wearable rows are day-granular and morning-only.** Evening wind-down practices — the ones most likely to move next-morning HRV — never enter the HRV/RHR rows at all.
8. **No confidence gate on the summary line.** "Most effective" appears at n = 3 with no requirement that the delta is positive or that it separates from the second-place practice.
9. **Session counts are lifetime, deltas are 90 days.** A practice can display `n=40 strong` while its evidence line is computed from two recent pairings. The `n` badge on a finding row is the session count, not the delta count.
10. **No cache and no persistence.** Every mount recomputes the full aggregation across four tables. There is no `causality_findings`-style row, so the card cannot be referenced by nudges, briefs, or any historical comparison, and it cannot be reproduced after the fact.
11. **`byDayOfWeek`, `topPractice`, and `windowDays` are dead payload.** They are computed and serialised but nothing renders them.

## 7. Verification checklist

To reproduce any on-screen number for a given user:

1. Count `sanctuary_events` rows with `event_type in ('completed','session_complete')` grouped by `content_id` — this is the `n` badge and the stage chip input.
2. For each of those events, find the bracketing `daily_checkins` rows by `timestamp` and compute the composite pair from §5.1 — the mean of those deltas is the "Outcome" line.
3. Join `content_relevance_feedback` star ratings on `content_id` — ratings ≥ 4 over total ratings gives the thumbs component of the composite ordering.
4. For morning-window events, pair `wearable_data` on `summary_date = D` and `D + 1` for the HRV/RHR rows.
5. Anything with fewer than 2 paired samples should be absent from screen; anything with fewer than 3 sessions should render as a "Log N more sessions" row.
