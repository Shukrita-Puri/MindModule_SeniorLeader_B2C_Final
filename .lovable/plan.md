

## Full Audit: localStorage Sensitive Data, Tag Mapping, DEV_MODE RLS, and Auth User Login Flow

### AUDIT RESULTS

---

### 1. Tag Mapping Mismatch — CONFIRMED BROKEN (Critical)

**`checkInToTags.ts`** maps legacy keys: `pause`, `power-up`, `presence`, `calm`, `ready`
**`DailyCheckIn.tsx`** sends modern outcomes: `overwhelmed`, `drained`, `steady`, `scattered`, `focused`

**Result:** Only `scattered` partially maps (to `presence` fallback). All others fall through to default `pause` mapping:
- `overwhelmed` → `pause` (accidentally OK)
- `drained` → `pause` (wrong — should map like `power-up`)
- `steady` → `pause` (wrong — should map like `ready`)
- `focused` → `pause` (wrong — should map like `ready`)

**Consumers affected:**
- `recommendationEngine.ts` — uses `mapCheckInToTags()` and `getRecommendationReasoning()` (also uses legacy keys `pause`, `power-up`, etc.)
- `energyStateEngine.ts` — uses `getEnergyStateFromCheckIn()` 
- Downstream: mastery plan, coach context, JIT recommendations all receive wrong energy/state tags

**Fix:** Add modern outcome keys to both `mapCheckInToTags()` and `getEnergyStateFromCheckIn()`:

```text
'overwhelmed' → same as 'pause' (EXCESS_FIRE, TENSE)
'drained'     → same as 'power-up' (LOW_FIRE, FATIGUED)
'scattered'   → same as 'presence' (EXCESS_AIR, SCATTERED)
'steady'      → BALANCED, BALANCED (new — mid-range)
'focused'     → same as 'ready' (BALANCED, BALANCED)
```

Also update `getRecommendationReasoning()` in `recommendationEngine.ts` to include new outcome keys.

---

### 2. DEV_MODE RLS Policies in Production — CONFIRMED (Critical)

**12+ RLS policies** allow anyone with the anon key to read/write as `dev-user-123` on these tables:
- `daily_checkins` (SELECT, INSERT, UPDATE)
- `profiles` (SELECT, INSERT, UPDATE)
- `tiny_wins` (SELECT)
- `dialogue_sessions` (SELECT, INSERT, UPDATE)
- `dialogue_messages` (SELECT, INSERT via session join)
- `detected_signals` (SELECT via session join)
- `daily_ritual_completions` (SELECT, INSERT, UPDATE)
- `user_favorites` (SELECT, INSERT, DELETE)
- `practice_sessions` (INSERT, SELECT)
- `coach_intervention_outcomes` (ALL)

**Fix:** Create a migration to DROP all `dev-user-123` policies. DEV_MODE code paths already use direct Supabase client calls which will work via service role in EFs. For local development, developers should use the service role key directly.

---

### 3. Remaining localStorage Reads of Sensitive Data

#### Sensitive — Should Migrate to Server

| File | Key | Data Type | Status |
|------|-----|-----------|--------|
| `intelligenceEngine.ts` | `practiceHistory`, `recalibrateHistory`, `quickWins`, `mentalFitnessScore`, `checkInHistory` | Practice/scoring data | **Deprecated file** — not imported. No fix needed, remove file. |
| `mentalFitnessEngine.ts` | `dailyRitualHistory`, `practiceHistory`, `recalibrateHistory`, `mentalFitnessBaseline` | Scoring data | **Deprecated file** (marked line 2) — not imported. No fix needed, remove file. |

#### Non-Sensitive — Acceptable in localStorage

| File | Key | Purpose | Verdict |
|------|-----|---------|---------|
| `onboardingStatus.ts` | `hasEverCheckedIn`, `selectedPlan`, `contextConnections`, `mind_module_onboarding` | Onboarding gate flags | **OK** — non-sensitive booleans/flow state |
| `onboardingStorage.ts` | `mind_module_onboarding` | Pre-signup session data | **OK** — anonymous session, cleared on signup |
| `energyStateEngine.ts` | `wearableData` | Ephemeral HRV signal | **OK** — per architecture standard |
| `sanctuaryEventTracking.ts` | `ouraData`, `sanctuaryEvents` (offline queue) | Ephemeral signal + offline buffer | **OK** |
| `practiceCompletionTracker.ts` | `todayRecommendedIds`, `practiceQueue` | UI queue state | **OK** — non-sensitive transient |
| `GuidedPracticePlayer.tsx` | `practiceQueue`, `jitInterventionData`, `todayRecommendedIds` | UI navigation state | **OK** |
| `MicroPracticePlayerCards.tsx` | `practiceQueue`, `jitInterventionData`, `todayRecommendedIds` | UI navigation state | **OK** |
| `dailyCheckins.ts` | `hasEverCheckedIn` (write only) | Lightweight flag | **OK** |

**Verdict:** No active files read sensitive data from localStorage. The two deprecated files (`intelligenceEngine.ts`, `mentalFitnessEngine.ts`) are dead code — not imported by any active component.

---

### 4. Auth User Login Flow — Daily Check-In Routing

**Current flow for signed-up users:**
1. User logs in → `AuthCallback.tsx` → redirects to `/daily-check-in` (line 118, 153)
2. `/daily-check-in` is wrapped in `<ProtectedRoute><OnboardingGuard>` (App.tsx line 102)
3. `ProtectedRoute` verifies Auth0 authentication
4. `OnboardingGuard` checks onboarding completion via `onboarding_progress` DB table
5. If onboarding incomplete → redirects to resume point
6. If complete → renders `DailyCheckIn.tsx`

**Multi-window check-in:** The daily check-in uses `time_window` (`morning`, `afternoon`, `evening`) with a unique constraint on `(user_id, checkin_date, time_window)`. Users can check in up to 3 times per day. The routing doesn't force re-check-in if one window is already done — `DailyCheckIn.tsx` always renders and allows the user to check in for the current time window.

**This is correct behavior** — users always land on check-in on login, can submit for current window, then proceed to home.

---

### 5. Silent Failures (High)

Both `DailyCheckIn.tsx` and `CheckInDetail.tsx` navigate away regardless of save success. No error toast is shown to the user. The `handleSave` in `CheckInDetail.tsx` catches errors but still calls `navigate('/executive-home')`.

**Fix:** Add error toasts and only navigate on success.

---

### Implementation Plan

| # | Change | Severity | Files |
|---|--------|----------|-------|
| 1 | **Fix tag mapping** — add `overwhelmed`, `drained`, `steady`, `scattered`, `focused` keys | Critical | `checkInToTags.ts`, `recommendationEngine.ts` |
| 2 | **Remove DEV_MODE RLS policies** — DROP all `dev-user-123` policies from production | Critical | New DB migration |
| 3 | **Add error handling** — show toast on save failure, only navigate on success | High | `DailyCheckIn.tsx`, `CheckInDetail.tsx` |
| 4 | **Delete deprecated files** — remove dead `mentalFitnessEngine.ts` and `intelligenceEngine.ts` | Low | Delete 2 files |

Files changed: `checkInToTags.ts`, `recommendationEngine.ts`, `DailyCheckIn.tsx`, `CheckInDetail.tsx`, 1 DB migration, delete 2 deprecated files.

