

## Problem Analysis

From the screenshot, the plan brief currently shows "Light Close (1 meetings today)" – a density label, not the contextual `planBrief` that was implemented. Two issues explain this:

1. **The `planBrief` IS being generated** (line 2157) and returned (line 2316), but it doesn't include wearable data. The function `generatePlanBrief()` only references readiness tier, calendar, and check-in outcome – it never mentions sleep quality, HRV, or RHR even though these are the signals beta testers want to see ("your sleep data says disturbed sleep").

2. **The layout breaks on mobile** – the plan brief sits inside a `flex items-center justify-between` row alongside the "X of Y completed" counter, causing it to compress on small screens.

3. **Wearable data is not fetched** in `generate-mastery-plan/index.ts` at all – the inner readiness tier is derived from check-in `energy_balance`, not from wearable snapshots. The function has no access to sleep score, HRV, or RHR to reference in briefs or reasoning strings.

---

## Plan

### Change 1: Fetch wearable snapshot data server-side

**File:** `supabase/functions/generate-mastery-plan/index.ts`

Add a new server-side fetch block (alongside existing check-in, favorites, etc.) to query the latest `wearable_snapshots` row for the user. Extract: `sleep_score`, `hrv_ms`, `resting_heart_rate`, `hrv_deviation_pct`. Store these on a new `wearableContext` object passed to `generatePlanBrief()` and `getContextualReasoning()`.

Add to `PlanRequest`:
```typescript
wearableContext?: {
  sleepScore: number | null;
  hrvMs: number | null;
  restingHR: number | null;
  hrvDeviation: number | null;
  hasData: boolean;
};
```

Query: latest row from `wearable_snapshots` where `user_id = req.userId` and `recorded_at` within last 24 hours.

### Change 2: Upgrade `generatePlanBrief()` to include wearable signals

**File:** `supabase/functions/generate-mastery-plan/index.ts`

Update signature to accept wearable context. When wearable data is available, weave it into the brief naturally:

| Scenario | Current | New |
|----------|---------|-----|
| Depleted + poor sleep | "You checked in as drained after 8 meetings..." | "You checked in as drained after 8 meetings and your sleep score is below baseline. This sequence is designed to release what you carried today and protect tomorrow's capacity." |
| Strong + good HRV | "Your readiness is above baseline..." | "Your readiness is above baseline with recovered HRV and 2 meetings still ahead. This sequence sharpens your edge for the stretch that remains." |
| Managing + low HRV | "Your readiness is steady but 6 meetings lie ahead..." | "Your readiness is steady but your HRV is below baseline and 6 meetings lie ahead. These practices build the composure and focus to sustain you through a dense day." |

Logic: append wearable fragment only when the signal is notable (sleep < 70 or HRV deviation > 10% below baseline). Don't mention wearable data when it's unremarkable or absent.

### Change 3: Upgrade `getContextualReasoning()` to include wearable context

**File:** `supabase/functions/generate-mastery-plan/index.ts`

Add `wearableContext` parameter. When notable wearable data exists, prioritise it in reasoning strings:

| Focus | Wearable Signal | New Reasoning |
|-------|----------------|---------------|
| composure | Low HRV | "Your HRV is below baseline – this settles your nervous system before what's ahead" |
| release | Poor sleep | "Your sleep was disrupted last night – this practice helps discharge residual tension" |
| restore | Low sleep + depleted | "Your sleep score and check-in both flag low reserves – this practice replenishes at the deepest level" |

Fallback: if no wearable data, use existing check-in/calendar-based reasoning (no regression).

### Change 4: Fix mobile layout – plan brief on its own row

**File:** `src/components/home/DailyRitual.tsx`

Move the plan brief container OUTSIDE the `flex items-center justify-between` row so it gets full width on all viewports. Current structure:

```
<div className="flex items-center justify-between">   ← header row
  <div className="flex flex-col">                     ← left side
    <span>Evening Close [Evening]</span>
    <div>plan brief (SQUEEZED HERE)</div>              ← problem
  </div>
  <span>2 of 3 completed</span>                       ← right side
</div>
```

New structure:

```
<div className="flex items-center justify-between">   ← header row
  <div className="flex items-center gap-2">
    <span>Evening Close [Evening]</span>
  </div>
  <span>2 of 3 completed</span>
</div>
{planBrief && (                                        ← full-width, own row
  <div className="bg-muted/20 rounded-lg px-3 py-2 mt-1.5 min-h-[20px]">
    <span className="text-[13px] text-muted-foreground font-medium leading-relaxed">
      {planBrief}
    </span>
  </div>
)}
```

This ensures the brief always renders full-width on mobile and web, never squeezed by the completion counter.

### Change 5: Update documentation

**File:** `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md`

Add a "Wearable Signal Integration" section documenting:
- Which wearable fields are used (sleep_score, hrv_ms, resting_heart_rate)
- Thresholds for inclusion in briefs (sleep < 70, HRV deviation > 10%)
- How wearable data flows into reasoning strings
- Priority hierarchy: Wearable > Check-in > Calendar > Generic

---

## Technical Details

- The `wearable_snapshots` table is already used by `compute-inner-readiness` and `compute-outer-readiness`, so the schema is confirmed.
- All en-dash (`–`) usage will be maintained per project typography standard.
- The `calendarMessage` fallback in DailyRitual.tsx will be retained for backwards compatibility but `planBrief` takes precedence.
- Deploy updated `generate-mastery-plan` edge function after changes.

