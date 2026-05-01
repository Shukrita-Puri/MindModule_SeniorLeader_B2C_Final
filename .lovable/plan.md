## Root cause

The Practice Impact card on `/insights` shows the empty state for every user, even ones with many ratings and completions in the database.

`src/components/insights/PracticeEffectiveness.tsx` reads three tables directly from the browser via the Supabase JS client:

- `content_relevance_feedback`
- `practice_sessions`
- `sanctuary_events`

All three have RLS policies of the form `(auth.uid())::text = user_id`. This app authenticates with **Auth0**, not Supabase Auth, so the Supabase client never carries a Supabase JWT. `auth.uid()` is `null`, every policy fails, and every query silently returns `[]`. The previous "5 of 6 users have data" validation was run with service-role SQL, which bypasses RLS, so the bug stayed hidden.

This matches the project memory standard: *RLS deny-by-default for user data. All writes [and user-scoped reads] handled by Edge Functions via service role.*

## Fix (additive, isolation-first)

Add a new read action to the existing `content-feedback` edge function (already Auth0-aware, already used for writes from this same component flow). The browser makes one call and gets back the aggregated top practice plus the completion count. No other component, page, or table is touched.

### What this does NOT touch

- No RLS policy changes (zero risk to other cards/pages).
- No DB schema changes, no triggers, no migrations.
- No changes to brief page, plan page, practice players, reset pages, coach, or any other Insights card (`PerformanceCausalityCard`, `LeadershipPatternsCard`, `PerformanceRhythmCard`, `DailyShowUpCalendar`, trajectory rows, etc.).
- No change to write paths in `relevanceFeedback.ts` (`submitPracticeRating`, `submitPlanFeedback`, `submitBriefFeedback`) — the data being written is already correct; only the read path is broken.
- No change to existing `content-feedback` actions (`GET_FEEDBACK`, `SUBMIT_FEEDBACK`, `UPDATE_SESSION_RATING`).
- No change to `supabase/config.toml`, `_shared/auth.ts`, or any shared utility.

## Changes

### 1. Edge function: add a new `GET_PRACTICE_IMPACT` action

File: `supabase/functions/content-feedback/index.ts`

- Extend the `RequestBody.action` union with `'GET_PRACTICE_IMPACT'` (purely additive).
- Add a new `case 'GET_PRACTICE_IMPACT'` branch. All other cases left untouched.
- Inside the branch, using the service-role client and the Auth0-verified `userId`:
  1. Read `content_relevance_feedback` for last 30 days where `feedback_type='star_rating'`, `star_rating IS NOT NULL`, and `trigger_context` is null OR `'post_practice_completion'` OR `'post_plan_completion'`. Excludes `brief_inline` so brief feedback can never win the card.
  2. Read `practice_sessions` for last 30 days where `effectiveness_rating IS NOT NULL`. De-dupe against feedback rows that already reference the same `session_id`.
  3. Read `sanctuary_events` for last 30 days where `event_type IN ('completed','session_complete')` to compute `totalPractices`.
  4. Aggregate per `content_id` → `{ total, count }`. Score = `avg * 100 + min(count, 5)`. Pick highest.
  5. Resolve title via `sanctuary_content` lookup. For any `plan-*` content_id (no matching content row) use the friendly label `"Your daily plan"`. Otherwise fall back to the event's category. This preserves the existing client behaviour exactly.
- Response shape (stable contract):
  ```json
  {
    "data": {
      "topPractice": { "contentId", "title", "category", "timesUsed", "avgRating" } | null,
      "totalPractices": number
    }
  }
  ```

### 2. Component: switch reads to the edge function

File: `src/components/insights/PracticeEffectiveness.tsx`

- Replace the three `supabase.from(...)` calls and all client-side aggregation with one `supabase.functions.invoke('content-feedback', { headers: { Authorization: 'Bearer …' }, body: { action: 'GET_PRACTICE_IMPACT' } })`.
  - In DEV_MODE, `devInterceptor` already injects `x-dev-user-id`, and `getAuthToken()` returns the publishable key — no special-casing needed.
- Set `topPractice` and `totalPractices` straight from the response.
- Keep all three render branches unchanged: top practice / "N completed" / fully empty.
- Keep the `InsightInfoModal`, but tighten the copy so it explicitly covers both signals:
  > "Based on the star ratings you've given practices and daily plans over the last 30 days. We highlight whichever you've rated highest."
- Keep loader, layout, icons, container styling identical so the Insights grid is byte-for-byte unaffected.

### 3. Safety guarantees (cross-feature)

- Failure handling: if the edge call errors, the catch sets the same fallback state the current code uses on error → existing empty state shows. No crash, no impact on sibling cards in the same tab.
- Network shape unchanged for write flows used from Plan / Practice players (`SUBMIT_FEEDBACK`, `UPDATE_SESSION_RATING`). They keep their current behaviour and payloads.
- No shared util changes → Brief feedback, Plan feedback, and Practice rating modals continue to write through their existing paths.

## Validation steps after build

1. `/insights` → Progress tab as a user with practice ratings only → shows that practice with avg + count.
2. Same view as a user with only `plan-tod` ratings → shows "Your daily plan" with avg + count.
3. As a user with completions but zero ratings → middle state ("N practices completed").
4. As a brand-new account → fully empty state.
5. Confirm `brief_inline` feedback never appears.
6. Smoke check: Patterns tab cards (`PerformanceCausalityCard`, momentum, rhythm), Brief page, Plan page, Practice players, Reset pages — all render and submit feedback exactly as before (no shared code paths altered).
