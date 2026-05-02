
## Practice Effectiveness Card v3 — Isolated rebuild

Scope: only `src/components/insights/PracticeEffectiveness.tsx` and the `GET_PRACTICE_IMPACT` action in `supabase/functions/content-feedback/index.ts`. No other component, route or write path is touched. CRF stays the single source of truth for ratings.

### What the user sees

Stage bar (Day 1–6 / Day 7–29 / Day 30+) auto-selected from session count, but tappable.

Three boxes side-by-side. Tapping a box swaps the chart below — only one chart visible at a time.

- **Box 1 — Most effective practice**: top practice by composite score (next-check-in clarity + sharpness + confidence delta vs baseline, equal-weighted; thumbs/star rating from CRF as a booster; favourited practices boosted further and shown with ★ badge). Surfaces post-plan thumbs too — if the practice ran inside a plan, that plan-level CRF rating contributes.
- **Box 2 — Best time of day**: morning / afternoon / evening cell that has the highest average post-session check-in score, computed off the cross of `sanctuary_events.timestamp` window and the next `daily_checkins` in the same window. Day-of-week strip is the secondary layer in the same chart view.
- **Box 3 — Cognitive + physical lift**: composite of self-declared lift (clarity, sharpness, confidence — next check-in vs same-day baseline) + wearable lift (HRV next morning, RHR next morning lower=better) from `wearable_data`.

Locked state when a box doesn't have enough data yet (pip progress bar shows how close).

### Chart views (one at a time, swap on box tap)

- Box 1 → ranked horizontal bars per practice with sessions count and thumbs ratio + plan badge if applicable.
- Box 2 → 3-cell time-of-day grid (best cell highlighted) + 7-day-of-week mini strip below.
- Box 3 → before/after paired bars per dimension (Clarity, Sharpness, Confidence, HRV next AM, RHR next AM with inverse coloring).

Empty/early state: "Day 1–6" copy explains baselines forming, shows sessions-logged + thumbs-given pips.

### Data sources (read-only, no schema changes)

| Signal | Source |
|---|---|
| Sessions completed, time window, content_id, category | `sanctuary_events` (event_type in `completed`/`session_complete`) |
| Star/thumbs ratings, plan-level ratings | `content_relevance_feedback` (`feedback_type='star_rating'`, `trigger_context in ('post_practice_completion','post_plan_completion')`) |
| Clarity / sharpness / confidence baseline + post-session | `daily_checkins` (`clarity_level`, `mental_sharpness_level`, `confidence_level`, `time_window`, `timestamp`) |
| HRV / RHR next-morning lift | `wearable_data` (`hrv`, `resting_heart_rate`, `summary_date`) |
| ★ favourite booster + badge | `user_favorites` |

### Backend changes

`supabase/functions/content-feedback/index.ts` → extend `GET_PRACTICE_IMPACT` to return one richer payload (no new action, no breaking change for any other consumer — `topPractice` + `totalPractices` keys preserved, additional keys appended):

```ts
{
  data: {
    // existing keys (back-compat)
    topPractice, totalPractices,
    // new
    stage: 'day_1_6' | 'day_7_29' | 'day_30_plus',
    windowDays: 30,
    box1: { practices: [{ contentId, title, category, sessions, thumbsUp, thumbsTotal,
                         compositeScore, clarityDelta, isFavourite, planBadge }] },
    box2: { byWindow: { morning, afternoon, evening },  // each = avg post-session check-in score + n
            byDayOfWeek: [{ dow:0..6, score, n }],
            best: 'morning'|'afternoon'|'evening' },
    box3: { dims: [
      { label:'Clarity',    before, after, lift, n },
      { label:'Sharpness',  before, after, lift, n },
      { label:'Confidence', before, after, lift, n },
      { label:'HRV (next AM)',  before, after, lift, n },
      { label:'RHR (next AM)',  before, after, lift, n, inverse:true },
    ]}
  }
}
```

Aggregation rules (all 30-day window, server-side, service role):

1. Pull `sanctuary_events` completions, `daily_checkins`, `wearable_data`, `content_relevance_feedback` (star_rating, trigger=practice or plan), `user_favorites`, `sanctuary_content` for titles.
2. For each completed session, find the **next** `daily_checkins` row after `timestamp` (same day or next slot) → that's the post-session check-in. The **prior** check-in (or earliest of day) is the baseline.
3. Per-practice composite = mean(clarityΔ, sharpnessΔ, confidenceΔ) normalised 0..100, then × (1 + 0.1·favouriteBoost) + thumbs booster ((thumbsUpRate − 0.5) · 20).
4. By window = mean composite of sessions whose `time_window` (derived from event timestamp in user TZ via the 5/12/18 standard) matches.
5. Box 3 wearable: for each AM session day D, compare `wearable_data` D vs D+1.
6. Stage: sessions<3 → day_1_6, <10 → day_7_29, else day_30_plus.

If user has zero sessions, return existing empty `topPractice:null, totalPractices:0` shape — keeps the locked early state working.

### Frontend changes

Rewrite `src/components/insights/PracticeEffectiveness.tsx`:

- Keep the existing edge-function fetch (`content-feedback / GET_PRACTICE_IMPACT`) and `userId` prop signature.
- Add stage bar, three boxes, swap-chart area.
- Use existing tokens (`text-saffron`, `bg-card`, `border-border`, etc.) — no new colors, no new dependencies. Match the look & feel of the uploaded HTML mock but using Tailwind + design system tokens.
- Reuse `InsightInfoModal` for the explainer.
- Active box state local to the component; defaults to Box 1.
- Locked boxes: dash + "needs N more sessions" copy + pip progress.

### Out of scope (untouched)

- Write paths for Brief / Plan / Practice modals (already CRF-only).
- All other insights cards.
- Database schema, RLS, migrations.
- `/coach`, `llmContextBuilder`, `brief-history`, all other readers.

### Files to change

1. `supabase/functions/content-feedback/index.ts` — extend `GET_PRACTICE_IMPACT` payload; redeploy.
2. `src/components/insights/PracticeEffectiveness.tsx` — full rewrite of the rendering + stage logic.

### Validation after build

- `psql` spot-check the aggregation against current 30-row rated set (30 ratings, 86 sessions, 22 unique practices).
- Curl the edge function for a real user to confirm payload shape.
- Visual check on `/insights` desktop + mobile, including the "Day 1–6" locked state by toggling stage manually.
