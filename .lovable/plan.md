

# Plan: Inner World Insights — Multi-Part Fix

## Summary of Changes

This covers 6 areas: UI rename, Momentum card fix, behavior_logs wiring, cause-effect enrichment, "How You Show Up" evaluation, and Lean On/Watch For rename.

---

## 1. Rename "Your Inner World" → "Inner World Insights"

**File:** `src/pages/Insights.tsx` (line 792)
- Change `<h1>` from "Your Inner World" to "Inner World Insights"

---

## 2. Fix Momentum Card (Extend Window + Add Prompt)

**Issue:** 14-day window too short; wins only from coach.

**File:** `src/pages/Insights.tsx` (line 393)
- Change `body: { days: 14 }` → `body: { days: 30 }`
- Update the "past 2 weeks" data source note (line 892) to "past 30 days"
- Update info modal explanation (line 815) from "past two weeks" to "past 30 days"

**File:** `supabase/functions/tiny-wins-insights/index.ts` (line 167)
- Change default `days = 14` → `days = 30`

**Empty state prompt** (line 896-899): Replace generic message with coach-directed prompt:
- "Share your wins during evening coach sessions to build your momentum map. The coach captures patterns you might miss."

---

## 3. Wire behavior_logs Tracking (Fix Cause-Effect Data Source)

### Problem
The `behavior_logs` table requires `energy_after` as NOT NULL, but generic behaviors (practice completion, coach session) don't have an energy_after value. Only `PostEventReflection.tsx` writes to this table.

### Fix: Database Migration
Make `energy_after` nullable so we can log non-reflection behaviors:
```sql
ALTER TABLE behavior_logs ALTER COLUMN energy_after DROP NOT NULL;
```

### Server-Side Inserts (4 behavior types)

**File:** `supabase/functions/user-events/index.ts`
- In `SAVE_CHECKIN` handler (after line 176): If outcome is `drained` or `overwhelmed`, insert into `behavior_logs` with `behavior_type: 'check_in_depleted'`
- In `TRACK_ENGAGEMENT` handler (after line 85): If `eventType === 'session_complete'`, insert into `behavior_logs` with `behavior_type: 'sanctuary_event'`

**File:** `supabase/functions/practice-data/index.ts`
- In `UPSERT_RITUAL` handler: After successful upsert, insert into `behavior_logs` with `behavior_type: 'practice_completion'`

**File:** `supabase/functions/process-orphaned-sessions/index.ts` (already exists from prior work)
- When marking a session as completed, insert into `behavior_logs` with `behavior_type: 'coach_session'`

All inserts are fire-and-forget (non-blocking), server-side only — no client changes needed.

---

## 4. Enrich Cause-Effect Insight

### Current limitation
The `performance-rhythm-insights` edge function only correlates `behavior_logs.behavior_type` → next-day check-in outcome. With behavior_logs now populated, this will start working.

### Additional calendar correlation
**File:** `supabase/functions/performance-rhythm-insights/index.ts`
Add a second cause-effect dimension after the existing behavior correlation (around line 175):
- Cross-reference `calendar_events` event types with same-day/next-day check-in outcomes
- For events where JIT interventions were completed (join with `jit_preferences` or `daily_ritual_completions` with `session_period = 'pre-event'`), show: "When you completed JIT prep before [event type], you checked in [outcome] X% of the time"
- For events correlated with low HRV (join with `physiological_events`), show: "After [event type] events, your readiness tends to drop — observed X times"

This produces up to 3 cause-effect sentences (behavior → outcome, calendar → outcome, JIT completion → outcome), returning the strongest one.

---

## 5. Evaluate "How You Show Up" (Presence Section)

### Current Logic Assessment
The presence score in `PerformanceRhythmCard` requires:
- ≥7 check-ins AND (≥1 high-stakes calendar event OR ≥2 coach sessions)
- Scores from: pre-event ritual completion (max 30pts), depleted-day high-stakes (max 20pts), coach presence keywords (±30pts), post-event readiness recovery (max 15pts)

### Problem
The insight is **thin** — it only reports a label ("You show up when it matters") and one generic signal sentence. The "signals" are all structural (did you prepare? were you depleted?) rather than behavioral (what did you actually do differently?).

### Fix: Enrich with actionable specificity
**File:** `supabase/functions/performance-rhythm-insights/index.ts` + `src/components/insights/PerformanceRhythmCard.tsx`

Add to the presence section response:
- `presenceActions`: Array of 1-2 specific actionable observations, e.g.:
  - "Your pre-event sessions before board meetings correlate with +12 readiness points the next day"
  - "You've shown up depleted to 3 of 5 high-stakes moments — consider scheduling recovery blocks before these events"
  - "Your coach noted strong presence in 2 recent sessions — this pattern holds when you prepare, not when you wing it"
- Display these as bullet points below the `presenceInsight` text

This transforms the section from awareness ("you show up when it matters") to actionable ("here's what specifically works for you").

---

## 6. Rename Lean On / Watch For → Core Strengths / Growth Edges

### File: `src/components/insights/LeadershipPatternsCard.tsx`
- Rename "Lean On" label (line 399) → "Core Strengths"
- Rename "Watch For" label (line 422) → "Growth Edges"
- Keep the "Your Inner Edge" section header (line 391)

### Enrich content with dimension scores
Instead of showing a single sentence, show a bulleted list combining:
1. Dimension-derived strength/edge (from scores ≥70 or <60)
2. Coach-derived insight (existing `coachStrength`/`coachFriction`)
3. Friction-based edge (if frictionPct > 40%)

**File:** `supabase/functions/state-patterns-insights/index.ts` (response section ~line 572)
Add two new fields to the response:
- `coreStrengths: string[]` — derived from evolved dimension scores ≥70 + coach strength
- `growthEdges: string[]` — derived from evolved dimension scores <60 + friction + coach friction

**File:** `src/components/insights/LeadershipPatternsCard.tsx`
Update the interface and rendering to show bulleted lists when arrays are available, falling back to the single archetype sentence when not.

### File: `src/pages/Insights.tsx`
Update the info modal for Leadership Patterns to reference "Core Strengths" and "Growth Edges" instead of "Lean On" and "Watch For" (if referenced).

---

## Files to Change

| File | Change |
|------|--------|
| `src/pages/Insights.tsx` | Rename title, extend wins to 30 days, update empty state prompt |
| `supabase/functions/tiny-wins-insights/index.ts` | Default to 30 days |
| `supabase/functions/user-events/index.ts` | Add behavior_logs inserts for checkin + sanctuary |
| `supabase/functions/practice-data/index.ts` | Add behavior_logs insert for ritual completion |
| `supabase/functions/process-orphaned-sessions/index.ts` | Add behavior_logs insert for coach sessions |
| `supabase/functions/performance-rhythm-insights/index.ts` | Enrich cause-effect + presence actions |
| `supabase/functions/state-patterns-insights/index.ts` | Add coreStrengths/growthEdges arrays |
| `src/components/insights/LeadershipPatternsCard.tsx` | Rename + render bulleted lists |
| `src/components/insights/PerformanceRhythmCard.tsx` | Render presenceActions bullets |
| **DB migration** | `ALTER TABLE behavior_logs ALTER COLUMN energy_after DROP NOT NULL` |

