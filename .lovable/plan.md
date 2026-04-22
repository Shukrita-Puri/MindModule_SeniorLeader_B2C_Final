

## Root cause: a second unique constraint is still blocking multiple check-ins

### What's actually happening

The previous migration dropped `daily_checkins_user_id_checkin_date_time_window_key` — but the `daily_checkins` table has **a second unique constraint with a different name** still in place:

```
duplicate key value violates unique constraint "daily_checkins_user_date_window"
Key (user_id, checkin_date, time_window)=(google-oauth2|…, 2026-04-22, morning) already exists.
```

Edge function logs show this exact error firing every single time the user taps **Confirm** on a state they've already used today. That's why:

1. **"Confirm" stays stuck on "Saving…"** → `saveCheckin()` returns `null` (the edge function throws 500), the catch path in `DailyCheckIn.tsx` runs → `setIsSubmitting(false)` is *missing* from the catch path. The button stays disabled with the "Saving…" label until the page is reloaded.
2. **State buttons feel "unclickable"** → `canCheckInNow()` runs on mount, sees an existing morning check-in, and sets `alreadyCheckedIn = true`. The component reads that state but **never renders the gate** — the buttons are still mounted but the next save will always fail. Combined with the stuck "Saving…" button, the screen looks frozen.

The previous "allow multiple check-ins" migration only dropped one of the two duplicate-blocking constraints. The other one (`daily_checkins_user_date_window`) silently survived.

### Fix (3 small changes)

**1. Drop the surviving unique constraint (migration)**

```sql
ALTER TABLE public.daily_checkins
  DROP CONSTRAINT IF EXISTS daily_checkins_user_date_window;
```

After this, the existing `idx_daily_checkins_user_date_window_ts` index already covers the "latest in window" lookup — no further DB work needed.

**2. Stop the client-side block on re-check-in (`src/utils/dailyCheckins.ts` + `DailyCheckIn.tsx`)**

The intent is now: *users can check in as many times as they want; we only display "M/A/E" once on the dashboard but record every check-in.* So:

- `canCheckInNow()` → always return `{ canCheckIn: true }`. Remove the duplicate-window guard entirely.
- `DailyCheckIn.tsx` → remove the `alreadyCheckedIn` / `checkedInMessage` state + the `useEffect` that calls `canCheckInNow()`. The Confirm button should never be soft-locked.
- `saveCheckin()` DEV path → switch from `.upsert(..., { onConflict: 'user_id,checkin_date,time_window' })` to `.insert(...)` for parity with the production edge function (which already uses `.insert()`).

**3. Harden the failure path so the button never gets stuck (`DailyCheckIn.tsx`)**

In `handleConfirm`, wrap in try/finally so `setIsSubmitting(false)` *always* runs — even if `saveCheckin` returns null or throws:

```tsx
const handleConfirm = async () => {
  if (!selectedOutcome || isSubmitting) return;
  setIsSubmitting(true);
  try {
    await handleOutcomeSelect(selectedOutcome);
  } finally {
    setIsSubmitting(false);
  }
};
```

And in `handleOutcomeSelect`, when `saveCheckin` returns `null`, the existing toast already fires — no further change needed once the constraint is gone.

### Why this is the complete fix

- The DB error stops happening (constraint gone).
- Even if any *future* save fails for any reason (network, auth), the button always re-enables and shows the toast — no more "Saving…" lock.
- The "you already checked in" wall is removed, matching the new product rule: multiple briefs per window are intentional.
- Sidebar "Recent" list (already updated to fetch up to 10) will now show every check-in chronologically.

### Files touched

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | `DROP CONSTRAINT IF EXISTS daily_checkins_user_date_window` |
| `src/utils/dailyCheckins.ts` | `canCheckInNow()` always returns `{ canCheckIn: true }`; DEV `saveCheckin` uses `.insert()` not `.upsert()` |
| `src/pages/DailyCheckIn.tsx` | Remove `alreadyCheckedIn` state + its `useEffect`; wrap `handleConfirm` in try/finally so `isSubmitting` is always reset |

### Verification

1. Tap any state → Confirm → toast/navigate succeeds. Edge function logs show no `23505` error.
2. Immediately tap **another** state on the same morning → Confirm again → second check-in lands; sidebar Recent shows two entries for "morning" today.
3. Force a network failure → Confirm shows "Saving…" briefly, then toast appears and the button returns to "Confirm" (no longer frozen).
4. Run `supabase--read_query` against `daily_checkins` for the test user — multiple rows for the same `(user_id, checkin_date, time_window)` exist.

### Out of scope

- Sidebar Recent rendering (already shipped in the previous turn).
- Brief / Plan caching behavior on multi-check-in (already invalidates `energy-state` and clears plan session keys per check-in).
- Edge function signature changes beyond the constraint drop.

