
Goal: fix the remaining drift between Outer Readiness Brief and Proactive Mastery Plan, make event titles visually distinct, ensure auth and dev mode follow the same server-driven logic, and correct plan completion so it reflects only the currently active prescribed plan.

What’s still broken
- The mastery plan brief is still only partially contextual. `generatePlanBrief()` now mentions readiness and wearables, but it still mostly anchors on generic templates and quoted phrase text instead of synthesizing outer readiness context, score, coach signals, and current-state rationale.
- Progress is inconsistent with visible cards. In `DailyRitual.tsx`, completed modules are filtered out visually, but `ritualStatus.totalCount` still comes from the stored ritual row / prior plan length, so the UI can show “1 of 3 completed” while only 2 cards remain.
- Edge caching can still serve stale plans. `generate-mastery-plan` still rate-limits by `userId + period` only, so a changed check-in can return the old plan for 30s.
- Outer readiness can still lag same-day state changes. `compute-outer-readiness` fetches recent check-ins, but its same-day context does not yet explicitly detect “earlier state vs latest state” and rewrite evening context accordingly.
- Event emphasis is not yet standardized. Current UI renders plain strings; event titles are not visually distinguished in either card.
- Dev/auth parity must be preserved end-to-end. The good news: both edge functions already support dev bypass, so the remaining work is to ensure the new logic lives server-side and both clients call the same paths.

Implementation plan

1. Fix mastery plan server-side state sync and stale-cache behavior
- File: `supabase/functions/generate-mastery-plan/index.ts`
- Replace the current cache key (`userId:period`) with a state fingerprint that includes:
  - period
  - latest check-in timestamp / created_at
  - latest check-in outcome
  - latest energy balance
  - clarity/confidence
  - completed practice ids for the current ritual row
  - recommended practice ids for the current ritual row if present
- Keep the 30s memory cache, but key it by this fingerprint so any updated check-in or completion forces a new plan.
- Also persist `latestCheckinTimestamp` on `PlanRequest` since the type already expects it but it is not populated now.

2. Make the mastery plan brief genuinely contextual
- File: `supabase/functions/generate-mastery-plan/index.ts`
- Rewrite `generatePlanBrief()` so it composes two sentences from:
  - decision readiness score and tier
  - current check-in outcome
  - wearable recovery strain
  - outer readiness phrase
  - outer readiness context
  - relevant coach insight / pattern insight
  - meeting load / remaining meetings
- Avoid generic fallback lines like “This evening sequence helps you close the day...”
- Use the outer readiness context as rationale, not just the phrase in quotes.
- If a coach insight is relevant, weave it in subtly as supporting rationale, not as a separate unrelated sentence.

3. Ensure generate-mastery-plan and compute-outer-readiness stay perfectly aligned
- Files:
  - `supabase/functions/generate-mastery-plan/index.ts`
  - `supabase/functions/compute-outer-readiness/index.ts`
- Keep the existing server-to-server call, but tighten the contract:
  - include the freshest check-in timestamp / created_at
  - make sure current-window check-in selection is ordered by latest creation time, not only `checkin_date`
- In `compute-outer-readiness`, add same-day shift logic:
  - compare the latest 2 same-day check-ins
  - if readiness dropped or improved materially, reflect that in evening context
  - example pattern: “Your latest check-in now shows depletion after a dense day...”
- This will make the outer brief change when the user re-checks in after meetings end.

4. Correct active-plan completion math
- Files:
  - `src/components/home/DailyRitual.tsx`
  - `supabase/functions/daily-rituals/index.ts`
  - `src/utils/dailyRituals.ts`
- Treat completion as intersection against the current active plan only:
  - `completedCount = completed_practice_ids ∩ currentPlan.moduleIds`
  - `totalCount = currentPlan.moduleIds.length`
- Do not derive visible progress from stale `recommended_practices_count`.
- When a refreshed plan replaces an older one, overwrite `recommended_practice_ids` and `recommended_practices_count` for that period with the new plan’s module ids/count.
- Keep relevant current-plan practices visible whether completed or not. Do not remove active-plan items from the carousel just because completed; instead dim/mark them complete.
- Only exclude practices that belonged to the old state/old brief and are no longer relevant to the refreshed plan.

5. Fix coach-card behavior for refreshed state
- File: `supabase/functions/generate-mastery-plan/index.ts`
- Make coach recommendations state-versioned:
  - if the refreshed state still calls for coach, include the coach card in the new plan even if the user completed a coach card from the prior state
  - if the refreshed state no longer calls for coach, do not include it and do not count it toward the new plan
- The safest approach is to give coach cards a state-aware id/fingerprint tied to the new brief/context so old completions don’t incorrectly suppress new relevant coach work.

6. Add event-title emphasis consistently in both cards
- Files:
  - `src/components/home/StrategicIntentionCard.tsx`
  - `src/components/home/DailyRitual.tsx`
  - add a small shared formatter component/helper
- Parse text for quoted event titles and render them as italic or bold-italic.
- Standardize server copy to wrap event titles in single quotes when referenced in brief/context/reasoning.
- Apply the same rendering to:
  - outer readiness context
  - mastery plan brief
  - any reasoning/context strings that mention event titles

7. Preserve auth-user and dev-mode parity
- Files:
  - `supabase/functions/generate-mastery-plan/index.ts`
  - `supabase/functions/compute-outer-readiness/index.ts`
  - `supabase/functions/daily-rituals/index.ts`
- Keep all decision logic server-side.
- Make sure dev mode uses the same edge-function logic paths already present via `x-dev-user-id` / `userId` fallback.
- Avoid adding any client-only branching for logic; only use client branching for auth header transport.

8. Tighten client invalidation so refreshed state appears immediately
- Files:
  - `src/pages/DailyCheckIn.tsx`
  - `src/pages/CheckInDetail.tsx`
  - `src/components/home/DailyRitual.tsx`
- Keep current query invalidation, but strengthen session cache invalidation:
  - clear all plan cache keys for the active day/period
  - make the session “energy hash” include clarity/confidence and latest check-in timestamp
- On load, if the current ritual row’s recommended ids differ from the fetched plan ids, sync local state to the new plan immediately.

Technical notes
- `generate-mastery-plan` already passes full readiness inputs to `compute-outer-readiness`; the remaining gap is richer brief composition and cache/state freshness.
- `CheckInDetail.tsx` and `DailyCheckIn.tsx` already invalidate `outer-readiness`; the remaining issue is the edge cache key and weak client hash.
- `DailyRitual.tsx` currently filters completed modules out of view, which is causing confusion. For the behavior you described, active-plan items should remain visible and just show completion state.
- `compute-outer-readiness` currently stores `finalContext = patternOverride || theme.context`; this is where same-day shift-aware rewriting should be added.

Expected result after implementation
- Outer Readiness Brief updates immediately after a new check-in and reflects the latest same-day state.
- Proactive Mastery Plan brief explains why this sequence is prescribed for this user now, using score, context, outer brief, wearable signals, and coach context.
- Event titles stand out visually via quoted italic emphasis.
- Progress always matches the currently active plan only.
- Refreshed plans show the right currently relevant practices, including coach when newly relevant, without carrying irrelevant prior-state completions into the new plan.
