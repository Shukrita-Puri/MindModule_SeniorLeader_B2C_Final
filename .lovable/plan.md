

## Mastery Plan + JIT — Implementation Plan

This plan addresses all 4 bugs from the audit plus the additional issues you raised (client trust gap, sessionStorage staleness, empty userId fallback, rate limiting, DEV_MODE fix).

### Changes Overview

**4 files modified, 0 DB migrations.**

---

### Step 1: Add auth + move upstream queries into `generate-mastery-plan` EF

**File:** `supabase/functions/generate-mastery-plan/index.ts`

**Handler changes (lines 1245-1270):**
- Import `authenticateRequest` from `../_shared/auth.ts`
- Call `authenticateRequest(req, corsHeaders)` — use verified `userId` from JWT, ignore `body.userId`
- Add per-user rate limiting: before doing any work, query a simple in-memory map keyed by userId with a 30-second cooldown. If the user called within 30s, return the previous response from a cache (or a 429). This prevents LLM cost amplification. (Note: the EF doesn't call an LLM — it's pure algorithmic scoring — but the rate limit still prevents abuse of DB queries.)

**New server-side queries (inside `generateMasteryPlan`, after existing skip/commitment queries around line 935):**
- `calendar_events`: SELECT for user, next 48h (currently done client-side at DailyRitual line 283)
- `daily_checkins`: SELECT last 7 outcomes for pattern detection (currently client-side line 303)
- `profiles`: SELECT `practice_priority_tag, pressure_context_tag, archetype` (currently client-side line 327)
- `content_relevance_feedback`: SELECT content_ids with star_rating >= 4 (currently client-side line 339)
- `user_coach_insights`: SELECT active insights with confidence >= 0.6, limit 50 (currently in `coachInsightsExtractor.ts`)

These queries use the existing `supabaseClient` (service_role), so no RLS issues. The `PlanRequest` interface will drop `calendarEvents`, `coachInsights`, `effectiveContent`, `patternInsight`, `practicePriorityTag`, `pressureContextTag`, `archetype` — these are now fetched server-side from the verified userId.

**Trust gap note:** `innerReadinessTier`, `innerReadinessScore`, `outerReadinessPhrase`, `outerReadinessDriver`, `favorites`, `completedToday`, `clarityLevel`, `confidenceLevel`, `checkInOutcome`, `calendarLoad`, `calendarPressure` remain client-supplied. These are pre-computed signals from other EFs (energy state, outer readiness) and local UI state. A compromised client could manipulate these to game content selection. This is an accepted risk for now — the impact is limited to seeing different practice recommendations (no data exfiltration or privilege escalation). A future hardening pass could verify these server-side by re-fetching from their source tables.

---

### Step 2: Simplify `DailyRitual.tsx` client-side

**File:** `src/components/home/DailyRitual.tsx`

- **Remove** 5 direct DB queries (calendar_events, daily_checkins, profiles, content_relevance_feedback, user_coach_insights) — lines 275-345
- **Remove** `getActiveCoachInsights` import
- **Simplify** `requestBody` to only pass: `innerReadinessTier`, `innerReadinessScore`, `outerReadinessPhrase`, `outerReadinessDriver`, `calendarLoad`, `calendarPressure`, `favorites`, `completedToday`, `timezoneOffset`, `clarityLevel`, `confidenceLevel`, `checkInOutcome`
- **Fix empty userId:** Remove `userId: user?.id || ''` from the request body entirely (auth is now handled by JWT in the EF)
- **Fix sessionStorage staleness:** After setting the cached plan, also store the energy state hash. On reload, compare current energy state hash against stored — if different, invalidate the cache and regenerate. This catches mid-day energy changes.
- **Fix restart ritual:** Replace direct `supabase.from('daily_ritual_completions').delete()` (line 504) with `supabase.functions.invoke('daily-rituals', { body: { action: 'DELETE_TODAY_RITUAL' } })`

---

### Step 3: Add `DELETE_TODAY_RITUAL` action to `daily-rituals` EF

**File:** `supabase/functions/daily-rituals/index.ts`

- Add `'DELETE_TODAY_RITUAL'` to the `RequestBody` action union type
- Add case: delete from `daily_ritual_completions` where `user_id = userId` and `ritual_date = today`
- Uses existing `authenticateRequest` + service_role pattern

---

### Step 4: Fix JitCarousel dismiss/snooze

**File:** `src/components/home/JitCarousel.tsx`

- Replace direct `supabase.from('jit_preferences').insert()` in `handleDismiss` and `handleSnooze` with `supabase.functions.invoke('track-jit-skip', { body: { action: 'dismissed'/'snoozed', eventType, eventTitle } })`
- The `track-jit-skip` EF already exists with `authenticateRequest()` — no EF changes needed
- Remove unused `DEV_MODE`/`DEV_USER` imports and direct DB access

---

### Step 5: DEV_MODE fix

**Approach:** In `DailyRitual.tsx` and `JitCarousel.tsx`, DEV_MODE follows the same EF path as auth users. The EFs use `authenticateRequest()` which requires a Bearer token. The existing `token || anonKey` pattern (per memory) sends the anon key when no Auth0 token exists. The `_shared/auth.ts` will reject the anon key (it's not a valid Auth0 JWT).

**Fix:** In `generate-mastery-plan`'s new auth block, add a DEV_MODE bypass: if auth fails AND the request body contains `devMode: true` AND `Deno.env.get('ENVIRONMENT') !== 'production'`, fall back to `body.userId`. This keeps production locked down while allowing dev testing. Same pattern for `track-jit-skip` (already has auth — just needs the dev bypass if not already present).

Alternatively (simpler): in `DailyRitual.tsx`, when `DEV_MODE` is true, pass the userId in a `x-dev-user-id` header. The EF checks for this header only when JWT verification fails and a `DEV_ALLOWED` env var is set.

---

### Additional Notes

| Issue | Resolution |
|-------|-----------|
| Client trust gap | Documented above — accepted risk, no data exfil possible |
| sessionStorage staleness | Energy state hash comparison before serving cache |
| Empty userId fallback | Removed from request body — auth is JWT-only |
| Rate limiting | 30s per-user cooldown in EF (in-memory map) |
| DEV_MODE broken | Dev header bypass when non-production env |
| `coachInsightsExtractor.ts` | No changes needed — its only consumer (DailyRitual) no longer calls it. The module remains available for future use but the direct DB query is no longer in the critical path. |

**Files changed:** 4 (generate-mastery-plan EF, DailyRitual.tsx, JitCarousel.tsx, daily-rituals EF). No DB migrations.

