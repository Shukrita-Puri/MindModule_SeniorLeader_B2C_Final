

# Plan: Fix Cause-Effect Data Gaps + HRV Enrichment + Actual Event Titles

## Three Gaps Addressed

### Gap 1: Fire-and-forget behavior_log inserts silently fail
**Root cause**: All 4 edge functions (`dialogue-session-manage`, `process-orphaned-sessions`, `user-events`, `practice-data`) use unawaited `.insert().then()` calls. When the Deno runtime terminates before the promise resolves, the insert is lost silently.

**Fix**: Convert all fire-and-forget inserts to **awaited** calls with try-catch. The insert is fast (single row, no joins) and won't meaningfully delay the response. This is why only `coach_session` rows exist — the other functions terminate before completion.

**Files**: 4 edge functions

### Gap 2: Calendar events defaulting to generic `calendar_event` label
**Root cause**: Path A (HRV) and Path C (check-in) skip events that don't match `EVENT_TYPE_KEYWORDS`. Path C falls back to `calendar_event` but the output says "busy calendar days" — not useful.

**Fix**: When no keyword match exists, use the **actual event title** as the grouping key (truncated to 40 chars). This means unclassified events still contribute to cause-effect analysis with their real names. For Path A (HRV), also include unclassified events grouped by title, so users see "Team standup correlates with stable HRV" instead of nothing.

**Files**: Edge function + client-side mirrored paths

### Gap 3: Cause-effect paths rely too heavily on self-declared check-ins; HRV underused
**Root cause**: Paths B–F use only check-in outcomes. HRV is only used in Path A (calendar×HRV) and Path E (JIT×HRV). Paths B, C, D have no HRV enrichment.

**Fix**: Add HRV enrichment to Paths B, C, and D where wearable data is available:
- **Path B** (Behavior→outcome): Append HRV context — "On days following Coach session, you tend to check in 'steady' 80% of the time. Your HRV averaged 48ms on those days vs 41ms baseline."
- **Path C** (Event type→outcome): Append HRV — "After board events, you tend to check in 'focused'. Your HRV on those days averaged 52ms."
- **Path D** (Event vs non-event day): Add HRV comparison — "On event days your HRV averages 44ms vs 51ms on quieter days."

This keeps the primary insight (check-in correlation) but adds physiological backing when data exists.

---

## Changes

### 1. Await behavior_log inserts (4 edge functions)

**`dialogue-session-manage/index.ts`** (line 153): Change from fire-and-forget to awaited:
```typescript
// Before: supabase.from('behavior_logs').insert({...}).then(...)
// After:
try {
  const { error: blErr } = await supabase.from('behavior_logs').insert({...});
  if (blErr) console.error('...');
} catch (e) { console.error('...'); }
```

Same pattern in:
- **`process-orphaned-sessions/index.ts`** (line 105)
- **`user-events/index.ts`** (lines 94, 199)
- **`practice-data/index.ts`** (line 188)

### 2. Use actual event titles for unclassified events (edge function + client)

**`performance-rhythm-insights/index.ts`**:
- **Path A** (line 243): When `et` is null (no keyword match), use the event title directly (truncated) as the grouping key. This lets unclassified events like "Team standup" or "Weekly sync" appear in HRV correlations.
- **Path C** (line 332): Same change — use actual title instead of `calendar_event` generic bucket. Update output to show the title: "After 'Weekly sync' events, you tend to check in 'steady'..."

**`PerformanceRhythmCard.tsx`**: Mirror both changes in the DEV_MODE paths.

### 3. Add HRV enrichment to Paths B, C, D

**`performance-rhythm-insights/index.ts`**:
- After each path generates its `causeEffectInsight` string, check if `wearableData.length >= 3`. If so, compute the relevant HRV average and append it to the insight string.
- Path B: Avg HRV on behavior-log days vs baseline
- Path C: Avg HRV on matched event-type days
- Path D: Avg HRV on event days vs non-event days

**`PerformanceRhythmCard.tsx`**: Mirror the same HRV enrichment logic in DEV_MODE Paths B, C, D.

---

## Files Changed

| File | Change |
|------|--------|
| `dialogue-session-manage/index.ts` | Await behavior_log insert |
| `process-orphaned-sessions/index.ts` | Await behavior_log insert |
| `user-events/index.ts` | Await both behavior_log inserts (sanctuary + depleted) |
| `practice-data/index.ts` | Await behavior_log insert |
| `performance-rhythm-insights/index.ts` | Use actual titles for unclassified events in Paths A+C; add HRV enrichment to Paths B, C, D |
| `PerformanceRhythmCard.tsx` | Mirror title + HRV enrichment changes in DEV_MODE paths |

5 edge function redeploys. No DB migrations.

