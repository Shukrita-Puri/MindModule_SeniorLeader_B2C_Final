

## Audit: Daily Check-In Data Flow

### Tables written by these pages

**Only one table:** `public.daily_checkins` (single row per `user_id + checkin_date + time_window`, enforced by unique constraint). Page 1 upserts the row; Page 2 updates the same row.

### Column-by-column audit

| Column | Type | Source | Currently Populated? |
|---|---|---|---|
| `outcome` | text | Page 1 button selection (`overwhelmed`/`drained`/`scattered`/`steady`/`focused`) | ✅ Yes — **this IS the energy state column** |
| `time_window` | text | Auto-derived from local hour (`morning`/`afternoon`/`evening`) | ✅ Yes |
| `checkin_date` | date | Today's date | ✅ Yes |
| `timestamp` | timestamptz | Submission moment | ✅ Yes |
| `data_sources` | jsonb | `{ check_in: true }` | ✅ Yes |
| `clarity_level` | int (1–5) | Page 2 Clarity slider | ✅ Yes (151/156 rows) |
| `confidence_level` | int (1–5) | Page 2 Confidence slider | ✅ Yes (151/156 rows) |
| `mental_sharpness_score` | int (1–5) | Page 2 Sharpness slider | ❌ **0 / 156 rows** |
| `state_tags` | text[] | (intended: derived from outcome via `mapCheckInToTags`) | ❌ **0 / 156 rows** |
| `energy_balance` | int | Currently hard-coded by old logic (legacy) | ⚠️ Partial |
| `skipped` | bool | Skip path | ✅ Yes |

### Findings — confirming your three questions

**1. `outcome` is correct as the Energy State column.** Values match the Page 1 buttons 1:1. No rename needed.

**2. `mental_sharpness_score` is NOT being written from production.** Two confirmed root causes:
   - **A. Edge function payload typing**: `RequestBody.checkinData` (line 34–45 of `supabase/functions/daily-checkins/index.ts`) does not declare `mental_sharpness_score`, AND the `SAVE_CHECKIN` upsert (lines 222–238) does not include it. Page 1 doesn't write it (correct — it's a Page 2 input). Page 2's `UPDATE_CLARITY_CONFIDENCE` action (line 280–282) DOES include it conditionally — so the path exists, but the column has never been populated.
   - **B. Naming**: You're right — it should be `mental_sharpness_level` for consistency with `clarity_level` and `confidence_level`. All three are 1–5 ordinal levels, not scores.

**3. `state_tags` is NOT being populated.** `mapCheckInToTags()` exists in `src/utils/checkInToTags.ts` (with the modern outcome keys) but is **never called** from `DailyCheckIn.tsx → saveCheckin()`. The `state_tags` field is sent as `undefined`, so the column stays empty. Downstream consumers (Insights, Coach intelligence, pattern learning) lose this signal.

### Why Page 2 hasn't populated sharpness in production

Looking at the most recent rows (all from `2026-04-15` → `2026-04-16`), `clarity_level` and `confidence_level` are populated but `mental_sharpness_score` is `null`. The Page 2 update logic IS sending `mentalSharpness`. The likely cause: **the production edge function deployment is stale** — the audit shows the current `daily-checkins/index.ts` already accepts `mentalSharpness`, but the deployed version may predate that change, OR Page 2 isn't actually being completed to the slider stage in production sessions. Either way the field path needs verification + a rename.

---

## Plan

### 1. Rename `mental_sharpness_score` → `mental_sharpness_level` (DB migration)

For consistency with `clarity_level` and `confidence_level`. Update the CHECK constraint name accordingly. No data loss (column is empty everywhere). Update:
- DB: `ALTER TABLE … RENAME COLUMN mental_sharpness_score TO mental_sharpness_level;` + rename check constraint.
- Edge function `daily-checkins/index.ts` `UPDATE_CLARITY_CONFIDENCE` payload key: `mental_sharpness_score` → `mental_sharpness_level`.
- Frontend `CheckInDetail.tsx`: state var `mentalSharpness` keeps its name; only the DB write key + DEV_MODE update changes.
- `src/integrations/supabase/types.ts` will auto-regenerate.

### 2. Wire up `state_tags` so Page 1 populates it on every check-in

In `src/pages/DailyCheckIn.tsx` `handleOutcomeSelect()`, derive tags from the chosen outcome via `mapCheckInToTags(outcome)` and pass them in the `saveCheckin({ … state_tags: [...] })` call. Send the combined `[stateTag, energyTag, ...recommendationTags]` array (deduped).

`saveCheckin` already forwards `state_tags` to both DEV_MODE upsert and the edge function payload (lines 232/271). The edge function already persists it (line 232 of `daily-checkins/index.ts`). The only missing step is the call site in `DailyCheckIn.tsx`.

### 3. Ensure `mental_sharpness_level` actually persists from production

After the rename:
- Verify Page 2's edge-function call (`UPDATE_CLARITY_CONFIDENCE`) sends `mentalSharpness` (already does — `CheckInDetail.tsx` line ~70).
- The redeployed `daily-checkins` function will write the new column on the next Page 2 completion.
- Add a one-line console log in the edge function to confirm receipt during QA.

### 4. Out of scope (guardrails)

- No changes to `outcome` column or its values.
- No changes to readiness scoring, brief logic, or any other edge function.
- No changes to `energy_balance` (legacy field — separate concern).
- No backfill — historical rows remain `null` for the new field.

### Files Touched

- **DB migration**: rename column + check constraint.
- `supabase/functions/daily-checkins/index.ts` — rename key in `UPDATE_CLARITY_CONFIDENCE` update payload.
- `src/pages/DailyCheckIn.tsx` — call `mapCheckInToTags()` and pass `state_tags` into `saveCheckin()`.
- `src/pages/CheckInDetail.tsx` — DEV_MODE update key rename.

### Verification After Implementation

- New Page 1 check-in → DB row has populated `state_tags` array.
- Complete Page 2 → DB row has populated `mental_sharpness_level` (1–5).
- Confirm with: `SELECT outcome, state_tags, clarity_level, confidence_level, mental_sharpness_level FROM daily_checkins ORDER BY created_at DESC LIMIT 5;`

