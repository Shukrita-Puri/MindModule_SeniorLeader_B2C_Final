# Executive Home Reset Legacy Holding Area

Created for the 2026-06 Executive Home cards reset.

## What Was Moved

No live code has been moved yet.

## Why

The current implementation still has active imports for the old page-load compute paths. The reset adds a centralized `build-executive-home-cards` orchestrator and a manual refresh path first, while keeping the old paths as fallback until the snapshot-read-first flow is fully proven.

## What Replaces It

- `supabase/functions/build-executive-home-cards/index.ts`
- `daily_context_snapshot`
- `brief_snapshots`
- `mastery_plan_snapshots`
- `src/hooks/useExecutiveHomeCardsRefresh.ts`

## Deletion Safety

Not safe to delete old card-entry logic yet. Files such as `useOuterReadiness`, `energyStateEngine`, and `TodayThreePriorities` are still imported by live UI and non-home surfaces. Move only after imports are migrated and fallback usage is removed.
