

## Fix Plan: Migrate Downstream Consumers from localStorage to Server-Side

### Scope

5 active files still read `localStorage.getItem('dailyCheckIn')` which is no longer written. `mentalFitnessEngine.ts` is marked `@deprecated` (dead code) — skip it.

### Priority: Auth-Based Users First

For authenticated users, the critical path is: check-in saved via EF → downstream consumers need that data. The localStorage read always returns `{}` now, so any code that depends on it before a DB fetch is broken.

---

### Changes

#### 1. `src/utils/energyStateEngine.ts` — Remove localStorage check-in read

Lines 158-165: Remove `localStorage.getItem('dailyCheckIn')` and `todayCheckIn`. The function already fetches from DB via `fetchTodayCheckin()` on line 176+. The DB result on lines 185-190 already overrides the local values. Fix: remove the localStorage read entirely and initialize `hasCheckIn = false`, `checkInOutcome = null` — let the DB fetch (which already exists) be the sole source. The `wearableData` and `calendarEvents` localStorage reads are acceptable (ephemeral signal data, not sensitive).

#### 2. `src/utils/intelligenceEngine.ts` — Make async or accept check-in as param

Line 329: `getDailyRitualRecommendation()` is synchronous and reads localStorage. Fix: change the function signature to accept an optional `checkInData` parameter. Callers pass the already-fetched check-in data. If no data passed, assume no check-in (safe default — prompts user to check in).

#### 3. `src/utils/sanctuaryEventTracking.ts` — Accept check-in as param

Line 176: Same pattern. The function that builds event context reads localStorage. Fix: accept `checkInOutcome` as a parameter instead of reading localStorage. Callers already have this data from the energy state or from React Query.

#### 4. `src/components/home/WellnessCard.tsx` — Use React Query

Lines 11-21: Replace `useEffect` + localStorage with a React Query call to `getTodayCheckin()`. The component already displays check-in-dependent data (energy, mood, focus). Use `useQuery(['today-checkin'], getTodayCheckin)` and derive display values from the result.

#### 5. `src/utils/onboardingStatus.ts` — Use lightweight localStorage flag

Lines 40-41, 194-195: These check if user has EVER checked in (not today's data). Fix: after first successful `saveCheckin()` in `dailyCheckins.ts`, set `localStorage.setItem('hasEverCheckedIn', 'true')`. Update `onboardingStatus.ts` to check `localStorage.getItem('hasEverCheckedIn')` instead. This is non-sensitive (boolean flag) and avoids making onboarding async.

#### 6. `src/pages/CheckInDetail.tsx` — DEV_MODE `time_window` filter

Line 34-36: Add `.eq('time_window', timeWindow || getCurrentTimeWindow())` to the DEV_MODE update query.

---

### Files Changed

| File | Change |
|------|--------|
| `src/utils/energyStateEngine.ts` | Remove localStorage check-in read; rely on existing DB fetch path |
| `src/utils/intelligenceEngine.ts` | Accept `checkInData` param instead of localStorage read |
| `src/utils/sanctuaryEventTracking.ts` | Accept `checkInOutcome` param instead of localStorage read |
| `src/components/home/WellnessCard.tsx` | Replace localStorage with React Query `getTodayCheckin()` |
| `src/utils/onboardingStatus.ts` | Check `hasEverCheckedIn` flag instead of `dailyCheckIn` |
| `src/utils/dailyCheckins.ts` | Set `hasEverCheckedIn` flag after successful save |
| `src/pages/CheckInDetail.tsx` | Add `time_window` to DEV_MODE update query |

