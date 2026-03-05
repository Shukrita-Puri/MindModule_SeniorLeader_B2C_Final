

## Audit Results: Daily Check-In Feature + Calendar Data Flow

---

### COMPUTE-OUTER-READINESS: Calendar Load/Pressure Flow — VERIFIED CLEAN

The full chain is working correctly:

1. `energyStateEngine.ts` (lines 161-177) fetches calendar events from DB → computes `calendarLoad`/`calendarPressure` via `getCalendarMetrics()` (lines 227-230)
2. `useOuterReadiness.ts` (lines 59-60) passes `energyState.calendarLoad` and `energyState.calendarPressure` to the EF
3. `compute-outer-readiness` EF (lines 514-518) destructures `calendarLoad` and `calendarPressure` from the request body
4. EF uses them in `getTheme()` (line 557) which has full 40-theme matrix covering all tier × load × pressure combinations
5. EF persists them to `daily_themes` table (lines 589-590)
6. EF builds `dataSources` array with 'calendar' when load/pressure are non-null (line 485)

**No issues found.** The calendar → energy state → outer readiness pipeline is fully functional.

---

### DAILY CHECK-IN BUGS FOUND

#### BUG 1: `saveCheckin` Returns `null` Without Throwing — Silent Auth Failure (HIGH)

**File:** `src/utils/dailyCheckins.ts` line 295
**Issue:** When `getAuthToken()` returns null, `saveCheckin` returns `null` silently. `DailyCheckIn.tsx` catches thrown errors (line 154) but does NOT check for a `null` return value. The user sees no error and navigates to `/check-in-detail` with unsaved data.

```typescript
// dailyCheckins.ts line 294-295
const accessToken = await getAuthToken();
if (!accessToken) return null;  // Silent failure — no throw
```

```typescript
// DailyCheckIn.tsx line 137 — doesn't check return value
await saveCheckin({...});  // null return = success path taken
```

**Fix:** In `DailyCheckIn.tsx`, check the return value of `saveCheckin`. If null, show error toast and don't navigate.

#### BUG 2: UTC Date Gap — Evening Check-Ins Recorded as Next Day (MEDIUM)

**File:** `DailyCheckIn.tsx` line 124
**Issue:** `checkinDate` is computed as `new Date().toISOString().split('T')[0]` which is UTC. A user in UTC-8 checking in at 10 PM local time gets `checkin_date = next day`. This breaks the "one check-in per time window per day" uniqueness constraint from the user's perspective — they could submit two "evening" check-ins (one at 10 PM local = next day UTC, one at 8 PM local = current day UTC).

The Edge Function (`daily-checkins`) also computes `today` in UTC (line 90, 112, 162), so the mismatch is consistent server-side too. But the user experience is wrong — their "today" history shows yesterday's evening check-in as missing.

**Fix:** Compute `checkinDate` using local date instead of UTC:
```typescript
const now = new Date();
const checkinDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
```
And pass `timezoneOffset` to the Edge Function so it can compute the correct local date server-side.

#### BUG 3: `canCheckInNow()` Is Never Called (LOW)

**File:** `src/utils/dailyCheckins.ts` line 37
**Issue:** `canCheckInNow()` exists but is not imported or called anywhere. `DailyCheckIn.tsx` always renders and allows submission regardless of whether the user already checked in for the current time window. The upsert prevents duplicates, but the user gets no feedback that they've already checked in — they just overwrite their previous check-in silently.

**Fix:** Call `canCheckInNow()` in `DailyCheckIn.tsx` on mount. If `canCheckIn === false`, show the existing check-in outcome and offer to update or skip to home.

#### BUG 4: `compute-inner-readiness` Called Without Auth Token (MEDIUM)

**File:** `energyStateEngine.ts` line 203
**Issue:** `supabase.functions.invoke('compute-inner-readiness', {...})` is called without an Authorization header. The EF config may have `verify_jwt = false`, but this means the EF has no way to identify the user. If it needs user context, it's broken. If it doesn't need user context (pure scoring), it's fine but exposes a public endpoint.

**Fix:** Pass the Auth0 token in the headers, same as other EF calls.

---

### CALENDAR END-TO-END FLOW — VERIFIED

| Step | Status |
|------|--------|
| Google Calendar OAuth → `calendar-auth` EF | CLEAN |
| `sync-calendar` EF → writes to `calendar_events` DB | CLEAN |
| RLS: `Users can view own calendar events` SELECT policy | CONFIRMED |
| `energyStateEngine.ts` → DB fetch (next 4h events) | CLEAN |
| `getCalendarMetrics()` → load/pressure computation | CLEAN |
| `useOuterReadiness` → passes load/pressure to EF | CLEAN |
| `compute-outer-readiness` EF → uses in `getTheme()` | CLEAN |
| Home page mastery plan receives load/pressure | CLEAN |

---

### IMPLEMENTATION PLAN

| # | Fix | Severity | File |
|---|-----|----------|------|
| 1 | Check `saveCheckin` return value — show error if null | HIGH | `DailyCheckIn.tsx` |
| 2 | Use local date instead of UTC for `checkinDate` | MEDIUM | `DailyCheckIn.tsx` |
| 3 | Call `canCheckInNow()` on mount — show already-checked-in state | LOW | `DailyCheckIn.tsx` |
| 4 | Add Auth token to `compute-inner-readiness` call | MEDIUM | `energyStateEngine.ts` |

**Files changed:** `src/pages/DailyCheckIn.tsx`, `src/utils/energyStateEngine.ts`

