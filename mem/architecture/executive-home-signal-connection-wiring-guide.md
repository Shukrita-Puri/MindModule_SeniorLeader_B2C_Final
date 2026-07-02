---
name: Executive Home Signal & Connection Wiring Guide
description: Operational wiring guide for how Executive Home, Apple Health, Apple Calendar, wearable dedupe, and reason-aware awaiting copy flow through the codebase.
type: architecture
---

This guide complements [executive-home-signal-connection-ssot.md](</mem/architecture/executive-home-signal-connection-ssot.md>) and explains where the memory is actually wired in code.

## 1. Wiring Principle

The SSOT decides the product rule. The wiring guide decides how that rule is enforced in code.

Every surface that can render or persist Executive Home state must read the same readiness contract and must not invent its own fallback:

- MRS
- Brief
- Plan
- signal pills and their icons
- snapshot cache
- side-panel / recent-brief surfaces
- Apple Health / Apple Calendar connection state
- wearable merge and dedupe

If a surface cannot prove the current-window state is valid, it must fall back to the shared awaiting contract rather than a stale local cache.

## 2. Core Data Flow

```text
HealthKit / Apple Calendar / Oura / Calendar
  -> sync / auth / persistence edge functions
  -> user_integrations / calendar_connections / wearable_data / calendar_events
  -> compute-inner-readiness
  -> compute-outer-readiness
  -> useOuterReadiness / useCurrentBriefSnapshot / useMasteryPlanSnapshot
  -> DecisionReadinessBrief / MrsPage / TodayThreePriorities
```

The wiring rule is simple:

- backend owns the authoritative connection and persistence state;
- frontend owns the visual contract;
- shared helpers translate authoritative state into reason-aware copy.

## 3. Home Surface Wiring

### 3.1 MRS

Read path:

- `src/hooks/useOuterReadiness.ts`
- `src/hooks/useMrsSnapshot.ts`
- `src/components/home/mrs/MrsPage.tsx`

Wiring notes:

- `briefMode === 'cold-start'` and `innerReadinessState === 'awaiting'` are the current-window waiting signals.
- `hasCurrentPeriodSignal` is the guard for whether the score is actually live.
- The awaiting subtitle should come from the shared reason-aware helper, not hardcoded copy.
- Do not let a stale score or stale snapshot override an awaiting/null live state.

### 3.2 Brief

Read path:

- `src/hooks/useOuterReadiness.ts`
- `src/hooks/useCurrentBriefSnapshot.ts`
- `src/components/home/DecisionReadinessBrief.tsx`

Wiring notes:

- `cardsAwaiting` is the shared hard gate.
- Brief snapshots are renderable only when the snapshot is not awaiting and contains real phrase/body text.
- If the backend says awaiting, the Brief should show the awaiting copy and the pills should be neutral.
- The side-panel / recent-brief list must only show delivered Briefs that were actually visible.

### 3.3 Plan

Read path:

- `src/components/home/TodayThreePriorities.tsx`
- `src/hooks/useMasteryPlanSnapshot.ts`
- `supabase/functions/generate-mastery-plan/index.ts`

Wiring notes:

- Plan hydration must happen after the shared awaiting gate.
- The plan should not hydrate from snapshot/cache if MRS is awaiting/null.
- The edge function must also short-circuit when the incoming MRS state says awaiting.
- Plan copy should use the same reason-aware awaiting helper so the page does not drift from MRS/Brief.

## 4. Connection Wiring

### 4.1 Apple Health / Wearable

Read / write path:

- `src/hooks/useWearableSync.ts`
- `src/services/wearableSyncService.ts`
- `supabase/functions/persist-wearable-data/index.ts`
- `supabase/functions/check-connections-status/index.ts`
- `supabase/functions/compute-outer-readiness/index.ts`

Wiring notes:

- HealthKit permission is the authority signal.
- `connected_but_waiting_for_data` means the integration is still alive, but there is no fresh metric yet.
- `sync_delayed` means the integration is alive, but persistence or native fetching is behind.
- Only explicit revocation becomes `permission_revoked`.
- Wearable data should be resolved canonically, not by whichever provider wrote last.

### 4.2 Apple Calendar

Read / write path:

- `src/hooks/useCalendarSync.ts`
- `src/services/appleCalendarSync.ts`
- `supabase/functions/calendar-auth/index.ts`
- `supabase/functions/sync-apple-calendar/index.ts`
- `supabase/functions/check-connections-status/index.ts`
- `supabase/functions/compute-outer-readiness/index.ts`

Wiring notes:

- Apple Calendar is native-permission driven, not OAuth refresh-token driven.
- Temporary sync failure must not clear the connection just because events did not arrive.
- The connection row should be touched even when the event payload is empty or delayed.
- `permission_revoked` only when native permission is explicitly denied.

### 4.3 Google / Microsoft Calendar

Read / write path:

- `supabase/functions/calendar-auth/index.ts`
- `supabase/functions/sync-calendar/index.ts`
- `supabase/functions/refresh-calendar-tokens/index.ts`
- `supabase/functions/check-connections-status/index.ts`

Wiring notes:

- OAuth token refresh is the durability mechanism.
- These providers can remain connected across token refresh cycles.
- Do not apply Apple-style permission semantics to them.

## 5. Cache And Snapshot Wiring

These caches are part of the UX contract, not just performance optimization.

Important files:

- `src/hooks/useOuterReadiness.ts`
- `src/hooks/useCurrentBriefSnapshot.ts`
- `src/hooks/useMasteryPlanSnapshot.ts`
- `src/utils/persistentBriefCache.ts`
- `src/components/home/DecisionReadinessBrief.tsx`
- `src/components/home/TodayThreePriorities.tsx`

Wiring rules:

- Cache keys must be scoped to the current user, local date, and time window.
- A real brief always supersedes an awaiting marker for that window.
- An awaiting marker must not be treated as a delivered brief.
- Refresh actions should clear stale state before rehydrating.
- Plan and Brief should never resurrect stale content once the shared gate flips back to awaiting.

## 6. Reason-Aware Copy Wiring

The shared helper is the single place that turns raw integration status into copy.

Current helper:

- `src/utils/readinessAwaitingCopy.ts`
- server mirror: `supabase/functions/_shared/copy/awaiting.ts`

Wiring contract:

- Use the helper in MRS, Brief, and Plan.
- Prefer integration-specific messaging when the app knows the status.
- Fall back to the generic awaiting copy only when the status is too thin to explain more.
- Keep the server mirror and client helper aligned.

## 7. Dedupe Wiring

Wearable dedupe is now a first-class wiring concern.

Important files:

- `supabase/functions/_shared/wearable/canonical.ts`
- `supabase/functions/persist-wearable-data/index.ts`
- `supabase/functions/sync-oura/index.ts`
- `supabase/functions/compute-outer-readiness/index.ts`

Wiring rules:

- merge per metric, not just per day;
- preserve source attribution;
- do not let the last writer erase a better metric source;
- MRS / Brief / Plan should consume canonical resolved wearable context.

## 8. What Should Trigger A Refresh

These events must invalidate the relevant home caches:

- check-in save
- wearable sync success
- Apple Calendar sync success
- Apple Health permission granted / revoked
- Apple Calendar permission granted / revoked
- onboarding completion

Recommended invalidation targets:

- `outer-readiness`
- `mrs-snapshot`
- `current-brief-snapshot`
- `mastery-plan-snapshot`
- `brief-history`

## 9. Files To Keep In Sync

When changing this memory, check these files first:

- `src/hooks/useOuterReadiness.ts`
- `src/hooks/useCurrentBriefSnapshot.ts`
- `src/hooks/useCalendarSync.ts`
- `src/hooks/useWearableSync.ts`
- `src/components/home/DecisionReadinessBrief.tsx`
- `src/components/home/TodayThreePriorities.tsx`
- `src/components/home/mrs/MrsPage.tsx`
- `supabase/functions/compute-outer-readiness/index.ts`
- `supabase/functions/generate-mastery-plan/index.ts`
- `supabase/functions/check-connections-status/index.ts`
- `supabase/functions/calendar-auth/index.ts`
- `supabase/functions/sync-apple-calendar/index.ts`
- `supabase/functions/persist-wearable-data/index.ts`
- `supabase/functions/sync-oura/index.ts`

## 10. Validation Checklist

Before calling the wiring correct, verify:

- MRS awaiting/null hides Brief and Plan.
- Signal pill headers and icons are neutral in awaiting.
- Apple Health transient sync failure remains connected, not disconnected.
- Apple Calendar transient sync failure remains connected, not disconnected.
- Permission revoked is clearly distinct from sync delayed.
- A delivered brief only appears in the side panel if it was visible to the user.
- Wearable merge is canonical and stable across Apple Health and Oura.

