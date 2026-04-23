

## Plan — Eliminate redundant loaders and serve cached content instantly across Brief, Plan, Insights and Onboarding Results

### Problem 1 root cause

Already-implemented "skip the script if cache hit" works **only within the same tab session**:

| Page | Cache store | Survives tab close? |
|---|---|---|
| Brief | React Query in-memory only | ❌ No |
| Plan | sessionStorage | ❌ No |
| Insights | sessionStorage flag (`insights-script-done`) | ❌ No |
| Onboarding Results | sessionStorage (`onboarding-results-cache-v1`) | ❌ No |

So when the user closes the app and reopens it (e.g. opens the iOS app fresh in the same morning window), every page replays its scripted "Reading your signals…" loader even though a brief already exists for that window in the DB.

The Brief case is the most visible: `useState(hadCacheAtMount)` reads only `queryClient.getQueryData(...)` — React Query is rebuilt empty on every fresh app launch, so `hadCacheAtMount = false` and the four-step narration plays again.

### Problem 2 status

The session-verification fix (silent `DelayedFallback`, no visible loader for ≤3s) is already in place across `App.tsx`, `ProtectedRoute.tsx`, and `OnboardingGuard.tsx`. Nothing more to do here.

### Fix: persistent per-window cache (works across full app reopen)

Promote the existing in-tab caches to `localStorage` (survives app close, scoped per user) for the four scripted pages. Same logic, durable storage, namespaced and self-expiring.

Storage helper: a tiny `src/utils/persistentBriefCache.ts` (new) exposing `read(key) / write(key, value, ttlMs) / clear(key)`. Reads return null if expired or malformed. No new dependencies.

#### 1. Brief — `src/components/home/DecisionReadinessBrief.tsx` + `src/hooks/useOuterReadiness.ts`

- In `useOuterReadiness`, on every successful query result, write the payload to `localStorage` under key `prb-cache:${userId}:${period}:${todayDate}` with a TTL until the end of the current window (Morning→12:00, Afternoon→18:00, Evening→05:00 next day, in user's timezone).
- In `useOuterReadiness`, supply `initialData` from this same `localStorage` read so React Query is hydrated synchronously on mount with the cached brief.
- In `DecisionReadinessBrief`, change `hadCacheAtMount` to also count a localStorage hit — i.e. if `outerBrief` is non-null at first render (because of `initialData`), treat it as a revisit: skip the scripted loader, skip the 5s CTA wait. Background refetch still runs silently and swaps content if anything changed.
- Result: returning to the Brief page (or reopening the app) within the same window renders the brief in one frame, no loader, no narration.

#### 2. Plan — `src/components/home/TodayThreePriorities.tsx`

- Replace the `sessionStorage.getItem('plan-data-…')` reads/writes with `localStorage` (same key shape, same shouldRegenerate guards, same TTL via the date+period key).
- The synchronous `initialCached` block at the top of the component (lines 117–131) already does the right thing — it just needs to read from `localStorage` so it survives a fresh app launch.
- Background refresh continues to run with `silent: true` and only flips `loading` true when no cache is present — already implemented, kept.
- JIT cache check stays as is; only the storage substrate changes.

#### 3. Insights ("Learn") — `src/pages/Insights.tsx`

- Replace `sessionStorage.getItem('insights-script-done')` with `localStorage`, scoped per user + UTC date: `insights-script-done:${userId}:${todayDate}`.
- Same effect: once the narrated mixture has played for this user today, every revisit renders the tabs/content immediately.
- Same key auto-expires the next day so a fresh day still gets the polished first-run reveal.

#### 4. Onboarding Results — `src/pages/onboarding/stages/Stage8Results.tsx`

- Promote `onboarding-results-cache-v1` from `sessionStorage` to `localStorage`, scoped per user: `onboarding-results-cache:${userId}`.
- The `cachedAtMount` synchronous read (line 66) already short-circuits the loader — only the storage layer changes.
- Cache stays valid until the user re-runs onboarding (cleared by the onboarding flow when answers change).

### What stays the same

- Session-verification path (`DelayedFallback`, 3s grace) — already done, no change.
- Brief Signal Contract (`awaitingSignals`) — untouched.
- Edge function payloads, scoring math, generation logic.
- Scripted loaders themselves — they still run for the genuine first generation in any window, just never on revisit/reopen.
- Per-page loader contracts (Brief → its own loader, Plan → its own, Insights → its own, Onboarding-Results → its own, all others → silent ≤3s then generic).

### Verification matrix

| Scenario | Brief | Plan | Insights | Results |
|---|---|---|---|---|
| First visit ever in this window | scripted loader → content | scripted loader → content | narrated mixture → tabs | scripted compute → report |
| Same tab, navigate away + back | instant render | instant render | instant render | instant render |
| Close tab, reopen later same window | **instant render** (was: full loader) | **instant render** (was: full loader) | **instant render** (was: narration replay) | **instant render** (was: recompute) |
| Close app, reopen iOS native, same window | **instant render** | **instant render** | **instant render** | **instant render** |
| New window starts (e.g. crossed noon) | scripted loader (correct — new brief due) | scripted loader (correct) | n/a (date-scoped) | n/a |
| New day | scripted (correct) | scripted (correct) | narrated mixture (correct) | unchanged (still cached until re-onboard) |
| Awaiting signals (no check-in, no wearable) | quiet "Awaiting today's signal" line, no loader | shows DailyRitual / empty state | unchanged | n/a |

### Files touched

- `src/utils/persistentBriefCache.ts` *(new — shared TTL helper)*
- `src/hooks/useOuterReadiness.ts` *(initialData + write-through)*
- `src/components/home/DecisionReadinessBrief.tsx` *(`hadCacheAtMount` honours localStorage)*
- `src/components/home/TodayThreePriorities.tsx` *(sessionStorage → localStorage for plan-data + plan-loaded keys)*
- `src/pages/Insights.tsx` *(per-user/per-day localStorage key for script-done)*
- `src/pages/onboarding/stages/Stage8Results.tsx` *(per-user localStorage cache)*
- `mem://ux/loading/cached-render-and-silent-verification` *(promote rule from "in-tab" to "across app reopen, per window")*

### Edge cases handled

- **Multi-user device**: every cache key embeds `userId`, so switching accounts can't leak briefs.
- **TTL boundaries**: window end is computed in user's IANA timezone (matches the standardized morning/afternoon/evening windows already used everywhere else), not UTC.
- **Sign-out**: `signOut()` (in `useAuth`) already clears app caches; we add a one-line sweep of any `prb-cache:*`, `plan-data-*`, `insights-script-done:*`, and `onboarding-results-cache:*` keys for that user on sign-out.
- **Stale brief between windows**: TTL guarantees the morning brief never bleeds into the afternoon — when the user opens the app at 12:01, `localStorage.getItem(...morning...)` returns expired/null and the afternoon brief is generated normally.
- **Awaiting-signals state**: this response also writes to cache so a user who opened the app with no signals doesn't see the loader on every reopen — they just see the quiet prompt instantly. Once they check in, normal invalidation kicks in.

