

## Mastery Plan + JIT — Full Audit (Post-Implementation)

This audit covers the current state after the previous round of fixes. It identifies remaining bugs, the trust gap status, and connectivity issues.

---

### CURRENT STATE SUMMARY

The previous implementation successfully:
- Added `authenticateRequest` to `generate-mastery-plan` EF with rate limiting
- Moved 5 upstream DB queries (calendar, checkins, profiles, feedback, coach insights) into the EF server-side
- Removed `userId` from the client request body
- Added energy hash-based sessionStorage staleness detection
- Routed restart ritual through `daily-rituals` EF (`DELETE_TODAY_RITUAL`)
- Routed JIT dismiss/snooze through `track-jit-skip` EF

---

### 1. CRITICAL BUGS (Remaining)

**BUG A (HIGH): `energyStateEngine.ts` direct `calendar_events` query fails for Auth0 users**

File: `src/utils/energyStateEngine.ts` lines 166-178

`computeEnergyState()` queries `calendar_events` directly via the browser client to compute `calendarLoad` and `calendarPressure`. The `calendar_events` RLS policy uses `user_id = (auth.jwt() ->> 'sub')` which works, BUT there's also a restrictive policy `auth.role() = 'service_role'` that is `Permissive: No`. Since ALL restrictive policies must pass, this blocks the query for non-service-role callers even if the JWT sub matches.

Impact: `calendarLoad` and `calendarPressure` sent to `generate-mastery-plan` are always `'none'` for Auth0 users. This means:
- Duration ceiling is never applied (no calendar-aware plan sizing)
- Calendar density is zero (affects time-of-day recommendations)
- The EF's own server-side calendar query works fine, but the client-supplied `calendarLoad`/`calendarPressure` signals are wrong

**BUG B (HIGH): `useOuterReadiness.ts` direct `profiles` query fails for Auth0 users**

File: `src/hooks/useOuterReadiness.ts` line 49-53

`fetchOuterReadiness()` queries `profiles` directly to get `user_archetype`. The `profiles` RLS has a restrictive `service_role` policy AND a restrictive `(auth.uid())::text = id` policy. For Auth0 users, `auth.uid()` is the Supabase anon UUID, not the Auth0 `sub` stored as `id`. So this returns null.

Impact: The `archetype` field passed to `compute-outer-readiness` is always null for Auth0 users, weakening the outer readiness phrase personalization.

**BUG C (MEDIUM): DEV_MODE broken for `daily-rituals` and `track-jit-skip` EFs**

Both EFs use `authenticateRequest()` which requires a valid JWT. Neither has a DEV_MODE bypass (only `generate-mastery-plan` has the `x-dev-user-id` header fallback). This means:
- `handleRestartRitual` fails silently in DEV_MODE
- JIT dismiss/snooze fails silently in DEV_MODE
- `getTodayRitual`, `upsertRitual` also go through `daily-rituals` EF — all broken in DEV_MODE

**BUG D (MEDIUM): `energyStateEngine.ts` DEV_MODE direct `daily_checkins` query will fail**

Line 115-134: DEV_MODE path queries `daily_checkins` directly, but the dev RLS policies were dropped in the recent migration. The query returns empty, so DEV_MODE energy state always falls back to defaults.

---

### 2. THE TRUST GAP — Should it be closed?

The client currently supplies these signals to `generate-mastery-plan`:

| Signal | Source | Can verify server-side? | Risk if manipulated |
|--------|--------|------------------------|-------------------|
| `innerReadinessTier` | `compute-inner-readiness` EF | Yes — re-call the EF | Different content tier selected |
| `innerReadinessScore` | Same EF | Yes | Score-based weighting changes |
| `outerReadinessPhrase` | `compute-outer-readiness` EF | Yes — re-call | Theme mapping changes |
| `outerReadinessDriver` | Same EF | Yes | Module focus changes |
| `favorites` | `user_favorites` DB | Yes — query server-side | Favorites bonus (+30) gaming |
| `completedToday` | `daily_ritual_completions` DB | Yes — query server-side | Could re-trigger completed content |
| `clarityLevel` | `daily_checkins` DB | Yes — query server-side | Clarity weighting changes |
| `confidenceLevel` | Same | Yes | Same |
| `checkInOutcome` | Same | Yes | Outcome-based tier changes |
| `calendarLoad` | Client-computed from `calendar_events` | Yes — compute in EF | Duration ceiling bypass |
| `calendarPressure` | Same | Yes | Same |

**Verdict:** Every single client-supplied signal CAN be verified server-side because the source data is all in the database. The risk is not just "different practice recommendations" — a manipulated `favorites` array with fake IDs could shift the +30 bonus to specific content, and a spoofed `calendarLoad: 'none'` bypasses the duration ceiling entirely. This isn't catastrophic, but it's a correctness issue that undermines the plan's intelligence.

**Recommendation:** Close the trust gap fully. The EF already queries `daily_checkins`, `profiles`, `calendar_events`, and `content_relevance_feedback` server-side. It should also:
1. Query `daily_ritual_completions` to get `completedToday` 
2. Query `user_favorites` to get `favorites`
3. Compute `calendarLoad`/`calendarPressure` from the calendar events it already fetches
4. Get `clarityLevel`, `confidenceLevel`, `checkInOutcome` from the checkins it already fetches
5. Re-derive `innerReadinessTier`/`innerReadinessScore` by calling `compute-inner-readiness` logic inline or trusting the persisted `energy_balance` score from `daily_checkins`
6. For outer readiness — either call `compute-outer-readiness` server-to-server or trust the cached value

This eliminates ALL client-supplied signals except `timezoneOffset` (which is inherently client-side and harmless).

---

### 3. AUTH PATH vs DEV_MODE STATUS

| Component | Auth Path | DEV_MODE | Fix needed? |
|-----------|-----------|----------|-------------|
| `generate-mastery-plan` EF | Working (JWT) | Working (`x-dev-user-id`) | No |
| `daily-rituals` EF | Working (JWT) | **BROKEN** (no bypass) | Yes |
| `track-jit-skip` EF | Working (JWT) | **BROKEN** (no bypass) | Yes |
| `energyStateEngine` calendar query | **BROKEN** (RLS) | **BROKEN** (RLS dropped) | Yes |
| `useOuterReadiness` profiles query | **BROKEN** (RLS) | **BROKEN** (RLS dropped) | Yes |
| `DailyRitual.tsx` plan generation | Working | Working | No |
| `JitCarousel.tsx` dismiss/snooze | Working | **BROKEN** | Yes |

---

### 4. UPSTREAM/DOWNSTREAM CONNECTIVITY

**Upstream → generate-mastery-plan:**

| Source | Connected? | Notes |
|--------|-----------|-------|
| Calendar events | Yes (server-side) | Working |
| Check-in pattern | Yes (server-side) | Working |
| Profile tags | Yes (server-side) | Working |
| Effective content | Yes (server-side) | Working |
| Coach insights | Yes (server-side) | Working |
| JIT skip history | Yes (server-side) | Working |
| Coach commitments | Yes (server-side) | Working |
| Inner readiness | **Partial** | Client-supplied, source is EF — could be spoofed |
| Outer readiness | **Partial** | Client-supplied, source is EF — could be spoofed |
| Favorites | **Partial** | Client-supplied, source is DB — could be spoofed |
| Completed today | **Partial** | Client-supplied, source is DB — could be spoofed |
| Calendar load/pressure | **BROKEN** | Client-side computation fails for Auth0 (Bug A) |

**Downstream:**

| Consumer | Connected? | Notes |
|----------|-----------|-------|
| Ritual completions (upsert) | Yes | Via EF |
| Ritual completions (delete) | Yes (Auth) / **Broken** (Dev) | Via EF, no dev bypass |
| JIT preferences (dismiss/snooze) | Yes (Auth) / **Broken** (Dev) | Via EF, no dev bypass |
| Practice navigation | Yes | localStorage queue |
| Coach navigation | Yes | Route state |

---

### 5. IMPLEMENTATION PLAN

**4 files modified, 0 DB migrations.**

#### Step 1: Close the trust gap — move ALL signals server-side in `generate-mastery-plan` EF

**File:** `supabase/functions/generate-mastery-plan/index.ts`

In `generateMasteryPlan()`, after the existing server-side queries (which already fetch calendar_events, daily_checkins, profiles, content_relevance_feedback, user_coach_insights):

1. **Compute `calendarLoad`/`calendarPressure`** from the calendar events already fetched (port `getCalendarMetrics` logic from `src/utils/energyStateScoring.ts` into the EF)
2. **Get `completedToday`** from `daily_ritual_completions` (already have service_role client)
3. **Get `favorites`** from `user_favorites` (already have service_role client)
4. **Get `clarityLevel`, `confidenceLevel`, `checkInOutcome`** from the `daily_checkins` query already being done (just extract more fields)
5. **Get `innerReadinessScore`/`innerReadinessTier`** from the most recent `daily_checkins.energy_balance` field (already persisted by energyStateEngine) — or use the check-in outcome to derive the tier using the same mapping the EF already has
6. **Get outer readiness phrase/driver** by calling `compute-outer-readiness` EF server-to-server via fetch, OR by inlining the lightweight theme-mapping logic

Update `PlanRequest` to remove all client-supplied fields. The client request body becomes just `{ timezoneOffset: number }`.

#### Step 2: Simplify `DailyRitual.tsx` further

**File:** `src/components/home/DailyRitual.tsx`

- Remove `computeEnergyState` and `fetchOuterReadiness` calls from `loadPlan()`
- Remove the energy hash staleness check (no longer needed — EF fetches fresh data every time, rate-limited to 30s)
- `requestBody` becomes just `{ timezoneOffset: new Date().getTimezoneOffset() }`
- Keep energy state computation for the **UI display** (TodayStateCard etc.) but NOT for plan generation

#### Step 3: Add DEV_MODE bypass to `daily-rituals` and `track-jit-skip` EFs

**Files:** `supabase/functions/daily-rituals/index.ts`, `supabase/functions/track-jit-skip/index.ts`

Add the same pattern as `generate-mastery-plan`: if `authenticateRequest` fails and `ENVIRONMENT !== 'production'`, check for `x-dev-user-id` header.

#### Step 4: Fix JitCarousel DEV_MODE header

**File:** `src/components/home/JitCarousel.tsx`

Add `if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;` in `trackJitAction`.

---

### Additional Notes

| Issue | Resolution |
|-------|-----------|
| Trust gap (all client signals) | Fully closed — EF computes everything server-side |
| `calendarLoad`/`calendarPressure` broken for Auth0 | Fixed — computed server-side from EF's own calendar query |
| `useOuterReadiness` profiles query broken | No longer relevant for plan generation (EF handles it) |
| DEV_MODE broken for rituals/JIT | Fixed with `x-dev-user-id` bypass |
| `energyStateEngine` direct calendar query | Remains for UI display (non-critical) — plan generation no longer depends on it |

**Files changed:** 4 (`generate-mastery-plan/index.ts`, `DailyRitual.tsx`, `daily-rituals/index.ts`, `track-jit-skip/index.ts`). 0 DB migrations.

