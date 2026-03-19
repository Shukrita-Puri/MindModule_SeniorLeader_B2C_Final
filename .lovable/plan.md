
Audit outcome (root causes confirmed)

1) Tiny Wins / “Your Momentum” is failing due ingestion reliability, not UI:
- Database check: `tiny_wins` has only 2 rows total, both for `dev-user-123` from Jan 26; zero rows for active production users.
- Recent coach messages for your affected user do include explicit win language (e.g., “I am proud… beta is finally live”), but no corresponding inserts happened.
- `process-orphaned-sessions` cron is active and running every 10 minutes (job is healthy), but logs show “No orphaned sessions found” in recent runs, so orphan processing did not execute for those recent sessions.
- Most recent coach sessions are already `completed`, so they bypass orphan path.
- In `self-mastery-coach`, tiny win extraction currently has 3 fragility points:
  - It only runs when `messages.length > 1` (first-turn sessions are skipped).
  - It is fire-and-forget (not awaited), so completion is not guaranteed in a streaming edge lifecycle.
  - Tool call is optional (no `tool_choice`), so extraction can silently return no structured call.

2) “Cause-effect statement not visible” is currently data-path/threshold behavior, not rendering bug:
- `performance-rhythm-insights` logs show `ceIns=false` (cause-effect not generated server-side), so UI has nothing to render.
- For the affected user, behavior logs are sparse and concentrated (`coach_session` only), and current algorithm can fail to produce a confident pattern under its thresholds.
- Calendar fallback is keyword-dependent; many event titles may not classify into known event types, which blocks fallback paths.
- So the inline rendering code works when data exists, but the generator frequently outputs null.

Implementation plan

A) Fix Tiny Wins ingestion at the reliable lifecycle point (session close), then keep orphan path as safety net
Files:
- `supabase/functions/dialogue-session-manage/index.ts`
- `supabase/functions/process-orphaned-sessions/index.ts`
- `supabase/functions/self-mastery-coach/index.ts`

Changes:
1. Add a shared “extract from persisted session messages” routine (or equivalent duplicated helper) and run it during `dialogue-session-manage` `action: end` for coach sessions with `msgCount >= 2`.
2. Add duplicate guard: skip extraction if `tiny_wins` already has a row for that `session_id`.
3. Keep orphan function extraction, but align it to same helper/prompt logic so both paths behave identically.
4. In `self-mastery-coach`, harden per-message extraction as supplemental only:
   - Change gate to include first meaningful user turn.
   - Use structured tool output with deterministic contract (`has_win` + `win_content`) instead of optional tool-call behavior.
   - Ensure extraction completion is lifecycle-safe (await with short timeout or move to close-only path for guaranteed persistence).

B) Backfill missed wins so the card updates with already-completed recent sessions
Files:
- Add one edge-function backfill endpoint OR extend existing maintenance function in a controlled way.

Changes:
1. Scan last N days of completed coach sessions with `total_messages >= 2` and no `tiny_wins` rows.
2. Re-run extraction from stored `dialogue_messages`.
3. Insert wins with `source='coach'`, `session_id`, and dedupe by session.

C) Make cause-effect always produce a useful line (or graceful fallback) instead of null
File:
- `supabase/functions/performance-rhythm-insights/index.ts`

Changes:
1. Refine Path A correlation logic to avoid overcount dilution (pair behavior with nearest same/next-day check-in instead of broad many-to-many counting).
2. Relax/expand fallback classification:
   - If event title doesn’t match keyword taxonomy, treat as generic event type instead of discarding.
3. If all cause-effect paths still fail, create deterministic fallback from strongest temporal differential already computed (so “How You Show Up” always includes one causal-style insight when sufficient check-ins exist).
4. Preserve dedupe rule so no repeated sentence appears between `presenceInsight` and bullets.

D) Verification plan (post-implementation)
1. Data verification:
- Confirm new `tiny_wins` rows are created for the affected user after a coach session.
- Confirm backfill inserts rows for missed completed sessions.
2. Function verification:
- Check logs for `dialogue-session-manage`, `process-orphaned-sessions`, `tiny-wins-insights`, and `performance-rhythm-insights`.
3. UI/output verification:
- `tiny-wins-insights` returns `winsCount > 0` and content for affected user.
- `performance-rhythm-insights` returns non-null cause-effect or fallback line and no duplicated sentence.

Expected result after this plan
- “Your Momentum” starts populating from both newly closed sessions and recovered recent sessions.
- Cause-effect insight appears consistently in “How You Show Up” (with fallback when strict correlations are weak).
- Duplicate readiness sentence remains fixed.
