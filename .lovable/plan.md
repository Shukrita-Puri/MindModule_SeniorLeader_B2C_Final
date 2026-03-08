

# Final Audit: Inner Readiness + Outer Readiness Brief

## Status: Both edge functions are live, returning correct data, no crashes.

The network logs confirm both `compute-inner-readiness` (200, score=46, tier=managing) and `compute-outer-readiness` (200, Sunday evening theme correctly served) are operational. The `safeTier` fix is working. The `finalPhrase` persistence fix is in place.

---

## Critical Bug Found: Archetype Always Null (Priority 4 Never Fires)

**Root cause:** In `useOuterReadiness.ts` (line 49-53), the client queries `profiles.user_archetype` using the Supabase anon key. But profiles has deny-by-default RLS — the query returns `[]` (confirmed in network logs). The archetype is passed as `null` to the edge function, meaning **Priority 4 (Archetype × Tier) in the Lean On/Watch For cascade never activates**.

The edge function already has a service role client (`db` on line 612) but never uses it to fetch the archetype. It trusts the client to pass it.

**Impact:** Every user without coach insights, without extreme C×C, and outside late evening hours falls through to Priority 5 (generic tier fallback) instead of getting their personalized archetype-specific Lean On/Watch For.

**Fix:** Move the archetype fetch server-side inside `compute-outer-readiness/index.ts`. The edge function already has the `userId` and service role client. Query `profiles.user_archetype` there and ignore the client-passed archetype. Then remove the redundant client-side profiles query from `useOuterReadiness.ts`.

### Changes

**File 1: `supabase/functions/compute-outer-readiness/index.ts`**
- After line 612, add a parallel fetch for `profiles.user_archetype` alongside coach insights and check-ins (3 parallel queries instead of 2)
- Use the server-fetched archetype instead of `body.archetype`

**File 2: `src/hooks/useOuterReadiness.ts`**
- Remove lines 49-53 (the client-side profiles query that returns empty due to RLS)
- Remove `archetype: profile?.user_archetype || null` from the request body (or keep it as a no-op fallback; the edge function will use its own server-side value)

### All Downstream Consumers — Confirmed Connected

| Consumer | Source | Status |
|---|---|---|
| `TodayStateCard.tsx` | `computeEnergyState()` → `compute-inner-readiness` | Working (200) |
| `StrategicIntentionCard.tsx` | `useOuterReadiness()` → `compute-outer-readiness` | Working (200) |
| `ExecutiveHome.tsx` | Both hooks | Working |
| `coachContextBuilder.ts` | `computeEnergyState()` + `fetchOuterReadiness()` | Connected |
| `JustInTimeIntervention.tsx` | `computeEnergyState()` | Connected |
| `DailyRitualCard.tsx` | `computeEnergyState()` | Connected |
| `useCoachConversation.ts` | `computeEnergyState()` | Connected |
| `insights-semantic-analysis` EF | Reads `daily_themes.theme_phrase` | Connected |
| `state-patterns-insights` EF | Reads `daily_themes.theme_phrase, theme_driver` | Connected |

### No Other Bugs Found

- C×C independent signal logic: correct in both functions
- Priority cascade: correctly ordered (0→1→2→3→4→5)
- Coach recency + contradiction: correctly implemented
- Pattern recognition: all outcomes + C×C patterns covered
- `safeTier` defensive guard: in place
- `finalPhrase` persisted to DB: confirmed
- CORS headers: correct
- Auth: Auth0 JWT verification via shared module

### Summary

One fix needed: move the archetype fetch from client-side (blocked by RLS) to server-side inside the edge function. This unlocks Priority 4 for all users with an archetype. Everything else is healthy and connected.

