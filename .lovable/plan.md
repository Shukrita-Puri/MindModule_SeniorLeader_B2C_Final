

# Smart Nudges Pre-Event: Align with JIT Pipeline

## Root Cause Analysis

The "AI Augmented Executive" event illustrates the gap perfectly:

**JIT pipeline result:** The event would fail the Stage 4 gate because:
- Dim A (Interpersonal Stakes) = 0 or ~12 (low attendee count, no PRESSURE_KEYWORDS match — `'executive'` is not in JIT's pressure list)
- Dim B (Inner State) = 0 (no cluster keyword match — `'executive'` isn't in any JIT cluster)
- Gate requires: `finalScore >= 55 AND dimA >= 10 AND dimB >= 8` → **FAIL**
- Additionally, JIT's noise filter would also catch education events if we added those keywords

**Smart nudges result:** `scoreEvent('AI Augmented Executive')` hits `'executive'` → score = 25 → passes `score < 25` gate → **nudge fires**

Two completely different systems, two completely different answers for the same event. The user is right: **if JIT didn't build a plan, the nudge shouldn't fire.**

## The Fix: Single Source of Truth

Instead of duplicating JIT's 6-stage scoring logic inside smart-nudges, make smart-nudges **query `jit_event_context`** for events that already passed the JIT gate.

### Change 1: Replace keyword scoring with `jit_event_context` lookup

**File: `supabase/functions/smart-nudges/index.ts` (lines 570-642)**

Replace the current pre-event logic:
```
// CURRENT: query calendar_events → scoreEvent() → score >= 25
// NEW: query jit_event_context for events that passed JIT gate in 30-90 min window
```

New logic:
```typescript
// Pre-Event Prep — aligned with JIT pipeline
const { data: jitEvents } = await supabase
  .from('jit_event_context')
  .select('event_id, event_title, event_start, event_type, final_score, dim_a, dim_b, confidence_band, external_id')
  .eq('user_id', userId)
  .gte('event_start', min30.toISOString())
  .lte('event_start', min90.toISOString())
  .gte('final_score', 55)  // Same gate as JIT Stage 4
  .order('final_score', { ascending: false });

for (const evt of (jitEvents || [])) {
  // Skip if confidence too low (mirrors JIT Stage 4)
  if (evt.confidence_band === 'none') continue;
  
  // Dedup by external_id (same as before)
  const alreadySent = (logsByType.get('pre_event_prep') || [])
    .some(l => l.event_reference === evt.external_id);
  if (alreadySent) continue;
  
  // ... rest of variant selection and push logic
}
```

This means:
- If JIT scored an event below 55, or dimA < 10, or dimB < 8 → no nudge
- If JIT's noise filter blocked it → it's not in `jit_event_context` → no nudge
- Education events the leader isn't organising → JIT's Dim D gives 0 for `isOrganizer=false`, reducing the composite score, potentially below gate → no nudge
- Education events the leader IS leading → `isOrganizer=true` gives +3 in Dim D, plus if it has attendees and pressure keywords it may pass → nudge fires correctly

### Change 2: Remove hardcoded duration/practice claims from PE variants

**File: `supabase/functions/smart-nudges/index.ts` (lines 196-202)**

```typescript
// BEFORE
{ id: 'PE-1', body: `${ctx.eventTitle} in ${ctx.minutesUntil} min. 3-min prep ready.` },
{ id: 'PE-6', body: `High stakes, ${ctx.minutesUntil} min out. Your prep is ready.` },

// AFTER
{ id: 'PE-1', body: `${ctx.eventTitle} in ${ctx.minutesUntil} min. Open your prep.` },
{ id: 'PE-6', body: `High stakes, ${ctx.minutesUntil} min out. Open your prep.` },
```

Also update SN-3 if it references a specific practice duration.

### Change 3: Keep `scoreEvent()` as fallback for users without JIT data

If `jit_event_context` has no rows (e.g., user has no calendar connected or `generate-jit-events` hasn't run yet), the current keyword-based logic would still be needed as a degraded fallback. But we add the noise filter:

```typescript
// Fallback: only if jit_event_context returned nothing AND calendar_events exist
if (jitEvents?.length === 0 && calendarConnected) {
  // Use existing calendar_events query but with noise filter + raised threshold
  const score = scoreEvent(evt.title);
  if (isNoiseEvent(evt.title)) continue;  // Import from JIT
  if (score < 50) continue;  // Raised from 25 to require 2+ keyword hits
}
```

### Change 4: Add NOISE_KEYWORDS and education filter to smart-nudges

Import or duplicate the noise filter from `generate-jit-events` for the fallback path:
```typescript
const NOISE_KEYWORDS = [
  'station', 'bus', 'train', 'flight', ...  // Same as JIT
];
// Don't exclude ALL education keywords — just add noise filter
// Education events led by the user (isOrganizer=true) should still qualify via JIT
```

Per the user's feedback: we do NOT blanket-exclude education keywords. The JIT pipeline's multi-dimensional scoring already handles this correctly — if the leader is organising/leading a workshop, `isOrganizer=true` adds Dim D points, attendee count adds Dim A points, and it may pass the gate. If they're just attending, it won't.

## Why This Works

| Scenario | JIT Gate | Smart Nudge (new) | Correct? |
|----------|----------|-------------------|----------|
| "AI Augmented Executive" (attending) | FAIL (low Dim A+B) | No nudge | ✅ |
| "AI Workshop" (leading, 20 attendees) | PASS (Dim A=20, Dim D=+3) | Nudge fires | ✅ |
| "Board Meeting" (organiser) | PASS (high all dims) | Nudge fires | ✅ |
| "Dentist appointment" | NOISE filtered | No nudge | ✅ |
| No mastery plan built | Not in jit_event_context | No nudge | ✅ |

## Files Modified

| File | Change |
|------|--------|
| `smart-nudges/index.ts` | Replace `scoreEvent` pre-event gate with `jit_event_context` lookup; add noise filter fallback; fix PE variant copy; raise fallback threshold to 50 |

No database changes. No UI changes. Single edge function update.

