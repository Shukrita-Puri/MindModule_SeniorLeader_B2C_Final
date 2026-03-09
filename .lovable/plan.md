

# Insights Page — Full Audit & Fix Plan

## Critical Bug Found: Auth0 RLS Mismatch on Direct Client Queries

The console logs reveal the root cause of most issues:

```
[Insights] Fetched check-ins: 0 for user: google-oauth2|113352274928800158207
[Insights] Profile baseline fetched: null
```

The user HAS done check-ins, but the Insights page shows 0. This is because two functions in `Insights.tsx` query the database **directly via the Supabase client** instead of through edge functions. The RLS policies use `(auth.uid())::text = user_id`, but `auth.uid()` returns the Supabase auth UID — NOT the Auth0 sub (`google-oauth2|...`). So these queries silently return empty results.

---

## Bugs Identified

### BUG 1 (Critical): `fetchInsightsData()` — direct client query returns 0 check-ins
- **Location**: `Insights.tsx` lines 204-301
- **Impact**: `weekData` is empty, `checkInStreak` is 0, week view shows nothing
- **Root cause**: Queries `daily_checkins` and `sanctuary_events` directly via Supabase client. RLS blocks Auth0 users.
- **Fix**: Route through an edge function, or merge this data into the existing `state-patterns-insights` edge function response.

### BUG 2 (Critical): `fetchProfileBaseline()` — direct client query returns null
- **Location**: `Insights.tsx` lines 176-202
- **Impact**: `profileBaseline` is null — archetype, baseline scores, growth priority all missing from the page
- **Root cause**: Queries `profiles` directly. Same RLS mismatch.
- **Fix**: The `state-patterns-insights` edge function already fetches profile data. Return baseline fields in its response and consume them in `Insights.tsx`.

### BUG 3 (High): "Lean On" / "Watch For" appears hardcoded
- **Location**: `LeadershipPatternsCard.tsx` lines 378-413
- **Root cause**: This is a *downstream effect* of the data flow working correctly but having no coach insights yet. The component falls back to archetype-based `leanOn`/`watchFor` when `coachStrength`/`coachFriction` are null. The archetype text looks static/hardcoded but is actually derived from onboarding dimension scores. This is **correct behavior** for early users — it personalizes further after coach sessions produce strength/growth insights.
- **Fix**: Add a subtle label like "Based on your archetype" vs "From your coach" to make the source transparent.

### BUG 4 (Medium): `insightsTier` and `checkInCount` derive from `statePatterns` edge function
- The `state-patterns-insights` edge function does return `checkInCount` correctly (it uses service_role). But the **week view data** (daily energy bars, streak) comes from `fetchInsightsData` which is broken. So the page shows card insights but no week-level data.

### BUG 5 (Low): Duplicate edge function call
- `LeadershipPatternsCard` calls `state-patterns-insights`
- `Insights.tsx` `fetchStatePatterns()` also calls `state-patterns-insights`
- Same endpoint called twice per page load. Should consolidate.

---

## Data Flow & Security Audit (All Clear)

- **Upstream data**: Edge functions (`state-patterns-insights`, `tiny-wins-insights`, `insights-semantic-analysis`, `performance-rhythm-insights`) all use `service_role` key + Auth0 JWT verification. They correctly pull from `daily_checkins`, `profiles`, `daily_themes`, `user_coach_insights`, `tiny_wins`, `dialogue_sessions`, `dialogue_messages`, `wearable_data`, `calendar_events`, `behavior_logs`, `inner_readiness_scores`, `daily_ritual_completions`, `sanctuary_events`.
- **Downstream**: All sensitive scoring (dimension evolution, friction, archetype resolution, AI observations) computed server-side. Client receives pre-computed results only.
- **Storage**: No sensitive data in localStorage. Only ephemeral UI state in React state.
- **DEV_MODE**: All paths correctly branch on `DEV_MODE` flag. When `DEV_MODE=false` (production), edge functions handle data access. No DEV_MODE leaks.

## Scoring Logic Audit (Correct)

- **Friction Frequency**: Correctly counts unique *days* with low states (not individual check-ins) — lines 175-184 of edge function
- **Trend Direction**: Compares 7-day friction % vs prior 7-day — correct
- **Dimension Evolution**: Uses multi-signal weighted model (baseline, felt state, coach keywords, practices, HRV, pre-event sessions) with weight redistribution when signals unavailable — robust
- **Archetype Resolution**: Cascade of 5 archetypes based on dimension thresholds — correct and consistent between client DEV_MODE and edge function

---

## Implementation Plan

### 1. Extend `state-patterns-insights` edge function response
Add to its response payload:
- `weekData`: last 7 days of check-in outcomes + energy_balance (for the week view)
- `checkInStreak`: consecutive days with check-ins
- `profileBaseline`: { mentalFitnessBaseline, userArchetype, growthPriority }
- `practiceData`: aggregated practice stats from `sanctuary_events`

### 2. Refactor `Insights.tsx` to consume consolidated response
- Remove `fetchInsightsData()` and `fetchProfileBaseline()` (the two broken direct-query functions)
- Expand `fetchStatePatterns()` to populate `weekData`, `checkInStreak`, `practiceData`, and `profileBaseline` from the single edge function response
- This eliminates the RLS mismatch and the duplicate edge function call

### 3. Deduplicate `LeadershipPatternsCard` edge function call
- Pass the already-fetched `state-patterns-insights` data down as a prop to `LeadershipPatternsCard` instead of having it make its own duplicate call

### 4. Clarify "Lean On" / "Watch For" source
- When showing archetype-based fallback (no coach insights), add a subtle label: "Based on your archetype" 
- When showing coach-sourced insights, label as "From your coach"

