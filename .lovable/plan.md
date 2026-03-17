

## Audit Findings

### 1. Timezone offset — one user has wrong sign
- `google-oauth2|...` has `timezone_offset = -330` (means UTC-5:30 — wrong for IST)
- `linkedin|...` has `timezone_offset = 330` (correct for IST: UTC+5:30)
- The `getUserLocalDate()` function adds `timezoneOffset` minutes to UTC, so IST users need `+330`
- The client code `-(new Date().getTimezoneOffset())` produces `330` for IST — correct. The google user's value was likely set before the fix was deployed.
- **Fix**: SQL update to set google user to `330`

### 2. Thresholds — already fixed
- Pre-event score threshold is already `25` (line 417)
- State-aware nudge threshold is already `1` (line 869)
- No changes needed here

### 3. Daily fallback — exists but has a logging bug
- Lines 910-930: fallback logs as `morning_anchor` type, but line 922 checks `daily_fallback` type for variant rotation — this means variant rotation never works (always picks FB-1)
- Minor issue, not blocking delivery

### 4. Missing: 3x daily check-in nudges
- Currently only **Morning Anchor** (6-9 AM) prompts a check-in
- The daily-checkins edge function supports `morning`, `afternoon`, `evening` time windows
- Need to add **Afternoon Check-in** (~12:30-14:30) and **Evening Check-in** (~18-20) nudges
- These should check if the user has completed a check-in for that specific time window, not just any check-in today

---

## Plan

### Task 1: Fix timezone_offset for google user
- SQL migration: `UPDATE profiles SET timezone_offset = 330 WHERE id = 'google-oauth2|111878424918915566691'`

### Task 2: Add Afternoon & Evening check-in nudges to smart-nudges
In `supabase/functions/smart-nudges/index.ts`:

**A. Add afternoon check-in nudge** (between Morning Anchor and Evening Close blocks, ~line 743):
- Window: 12:30-14:30 local time
- Condition: no `afternoon` time_window check-in exists for today
- 3 copy variants (AC-1, AC-2, AC-3) focused on midday reset
- Respects same suppression rules (2h gap, DND)
- Logs as `afternoon_checkin` type
- Routes to `/daily-check-in`

**B. Modify Evening Close** to also check for missing `evening` check-in:
- Currently checks `daily_ritual_completions` for evening session
- Add: also trigger if no `evening` time_window check-in exists (regardless of ritual)
- Add 2 new evening check-in variants alongside existing ritual variants

**C. Fix daily fallback variant rotation bug**:
- Change line 926 from `type: 'morning_anchor'` to `type: 'daily_fallback'` so the variant rotation lookup on line 922 works correctly

### Task 3: Deploy updated edge function

### Files changed:
1. `supabase/functions/smart-nudges/index.ts` — add afternoon check-in block, fix fallback type, enhance evening logic
2. DB migration — fix timezone_offset for one user

