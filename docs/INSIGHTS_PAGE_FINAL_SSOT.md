# Insights Page - Final SSOT

**Status:** code-level build source of truth  
**Created:** 2026-06-30  
**Primary routes:** `/insights`, `/insights/:cardId`  
**Primary page files:** `src/pages/Insights.tsx`, `src/pages/InsightDetail.tsx`  
**Primary components:** `src/components/insights/*`  
**Primary edge functions:** `state-patterns-insights`, `performance-rhythm-insights`, `cause-effect-engine`, `level-trend-calendar`, `tiny-wins-insights`, `insights-semantic-analysis`

This document is the practical source of truth for the Insights page. It is based on the current code, not only the older architecture docs.

When this document conflicts with older Insights docs, verify against the live files above and update this file in the same change.

---

## 1. What Insights Is

Insights is the user's longer-horizon reflection layer. It translates accumulated check-ins, practices, coach data, calendar context, wearable data, and cause-effect patterns into cards the user can scan, open in detail, and share.

Insights is not the daily card source of truth. It should not generate Executive Home cards, Smart Nudges, Briefs, or Plans. It reads from the same underlying behavioural and readiness data, but its job is pattern recognition over time.

The page has two top-level tabs:

- `Progress`
- `Patterns`

The detail route renders full-card views:

- `/insights/leadership-patterns`
- `/insights/performance-rhythm`
- `/insights/performance-causality`
- `/insights/practice-effectiveness`

---

## 2. Route And Guard Contract

Routes are defined in `src/App.tsx`.

`/insights` and `/insights/:cardId` are wrapped by:

- `ProtectedRoute`
- `OnboardingGuard`
- `SubscriptionGuard`

Do not make Insights anonymously accessible. Do not bypass onboarding or subscription guards inside the page.

Nudge deep links may arrive as:

```text
/insights?highlight=consecutive_low
/insights?highlight=recovery_deficit
```

`Insights.tsx` switches to the `patterns` tab, scrolls to the matching `[data-highlight]` element, pulses it, and cleans the URL.

---

## 3. Page Ownership

### `src/pages/Insights.tsx`

Owns:

- tab state;
- highlight query param handling;
- per-day persistent cache hydration;
- top-level fetch orchestration for legacy/consolidated sections;
- progressive loading script;
- layout and summary row composition;
- navigation to detail pages.

It should not own:

- raw causality calculations;
- APNs or nudge decisions;
- onboarding status decisions;
- long-running pattern algorithms that already exist in edge functions.

### `src/pages/InsightDetail.tsx`

Owns:

- mapping card ids to full-card components;
- share capture wrapper;
- back navigation to `/insights`;
- fallback redirect to `/insights` for unknown card ids.

The detail page lazy-loads the card components. Keep this, because the Insights cards are heavy.

---

## 4. Card / Function Map

| User-facing card | Primary component | Primary data owner |
|---|---|---|
| Your Performance Trajectory | `LeadershipPatternsCard` | `state-patterns-insights` plus direct profile/check-in/theme reads |
| When You Perform Best | `PerformanceRhythmCard` | `performance-rhythm-insights` and `level-trend-calendar` |
| What Drains Your Performance | `PerformanceCausalityCard` | `cause-effect-engine` |
| What Restores Your Performance | `PracticeEffectiveness` | `content-feedback` and practice completion data |
| Daily show-up / streak views | `DailyShowUpCalendar`, `PerformanceStreaks`, `StreakWreath` | check-in / completion history |
| Inner readiness display | `InnerReadinessDial` | state-pattern/readiness payloads |
| Tiny wins themes | `Insights.tsx` state + `tiny-wins-insights` | `tiny_wins` and edge analysis |
| Semantic theme graph | `Insights.tsx` state + `insights-semantic-analysis` | coach/practice/wins/check-ins |

---

## 5. Edge Function Contracts

### `state-patterns-insights`

This is the consolidated state-pattern payload used by `Insights.tsx` and `LeadershipPatternsCard`.

Reads include:

- `profiles`
- `daily_checkins`
- `daily_themes`
- `user_coach_insights`
- `sanctuary_events`
- `daily_ritual_completions`
- `tiny_wins`
- `wearable_data`
- `dialogue_sessions`
- `calendar_connections`
- `behavior_logs`
- `inner_readiness_scores`

Returns fields such as:

- `distribution`
- `observation`
- `checkInCount`
- `weekData`
- `checkInStreak`
- `profileBaseline`
- `practiceData`
- leadership archetype/current-score fields
- coach strength/friction fields
- `hasWearable`
- `hasCalendar`
- `dataSourceNote`

Do not duplicate this aggregation inside React unless it is explicitly DEV_MODE fallback code.

### `performance-rhythm-insights`

Owns readiness rhythm, calendar interaction, level trend, streak, and diagnostic data for the performance rhythm card.

The UI should render the payload. It should not recompute the statistical gates in the component.

Important unlock gates:

- early messages before enough check-ins;
- richer calendar/cause-effect/presence insights after sufficient observations;
- explicit guidance when calendar or behaviour logs are missing.

### `cause-effect-engine`

Owns the cause-effect engine. `PerformanceCausalityCard` calls it and may force a recompute only when the cached payload is old-shaped.

Important rules:

- cached payload is allowed;
- force recompute is allowed only for stale/old cache shape or explicit diagnostics;
- preview mode can use `causalityMockData`;
- production should not use mock data when an authenticated token exists and the function works.

The engine reads:

- `calendar_events`
- `wearable_data`
- `daily_checkins`
- `brief_snapshots`
- `calendar_connections`

It may write diagnostics such as `wearable_signal_diagnostics` and cache rows used by downstream consumers.

### `level-trend-calendar`

Owns the production level/trend calendar payload. `LevelTrendCalendar` should call this edge function in production.

### `tiny-wins-insights`

Owns tiny-wins analysis. `Insights.tsx` calls it with a day window, currently `{ days: 30 }`.

### `insights-semantic-analysis`

Owns theme analysis across sources. Used for semantic themes, relationships, and bubble detail expansion.

---

## 6. Cache Contract

`Insights.tsx` uses `persistentBriefCache` helpers:

- `cacheKeys.insightsData(uid, today)`
- `cacheKeys.insightsScriptDone(uid, today)`
- `readPersistent`
- `writePersistent`
- `msUntilMidnight`

The page hydrates from per-day cache at mount so a revisit does not replay the full loader. Fresh fetches may still run silently and replace state.

Rules:

- cache is per user and per local day;
- cache should not outlive midnight;
- cache should not be shared across users;
- loading state should not flash when cached sections hydrate cleanly;
- DEV_MODE may use direct DB/local data paths, but production should use edge functions.

---

## 7. Progressive Unlock Contract

Insights must be data-honest.

If data is insufficient, show progressive unlock copy instead of fake insight. Examples already exist:

- first check-in prompt;
- check-ins needed to see readiness rhythm;
- calendar connection needed for event/readiness context;
- behaviour logs needed for cause-effect patterns;
- more high-stakes moments needed for presence insights.

Do not invent insight text when gates are not met.

---

## 8. Auth Contract

Production edge-function calls should carry an Auth0 token:

```ts
const accessToken = await getAuthToken();
supabase.functions.invoke('function-name', {
  headers: { Authorization: `Bearer ${accessToken}` },
  body,
});
```

If no token exists:

- production should fail gracefully;
- preview may use mock data where explicitly coded;
- do not use service-role credentials in the browser.

---

## 9. Data Tables Insights Depends On

Important tables include:

- `profiles`
- `daily_checkins`
- `daily_themes`
- `daily_ritual_completions`
- `sanctuary_events`
- `tiny_wins`
- `wearable_data`
- `calendar_events`
- `calendar_connections`
- `behavior_logs`
- `dialogue_sessions`
- `dialogue_messages`
- `user_coach_insights`
- `inner_readiness_scores`
- `brief_snapshots`
- `wearable_signal_diagnostics`
- pattern/cache tables written by cause-effect / causality functions

RLS should remain user-scoped using Auth0 `sub` where policies touch user rows.

---

## 10. Build Definition Of Done

An Insights change is done only when:

1. `/insights` loads for an onboarded subscribed user.
2. `/insights/:cardId` works for all supported card ids.
3. Unknown detail ids redirect to `/insights`.
4. Edge calls include Auth0 Authorization headers.
5. Loading state does not get stuck when one edge function fails.
6. Progressive unlock appears when data is insufficient.
7. Preview mocks are not used in production success paths.
8. Per-day cache is user-scoped and expires at midnight.
9. Nudge `highlight` links still switch to Patterns and pulse the target.
10. Share capture on detail pages excludes share controls.

