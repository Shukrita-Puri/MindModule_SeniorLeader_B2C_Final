

## Starred & Recent Activity — Full Audit

### STARRED ITEMS (Favorites)

**Storage:** Cloud (DB table `user_favorites` with RLS). No localStorage involved.

**Data Retention:** Unlimited — no TTL or cleanup. All favorites persist indefinitely.

**Schema:** `user_favorites` table with columns: `id`, `user_id`, `content_id`, `content_type`, `category`, `created_at`. Unique constraint on `(user_id, content_id)`.

**Auth Path:** Edge function `user-favorites` with `authenticateRequest()` → service_role client. Correctly scoped by userId from JWT.

**DEV_MODE Path:** Direct Supabase client queries against `user_favorites` table. DEV_MODE RLS policies were created in migration `20260125...` but then **dropped** in migration `20260305154847`. This means DEV_MODE direct DB queries will **fail silently** due to RLS deny-by-default.

**Read/Write Flow:**
- **Read:** `useFavorites.tsx` → `fetchFavorites()` → EF `GET_FAVORITES` (auth) or direct DB (dev)
- **Write:** `useFavorites.tsx` → `toggleFavorite()` → EF `ADD_FAVORITE`/`REMOVE_FAVORITE` (auth) or direct DB (dev)
- **Display:** `StarredItems.tsx` renders from `useFavorites()` hook

**Downstream Consumers:**
| Consumer | Reads From | Method |
|----------|-----------|--------|
| `StarredItems.tsx` | `useFavorites()` hook | Displays in sidebar |
| `DailyRitual.tsx` | `useFavorites()` → `isFavorite()` | Checks if ritual items are favorited |
| `PerformancePreparation.tsx` | `useFavorites()` | Favorite status for prep items |
| `JitCarousel.tsx` | `useFavorites()` → `isFavorite()` | Favorite badge on JIT pills |
| `PauseOutcomePage.tsx` | `useFavorites()` → `toggleFavorite()` | Star/unstar practices |
| `MicroInterventions.tsx` | Direct DB query `user_favorites` | Gets `favoriteContentIds` |

---

### CRITICAL BUG 1: EF `GET_FAVORITES` Returns Incomplete Data (HIGH)

**File:** `supabase/functions/user-favorites/index.ts` line 39

**Issue:** The `GET_FAVORITES` action only selects `content_id`:
```sql
.select('content_id')
```

But the client (`useFavorites.tsx` line 63) expects `content_type` and `category` too:
```typescript
favoritesData = data?.data || [];
// Later uses favorite.content_type and favorite.category
```

**Impact:** For **auth-path users**, `content_type` and `category` are `undefined` on every favorite. This breaks:
- `StarredItems.tsx` navigation — `handlePracticeClick()` checks `content_type` to route to soundscapes/guided-practices/micro-practices. With `undefined`, it always falls through to the `else` branch and navigates to `/recalibrate` instead of the correct practice page.
- Any downstream consumer checking `content_type` or `category`.

**DEV_MODE** is unaffected because it queries `content_id, content_type, category` directly.

**Fix:** Change EF line 39 from `.select('content_id')` to `.select('content_id, content_type, category')`.

---

### CRITICAL BUG 2: DEV_MODE RLS Policies Dropped (MEDIUM)

**Issue:** Migration `20260305154847` dropped the DEV_MODE RLS policies for `user_favorites`:
```sql
DROP POLICY IF EXISTS "Dev user can view favorites" ON public.user_favorites;
DROP POLICY IF EXISTS "Dev user can delete favorites" ON public.user_favorites;
DROP POLICY IF EXISTS "Dev user can insert favorites" ON public.user_favorites;
```

The `useFavorites.tsx` DEV_MODE path queries the DB directly using the anon key client. Without RLS policies allowing `user_id = 'dev-user-123'`, all queries return empty results (RLS deny-by-default). Favorites appear empty in DEV_MODE.

**Fix:** Route DEV_MODE through the Edge Function (same as auth path but with a dev token), or re-add the DEV_MODE RLS policies. The cleanest approach is to make DEV_MODE use the EF path as well, since the EF uses service_role which bypasses RLS.

---

### RECENT ACTIVITY

**Storage:** Cloud (reads from 3 DB tables). No localStorage involved.

**Data Retention:** Shows last 10 items total, pulling 5 most recent from each source:
- `dialogue_sessions` (coach conversations) — 5 most recent
- `daily_checkins` (check-ins) — 5 most recent
- `sanctuary_events` (practice completions) — 5 most recent

**Auth Path:** Coach sessions fetched via EF `dialogue-session-manage` with `LIST_COACH_SESSIONS` action. Check-ins and sanctuary events fetched via **direct Supabase client queries**.

**DEV_MODE Path:** Coach sessions fetched via direct DB query on `dialogue_sessions` + `dialogue_messages`. Check-ins and sanctuary events use same direct queries as auth path.

**Read/Write Flow:**
- **Read only** — `useRecentActivity.ts` aggregates from 3 sources, sorts by date, returns top 10
- **Display:** `RecentActivity.tsx` renders grouped by date (Today/Yesterday/Day name)
- **Navigation:** Clicking coach items navigates to `/coach` with `resumeSession` state

**Downstream:** No downstream consumers — `useRecentActivity` is terminal (display only).

---

### BUG 3: Auth Path Direct DB Queries Will Fail for Auth0 Users (HIGH)

**File:** `useRecentActivity.ts` lines 94-129

**Issue:** The check-in and sanctuary_events queries use `supabase.from(...)` directly with the browser client:
```typescript
const { data: checkins } = await supabase
  .from('daily_checkins')
  .select(...)
  .eq('user_id', user.id);
```

For Auth0 users, `auth.uid()` returns the Supabase anonymous session UUID, **not** the Auth0 `sub` claim. The RLS policies on `daily_checkins` use:
```sql
USING (((auth.uid())::text = user_id))
```

But `user_id` in the table stores the Auth0 `sub` (e.g., `auth0|abc123`), while `auth.uid()` returns the Supabase anon UUID. These don't match, so **RLS blocks all rows**. The recent activity sidebar shows no check-ins or practice completions for authenticated users.

The coach sessions work because they go through the EF (which uses service_role), but check-ins and sanctuary_events are broken.

**Fix:** Route these queries through an Edge Function that uses `authenticateRequest()` + service_role, consistent with the rest of the architecture.

---

### BUG 4: `MicroInterventions.tsx` Direct DB Query (MEDIUM)

**File:** `src/components/home/MicroInterventions.tsx` line 144-147

**Issue:** Same as Bug 3 — queries `user_favorites` directly via browser client. Auth0 users' `auth.uid()` won't match the stored `user_id`. Returns empty favorites list.

**Fix:** Use `useFavorites()` hook (which routes through the EF) instead of direct DB query.

---

### SUMMARY

| # | Bug | Severity | Fix |
|---|-----|----------|-----|
| 1 | EF `GET_FAVORITES` only returns `content_id`, missing `content_type` and `category` — breaks starred item navigation for auth users | HIGH | Add columns to EF select |
| 2 | DEV_MODE RLS policies for `user_favorites` were dropped — dev favorites broken | MEDIUM | Route DEV_MODE through EF |
| 3 | `useRecentActivity` direct DB queries for check-ins and sanctuary_events fail for Auth0 users due to RLS mismatch | HIGH | Route through EF |
| 4 | `MicroInterventions.tsx` direct `user_favorites` query fails for Auth0 users | MEDIUM | Use `useFavorites()` hook |

### IMPLEMENTATION PLAN

**Step 1:** Fix EF `user-favorites/index.ts` — change `GET_FAVORITES` select to include `content_id, content_type, category`.

**Step 2:** Update `useRecentActivity.ts` — route check-in and sanctuary_events fetches through the `daily-checkins` EF (for check-ins) and a new action or existing EF (for sanctuary_events). Both paths (auth + dev) should use service_role-backed queries.

**Step 3:** Fix `MicroInterventions.tsx` — replace direct `user_favorites` query with the `useFavorites()` hook or route through the EF.

**Step 4:** Consolidate DEV_MODE favorites path to use the EF (service_role bypasses RLS, so no dev-specific policies needed).

**Files changed:** 3-4 file edits, 0 DB migrations needed.

