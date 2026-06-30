# Insights Page - Final Wiring Guide

Use this guide when adding or repairing Insights page code. For the fuller contract, read `docs/INSIGHTS_PAGE_FINAL_SSOT.md`.

---

## 1. Start Here

Read these files first:

- `src/pages/Insights.tsx`
- `src/pages/InsightDetail.tsx`
- `src/components/insights/LeadershipPatternsCard.tsx`
- `src/components/insights/PerformanceRhythmCard.tsx`
- `src/components/insights/PerformanceCausalityCard.tsx`
- `src/components/insights/PracticeEffectiveness.tsx`
- `src/components/insights/LevelTrendCalendar.tsx`
- `supabase/functions/state-patterns-insights/index.ts`
- `supabase/functions/performance-rhythm-insights/index.ts`
- `supabase/functions/cause-effect-engine/index.ts`
- `supabase/functions/level-trend-calendar/index.ts`
- `supabase/functions/tiny-wins-insights/index.ts`
- `supabase/functions/insights-semantic-analysis/index.ts`

---

## 2. Correct Wiring Shape

```text
/insights
  |
  | ProtectedRoute + OnboardingGuard + SubscriptionGuard
  v
Insights.tsx
  |
  | per-day cache hydrate
  | edge function fetches
  v
Progress tab / Patterns tab
  |
  | card row taps
  v
/insights/:cardId
  |
  | lazy loaded full card
  | share capture wrapper
  v
card detail + optional share image
```

---

## 3. Do Not Duplicate

Do not duplicate:

- cause-effect calculations from `cause-effect-engine`;
- rhythm/statistical gates from `performance-rhythm-insights`;
- state-pattern aggregation from `state-patterns-insights`;
- level/trend calendar derivation from `level-trend-calendar`;
- semantic graph analysis from `insights-semantic-analysis`;
- onboarding/subscription guards inside Insights.

DEV_MODE fallback code may query DB directly, but production should use edge functions.

---

## 4. Function Calls

Production calls should use:

```ts
const accessToken = await getAuthToken();
await supabase.functions.invoke('function-name', {
  headers: { Authorization: `Bearer ${accessToken}` },
  body,
});
```

If there is no token:

- do not call the function;
- set loading false;
- show unlock/fallback/empty state;
- preview can use mocks only where already coded.

---

## 5. Detail Route Map

`InsightDetail.tsx` owns this map:

- `leadership-patterns` -> `LeadershipPatternsCard`
- `performance-rhythm` -> `PerformanceRhythmCard`
- `performance-causality` -> `PerformanceCausalityCard`
- `practice-effectiveness` -> `PracticeEffectiveness`

Adding a new detail card requires:

1. Add a card id to `InsightDetail.tsx`.
2. Add a row/tap target in `Insights.tsx`.
3. Ensure the component can render standalone.
4. Ensure share capture does not include buttons marked `data-share-hide`.

---

## 6. Highlight Deep Links

Preserve:

```text
/insights?highlight=<key>
```

Required behaviour:

- switch to `patterns`;
- find `[data-highlight="<key>"]`;
- scroll into view;
- add `nudge-highlight-pulse`;
- remove pulse after delay;
- clean query params with replace.

---

## 7. Cache Rules

Keep cache:

- per user;
- per day;
- expiring at midnight;
- silent on refresh after hydration.

Do not persist edge errors as successful cache payloads.

---

## 8. QA Checklist

Check these before calling Insights done:

- `/insights` loads after onboarding/subscription.
- `/insights/leadership-patterns` loads.
- `/insights/performance-rhythm` loads.
- `/insights/performance-causality` loads.
- `/insights/practice-effectiveness` loads.
- Unknown `/insights/bad-id` redirects.
- One failed edge function does not freeze the whole page.
- New users see unlock messages, not fake conclusions.
- `highlight` query works.
- Detail share button exports the card without the share control.

