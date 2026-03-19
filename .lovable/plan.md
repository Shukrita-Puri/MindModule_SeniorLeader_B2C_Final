

# Plan: Fix Build Errors Across Edge Functions + Audit Implementation

## Context

There are 26 TypeScript errors across 5 edge function files. Most are **pre-existing type inference issues** unrelated to the recent changes (Issues 2 & 3). The self-mastery-coach errors include 3 fields missing from the `CoachContext` type that were added in code but not in the interface.

## Audit: Issue 2 (Tiny Win Gate) — ALREADY IMPLEMENTED

The `flowType` gate has been removed at line 2766. Tiny win extraction now fires for all sessions with `userId && messages.length > 1`. **No further work needed.**

## Audit: Issue 3 (Coach Opener Enrichment) — ALREADY IMPLEMENTED

- `todayCheckins`, `upcomingCalendarEvents`, and `todayCheckinPatterns` fields added to `CoachContext` type
- Server queries added to `buildServerContext` (queries 16-18)
- Context population logic added (lines 1724-1754)
- `buildFirstMessageInstruction` enriched with `contextSignals` array approach

**However**, the opener instruction needs a small refinement: the instruction should explicitly tell the coach to pick **one** most salient signal and weave it naturally — not dump multiple data points. This aligns with the user's feedback about not overwhelming with data. **I'll audit the current instruction text to confirm.**

## Audit: Issue 1 (Behavior Logs) — ALREADY IMPLEMENTED

Verified in prior message: `dialogue-session-manage` `end` action now inserts behavior_logs and fires downstream functions server-side.

---

## Build Error Fixes (5 files)

### File 1: `supabase/functions/self-mastery-coach/index.ts`

| Error | Fix |
|-------|-----|
| `dominantPattern` not on CoachContext (line 1630) | Add `dominantPattern?: string` to CoachContext interface |
| `calendarStateCorrelations` not on CoachContext (lines 1711, 2511, 2514) | Add `calendarStateCorrelations?: Array<{event_keyword: string; typical_state: string; correlation_pct: number; occurrence_count: number}>` to CoachContext |
| `jitContext.eventType` not on type (line 2355) | Add `eventType?: string` to `jitContext` type in CoachContext |
| `profileResult.data` type errors (lines 1579-1581) | Cast `profileResult.data` as `any` (it's a `.maybeSingle()` result) |
| `ev.created_at` not on type (line 1889) | Already using `(ev as any)` pattern nearby — apply same cast |
| `currentRow.hrv` not on type (line 2020) | Already handled with `(currentRow as any)` or explicit cast |
| Parameter `c` implicitly any (line 2514) | Add explicit `: any` type to forEach callback |
| `supabase` argument type mismatch (line 2763) | Cast `supabase as any` in the `buildServerContext` call |

### File 2: `supabase/functions/compute-outer-readiness/index.ts`

| Error | Fix |
|-------|-----|
| `sample.hrv` / `recentHRV[0].hrv` type `never` (lines 654, 660, 670) | Cast `sample` and `recentHRV[0]` as `any` — the select includes `hrv` but TS can't infer |
| `db` argument type mismatch (lines 925, 926, 1010) | Cast `db as any` in function calls |

### File 3: `supabase/functions/generate-mastery-plan/index.ts`

| Error | Fix |
|-------|-----|
| `meta?.structured_tags` / `mastery_category` on type `{}` (line 1628) | Cast `meta` as `any` (it's from a Map lookup) |
| `req.patternInsight.toLowerCase()` on wrong type (line 1742) | Cast `(req.patternInsight as string \|\| '')` |

### File 4: `supabase/functions/state-patterns-insights/index.ts`

| Error | Fix |
|-------|-----|
| `PromiseLike` not assignable to `Promise` (lines 177, 187, 199) | Wrap `.then()` chains with `Promise.resolve()` or use `await` pattern |

### File 5: `supabase/functions/tiny-wins-insights/index.ts`

| Error | Fix |
|-------|-----|
| `win_date` not on type (line 411) | Add `win_date` to the select query (line 294) or cast `w` as `any` |

---

## Coach Opener Refinement (per user feedback)

Review `buildFirstMessageInstruction` to ensure the instruction explicitly states:
- Pick **exactly one** context signal (the most salient)
- Weave it naturally into the greeting — no data dumps
- If the user just says "Hi", use memory + context to ask a warm, relevant question
- Never list multiple metrics in the opener

---

## Summary

| File | Changes |
|------|---------|
| `self-mastery-coach/index.ts` | Add 3 missing fields to CoachContext; fix 8 type cast issues; refine opener instruction wording |
| `compute-outer-readiness/index.ts` | Fix 5 type cast issues (`any` casts for DB results) |
| `generate-mastery-plan/index.ts` | Fix 3 type cast issues |
| `state-patterns-insights/index.ts` | Fix 3 `PromiseLike` → `Promise` issues |
| `tiny-wins-insights/index.ts` | Add `win_date` to select or cast fix |

