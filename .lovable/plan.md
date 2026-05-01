# Fix Practice Effectiveness Card

## Root cause (confirmed against DB)

The card queries the right tables, but three filters silently strip nearly all data:

1. **`trigger_context` filter** keeps only `post_practice_completion` (or null), discarding `post_plan_completion` and `brief_inline` ratings. Of 28 last-30d ratings, only 12 survive.
2. **Min-2-ratings-per-content_id** rule is too strict: across all users in 30d, only 2 content_ids meet it (both `plan-tod`, which the filter above discards anyway).
3. **Misleading metric copy.** Card says "% followed by improved state" but the code computes "% of ratings ≥ 4 stars" — pure self-report, no state-delta logic.

For the most active test user, all 17 ratings are `brief_inline` → card is empty.

## Changes

### 1. `src/components/insights/PracticeEffectiveness.tsx`

- **Broaden rating sources**: accept `trigger_context IN ('post_practice_completion', 'post_plan_completion', NULL)`. Keep excluding `brief_inline` (those rate the *brief*, not a practice) — but if `content_id` joins to `sanctuary_content`, count it.
- **Lower the "top practice" threshold to 1 rating** (current behavior already falls back to single-rating, but only when *no* practice has ≥2; make ≥1 the primary path and prefer practices with more ratings as tiebreaker).
- **Rename the metric in the UI** to match what's actually computed:
  - Replace `"X% followed by improved state"` with `"Avg rating Y.Y / 5 across N session(s)"`.
  - Replace `"Your top restorer"` with `"Highest-rated this month"`.
- **Add a secondary line** when applicable: if a same-day check-in exists before *and* after the practice and `energy_balance` improved, append `"· improved state X/N times"`. This is the missing "state-delta" measurement the docstring promises.
- **Tighten empty state**: "Rate practices after completion to see what works for you" instead of the vague "Use 2+ times" copy.

### 2. (Optional, recommended) Backfill UX for plan-level ratings

`post_plan_completion` rates the whole 3-practice plan, not one practice. Currently those ratings stamp `content_id='plan-tod'` which doesn't map to a sanctuary practice. Two options:

- **Option A (small):** in the player's plan-completion handler, also write a per-practice star_rating row for each practice the user just finished, so plan-level satisfaction propagates to per-practice effectiveness. Trigger_context: `post_plan_completion`.
- **Option B (none):** leave plan ratings out of practice-level scoring; rely only on `post_practice_completion` modal stars. (Cleaner, but means we need to make sure that modal is reliably shown — verify rate of stars-per-completion is healthy.)

Recommend **Option B first** + add a tiny diagnostic: log when a session completes without a rating within 5 min, so we can see the modal-skip rate.

### 3. Honest "how is this computed" affordance

The card has no info modal today. Add a small `(i)` next to the "Practice Impact" header that reveals (user-facing, no formula leak):

> Based on your post-practice ratings over the last 30 days. Highlights the practice you've rated highest.

Keep the actual formula in code/docs, not in the UI.

## Validation after change

```sql
-- expect non-zero rows for active users after broadening filters
SELECT user_id, content_id, count(*), avg(star_rating)
FROM content_relevance_feedback
WHERE feedback_type='star_rating' AND star_rating IS NOT NULL
  AND created_at > now() - interval '30 days'
  AND coalesce(trigger_context,'post_practice_completion')
      IN ('post_practice_completion','post_plan_completion')
GROUP BY 1,2;
```

Then sign in as `google-oauth2|111878...` (17 ratings) and confirm the card renders. Currently empty because all their ratings are `brief_inline` — they will still be empty under this plan unless we also include `brief_inline`. **Decision needed:** include `brief_inline` ratings? They rate the brief, not a practice, so probably no — but we should confirm whether that user actually completed practices or only rated briefs.

## Files touched

- `src/components/insights/PracticeEffectiveness.tsx` (filters, threshold, copy, info modal, optional state-delta line)
- No DB migration required.
- No changes to rating-write paths in `relevanceFeedback.ts` unless we pick Option A above.
