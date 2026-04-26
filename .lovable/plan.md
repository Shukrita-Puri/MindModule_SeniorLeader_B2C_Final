## Root cause (verified)

The three new trend calendars (Clarity / Sharpness / Confidence) render empty in production for **every authenticated user**, even though the DB has the data.

Verified against the live DB and code:

1. **`src/components/insights/LevelTrendCalendar.tsx` queries `daily_checkins` directly from the client** (lines 154–160) using the supabase JS client.
2. **Auth0 is the auth provider, not Supabase Auth.** The supabase JS client therefore has no Supabase session → `auth.uid()` is `NULL` inside Postgres.
3. **RLS on `daily_checkins`** (verified via `pg_policies`) is deny-by-default with the SELECT policy `((auth.uid())::text = user_id)`. With `auth.uid() = NULL`, this returns **zero rows** for every authenticated user in production.
4. **Energy Trend works** because `PerformanceRhythmCard.tsx` (line 818) calls the Edge Function `performance-rhythm-insights`, which verifies the Auth0 JWT server-side (`verifyAuth0JWT`) and queries with the **service role** — bypassing RLS. This matches the project memory rule *"All writes are handled by Edge Functions via service role / RLS deny-by-default for user data."*
5. **DEV_MODE works** because the client query has an explicit `.eq('user_id', DEV_USER.id)` and dev RLS allows it. That's why the trends look populated locally but blank for the user in the screenshot.

DB confirms data exists (sample for the last week shown in the screenshot, queried via `supabase--read_query`):

```
2026-04-24 afternoon  clarity=4 confidence=1 sharpness=2
2026-04-24 evening    clarity=4 confidence=2 sharpness=4
2026-04-23 morning    clarity=4 confidence=3 sharpness=2
2026-04-22 morning    clarity=2 confidence=2 sharpness=3
2026-04-22 afternoon  clarity=4 confidence=4 sharpness=4
2026-04-22 evening    clarity=4 confidence=4 sharpness=4
2026-04-21 morning    clarity=2 confidence=2 sharpness=4
2026-04-21 afternoon  clarity=4 confidence=4 sharpness=4
2026-04-21 evening    clarity=2 confidence=2 sharpness=2
... (full month populated for clarity & confidence; sharpness from Apr 16 onward)
```

So the colours are gated only by RLS, not by missing data or by the colour-mapping logic. Once we route through the service role, every past dot lights up immediately, and every future check-in will populate the same cell as soon as it lands in `daily_checkins` (no extra collection step needed — the data is already being written).

## Fix

### 1. New Edge Function: `supabase/functions/level-trend-calendar/index.ts`

A small, focused, read-only function that returns the per-slot 1–5 levels for a given field over a date range, for the authenticated Auth0 user. Mirrors the auth + service-role pattern used by `performance-rhythm-insights`.

Contract:
- **Auth**: `verifyAuth0JWT` from `_shared/auth.ts` (same as every other Edge Function in the project).
- **Body**: `{ field: 'clarity_level' | 'mental_sharpness_level' | 'confidence_level', startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }`. Field is whitelisted server-side to prevent column injection.
- **Query**: service-role client →
  ```sql
  select checkin_date, time_window, created_at, <field>
  from daily_checkins
  where user_id = $authUserId
    and checkin_date >= $startDate
    and checkin_date <= $endDate
    and <field> is not null
  ```
- **Response**: `{ rows: Array<{ checkin_date: string; time_window: string; created_at: string; value: number }> }`. Unknown fields → 400. Unknown action / errors logged via the standard Fatal Error wrapper.
- **CORS**: standard headers; OPTIONS short-circuit.
- **Config**: deploys with default `verify_jwt = false` (we verify Auth0 ourselves), no `config.toml` block needed.

### 2. `src/components/insights/LevelTrendCalendar.tsx` — switch the production data path

Replace the direct `supabase.from('daily_checkins').select(...)` block (lines 154–160) with:

- **DEV_MODE** branch unchanged (direct DB query with `DEV_USER.id`) — keeps local dev fast and untouched.
- **Production** branch: `supabase.functions.invoke('level-trend-calendar', { headers: { Authorization: \`Bearer ${accessToken}\` }, body: { field, startDate, endDate } })`. Use the returned `rows` array exactly the same way the existing indexer at lines 164–176 already does (it only reads `row[field]`, `row.time_window`, `row.created_at`, `row.checkin_date` — the edge function returns `value` instead of `row[field]`, so the indexer reads `row.value`).

Everything else stays:
- Full current calendar month range (day 1 → last day) — unchanged.
- 1–5 → `LEVEL_TIERS` colour mapping — unchanged (already shared with Energy Trend's daily-check-in palette).
- `applyLayout` ref-callback + `ResizeObserver` self-healing layout — unchanged.
- Per-trend slider vocabulary (`Crystal/Lucid/Neutral/Obscured/Clouded`, `Peak/Acute/Stable/Dull/Depleted`, `Unshakable/Certain/Poised/Uncertain/Reactive`) for legend + tooltip — unchanged.
- Future days as dashed-empty cells; today gets the primary ring — unchanged.
- "Blanks are honest" rule — unchanged. We are *not* fabricating data; we are unblocking what was already in the DB.

### 3. Future-proofing (no extra work — already covered)

- New check-ins continue to write `clarity_level`, `mental_sharpness_level`, `confidence_level` via the existing `daily-checkins` Edge Function (`SAVE_CHECKIN` and `UPDATE_CLARITY_CONFIDENCE` actions). Each new row is immediately visible the next time the trend calendar is opened, because the new edge function reads live from `daily_checkins` with the service role.
- Multi-user safety: the edge function scopes by the verified Auth0 `userId` — never accepts `user_id` from the client body.

## What this does NOT change

- No DB migrations. RLS stays deny-by-default. We do not loosen the SELECT policy on `daily_checkins`.
- No backfill, no synthesised data, no new columns. Existing data only.
- No change to Energy Trend, "How You Show Up", or any other Insights card.
- No change to `daily-checkins` Edge Function (write path) or to `CheckInDetail.tsx`.

## QA checklist (production user, the scenario in the screenshot)

1. Hard-refresh `/insights` → Patterns tab. Energy Trend renders (already works).
2. Clarity / Sharpness / Confidence calendars now render coloured dots for every past slot present in `daily_checkins`:
   - Apr 24 morning/afternoon/evening, Apr 23 morning, Apr 22 all three slots, Apr 21 all three slots, etc., all the way back to Apr 1.
   - Empty slots stay empty (e.g. Apr 25 clarity, Apr 26 clarity) — honest blanks.
   - Future days (Apr 27 → Apr 30) render dashed-empty.
3. Tooltip on a dot shows the per-trend slider word: e.g. an Apr 22 morning Clarity=2 dot shows "Obscured (2/5)"; an Apr 21 evening Sharpness=2 dot shows "Dull (2/5)"; an Apr 21 morning Confidence=2 dot shows "Uncertain (2/5)".
4. After completing a fresh check-in (any window), reopen Patterns → new dots appear in the matching slot for all three trends.
5. Mobile (719 px) and desktop both auto-scroll to the current week's Monday on mount; ResizeObserver re-pins on rotation.

## Files touched

- **Create** `supabase/functions/level-trend-calendar/index.ts` (new edge function, ~80 lines, mirrors `performance-rhythm-insights` auth pattern).
- **Edit** `src/components/insights/LevelTrendCalendar.tsx` (swap the production query branch to `supabase.functions.invoke`; ~25 line diff inside the existing `useEffect`).
- **Update** `mem/features/insights/level-trend-calendars.md` — record that the trend calendars MUST go through the `level-trend-calendar` Edge Function in production (Auth0 → RLS denial), and that DEV_MODE is the only path allowed to query `daily_checkins` directly from the client.

Ready to implement on approval.