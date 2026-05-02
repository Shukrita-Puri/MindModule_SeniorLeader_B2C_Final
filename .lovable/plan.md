## Goal

Make `content_relevance_feedback` (CRF) the **single source of truth** for all user-submitted ratings/feedback coming from the three Feedback Modals: Brief, Plan, Practice. Stop writing the same feedback into `brief_snapshots.user_rating/feedback_text` and `practice_sessions.effectiveness_rating/metadata`. Then re-point upstream/downstream consumers of feedback to read from CRF.

This is **scoped to feedback only** — no plan-tracking changes, no UI changes, no DB drops. Other uses of `practice_sessions.effectiveness_rating` (legacy outcome mapping in `sync-practice-data`, etc.) are out of scope.

## Current state (verified)

Writes today:
- **Brief modal** → already writes only to CRF (`trigger_context='brief_inline'`, `content_type='brief'`). ✅
- **Plan modal** → already writes only to CRF (`trigger_context='post_plan_completion'`, `content_id='plan-{tod|jit}'`). ✅
- **Practice modal** → writes to CRF **AND** dual-writes to `practice_sessions.effectiveness_rating` via `content-feedback` action `UPDATE_SESSION_RATING`. ❌ This is the only Modal-driven dual-write.

Legacy/dead write paths:
- `supabase/functions/brief-rating/index.ts` exists and writes to `brief_snapshots.user_rating` — **no client calls it** (verified via repo search). Safe to retire.
- `brief_snapshots.user_rating` & `feedback_text` columns: `0` rows populated.
- `practice_sessions.effectiveness_rating`: `0` rows populated. Nothing to backfill.

Reads today:
- `content-feedback` action `GET_PRACTICE_IMPACT` reads from **both** CRF and `practice_sessions.effectiveness_rating` and dedupes by `session_id`.
- `brief-history` selects `user_rating, feedback_text` from `brief_snapshots` (always null).
- `llmContextBuilder.ts` reads `practice_sessions.effectiveness_rating` for recent-practices context.
- `compute-outer-readiness` reads `sanctuary_events.effectiveness_rating` (separate column, not modal-sourced — leave alone).

## Changes

### 1. Stop dual-writes from the Practice modal

**`src/utils/relevanceFeedback.ts` — `submitPracticeRating`**
Remove the `UPDATE_SESSION_RATING` call. Practice rating writes only to CRF.

**`supabase/functions/content-feedback/index.ts`**
- Remove the `UPDATE_SESSION_RATING` action (return 410 Gone for safety) so any stragglers fail loudly.
- Update `GET_PRACTICE_IMPACT` to compute solely from CRF rows (drop the `practice_sessions` query and dedupe logic).

### 2. Retire legacy brief write path

- Delete `supabase/functions/brief-rating/index.ts` (no callers).
- `brief-history` edge function: remove `user_rating, feedback_text` from the SELECT (they're always null and would mislead future readers). Brief feedback for a given snapshot is now read from CRF via `context_data.brief_snapshot_id`.

### 3. Repoint downstream readers to CRF

- **`src/utils/llmContextBuilder.ts`**: switch the recent-practices effectiveness lookup from `practice_sessions` to CRF (`feedback_type='star_rating'`, `trigger_context='post_practice_completion'`, last 7 days). Map `star_rating` → `effectiveness`.
- **`PracticeEffectiveness.tsx`** and any other Insights consumer that calls `GET_PRACTICE_IMPACT`: no change needed — the edge function now sources from CRF transparently.
- Header doc comment on `PracticeEffectiveness.tsx` updated to reflect CRF as the single source.

### 4. One-time backfill (defensive, even though counts are 0)

A single migration that copies any non-null legacy rows into CRF in case dev/staging has data the prod query didn't see:

```text
INSERT INTO content_relevance_feedback
  (user_id, content_id, content_type, feedback_type, star_rating,
   session_id, trigger_context, feedback_text, feedback_reason,
   context_data, timestamp, created_at)
SELECT ... FROM practice_sessions WHERE effectiveness_rating IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM content_relevance_feedback c
                  WHERE c.session_id = practice_sessions.id
                    AND c.feedback_type='star_rating');

INSERT INTO content_relevance_feedback (...)
SELECT ... FROM brief_snapshots WHERE user_rating IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM content_relevance_feedback c
                  WHERE c.context_data->>'brief_snapshot_id' = brief_snapshots.id::text);
```

Map: `up→5, neutral→3, down→1` for brief rows; `effectiveness_rating` is already 1–5 for sessions.

### 5. Leave columns in place (for now)

We will **not** drop `brief_snapshots.user_rating`, `brief_snapshots.feedback_text`, or `practice_sessions.effectiveness_rating` in this change. They become dead columns. Removal can happen in a follow-up after a few weeks of CRF being the only writer, to avoid breaking anything we missed.

The `brief_snapshots_user_update_guard` trigger keeps them protected; nothing else writes to them after step 1–2.

## Out of scope (explicitly)

- No new `plan_feedback` table.
- No changes to `session_feedback` (already unused).
- No changes to `sanctuary_events.effectiveness_rating` (different signal).
- No changes to Plan tracking architecture — the user said this comes after, as a separate audit.
- No UI changes to any of the three modals.

## Files touched

- `src/utils/relevanceFeedback.ts` (drop dual-write)
- `src/utils/llmContextBuilder.ts` (read from CRF)
- `supabase/functions/content-feedback/index.ts` (drop UPDATE_SESSION_RATING; rewrite GET_PRACTICE_IMPACT to CRF-only)
- `supabase/functions/brief-history/index.ts` (drop dead columns from SELECT)
- `supabase/functions/brief-rating/` (delete)
- `src/components/insights/PracticeEffectiveness.tsx` (header comment only)
- One DB migration (idempotent backfill)

## Verification after implementation

1. Submit a rating from each of Brief, Plan, Practice modals → confirm exactly one CRF row per submission, no rows in `brief_snapshots.user_rating` or `practice_sessions.effectiveness_rating`.
2. Insights "Practice Impact" tile renders identical numbers as before.
3. Coach LLM context still shows recent practice effectiveness.
4. `brief-history` still returns past briefs (without rating fields).
