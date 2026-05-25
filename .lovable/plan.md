## Three issues to fix on the Plan page (`TodayThreePriorities`)

### Issue 1 — Cancelled priorities reset after refresh / page revisit

**Root cause**
The cancel flow is optimistic-only with a background `persistPlanLedgerEdit` write. Two race conditions wipe the cancelled state:

1. After refresh, `loadPlan` may call `generate-mastery-plan` before the background write to `plan_ledger.userEdits` lands. The server response then comes back **without** `isCancelled`, and the line `setPlan(planResponse)` overwrites both the local state and the localStorage cache (`writePersistent(dataKey, planResponse, ttl)`).
2. Several invalidation paths inside `loadPlan` (energy hash drift, JIT cache, brief identity change) regenerate the plan and produce the same overwrite.

The server-side merge in `applyLedgerEditsToModules` is correct — but only useful once the write reaches the DB and the next regeneration runs.

**Fix**
- Introduce a tiny client-side mirror of slot edits: `localStorage` key `plan-user-edits-${date}-${period}` storing `{ slotEdits: { 'slot-0': { cancelled, cancelReason, replacementEventIds, priorityTag, relationshipTag, customTags }, ... }, updatedAt }`. Helper module `src/utils/planUserEdits.ts`.
- Write to this mirror **synchronously** on every cancel / undo / tag change, before the background DB persist.
- In `loadPlan` (both cache-hit and fresh-fetch branches), after producing the plan response, re-apply the local mirror via a new client helper `applyLocalSlotEditsToPlan(plan, edits)` so the rendered plan always reflects local edits even if the server response is stale.
- When the server response already carries `isCancelled`/`priorityTag`/`relationshipTag` newer than the local mirror (compare `updatedAt`), trust the server and clear the local mirror entry.
- Gate `loadPlan` so a refresh while a background persist is in flight does not run `generate-mastery-plan`: track `pendingPersistRef` and short-circuit (use cached + mirror only) until persistence resolves.
- On cancel/undo: keep the optimistic UI, but also `await` `persistPlanLedgerEdit` (no UI blocking — modal already closed) and roll back the mirror on failure.

This makes cancellation survive: page refresh, route navigation away/back, full app reopen within the window, and iOS background returns.

### Issue 2 — "No calendar events found in the next 24 hours" despite a packed calendar

**Root cause**
`loadReplacementEvents` in `TodayThreePriorities.tsx` queries `primary_calendar_events` directly from the browser using the Supabase anon client. The app authenticates via Auth0 (not native Supabase JWT), and `primary_calendar_events` has deny-by-default RLS that only the service-role edge functions can read. Confirmed: the DB has 9 events in the next 24h for the affected user, but the anon SELECT returns 0 rows.

**Fix**
- Add a new lightweight edge function `list-replacement-calendar-events` (service-role) that:
  - Authenticates via Auth0 JWT (mirroring `generate-mastery-plan`'s auth helper) or `x-dev-user-id` in DEV.
  - Returns the next 24h of `primary_calendar_events` for the user (id, title, start_time, end_time, provider, attendees_count, is_organizer, is_recurring).
  - Falls back to `web_primary_calendar_events` if `primary_calendar_events` is empty (some users sync there).
- Replace the direct `supabase.from('primary_calendar_events')` query in `loadReplacementEvents` with `supabase.functions.invoke('list-replacement-calendar-events', …)` using `getAuthToken()` like other calls in the file.
- Keep the existing UI, grouping, and selection logic untouched.

### Issue 3 — Priority tags only appear during replacement; need a simpler always-available "+ ADD TAG"

**Goal**
- Tags must be available on every priority card (cancelled or active, replacement or not), so the system learns from existing priorities too.
- Replace the current "PRIORITY TAG / RELATIONSHIP TAG" pill blocks with a compact inline affordance: `+ ADD TAG`.
- Tapping `+` opens a small popover offering three groups:
  - **Importance**: High, Medium, Low.
  - **Relationship**: Boss, Colleague, Junior, Client, Customer, Board, Leadership, Team.
  - **Add your own tag** — free-text input, saves as a custom tag.
- Selected tags render as small pills next to `+`, with an `×` to remove.

**Fix**
- Extend the `HorizonModule` shape with `customTags?: string[]` and broaden the existing `relationshipTag` enum to include `customer | board | leadership | team`.
- Add new component `src/components/home/PriorityTagAffordance.tsx`:
  - Inline `+ ADD TAG` button + selected-tag pills.
  - Popover (reuse shadcn `Popover`) with the three groups.
  - `onChange({ priorityTag, relationshipTag, customTags })` callback.
- Render `PriorityTagAffordance` on every priority card in `TodayThreePriorities.tsx` (active and cancelled), wired to a new helper `updateSlotTags(slotIndex, patch)` that:
  - Updates local state, the local mirror (Issue 1), and the persistent cache.
  - Calls `persistPlanLedgerEdit` in the background with the same patch.
- Remove the duplicate priority/relationship tag block from `CalendarReplacementPickerModal.tsx`; replacement picker just shows event selection. (The same `PriorityTagAffordance` is already on the parent card.)
- Extend `mergePlanEditState`, `applyLedgerEditsToModules`, and the local mirror helpers to round-trip `customTags`.

### Technical notes

- **Files added**
  - `src/utils/planUserEdits.ts` — local mirror read/write/merge/apply.
  - `src/components/home/PriorityTagAffordance.tsx` — inline `+ ADD TAG` UI.
  - `supabase/functions/list-replacement-calendar-events/index.ts` — service-role calendar fetch.
- **Files changed**
  - `src/components/home/TodayThreePriorities.tsx` — use mirror in `loadPlan` cache-hit + post-fetch, route cancel/undo/tag through the mirror, await persist + rollback, render `PriorityTagAffordance` on every card, switch calendar fetch to the new edge function, gate `loadPlan` on `pendingPersistRef`.
  - `src/components/home/CalendarReplacementPickerModal.tsx` — drop the duplicate priority/relationship blocks; keep event grouping/selection.
  - `src/utils/dailyRituals.ts` — extend `RitualData['plan_ledger'].userEdits.slotEdits` with `customTags` and the expanded relationship enum.
  - `supabase/functions/generate-mastery-plan/index.ts` — extend `PlanLedger['userEdits'].slotEdits` and `applyLedgerEditsToModules` to round-trip `customTags` and the new relationship values.
- **Schema**: no migration required — `plan_ledger` is JSONB.
- **Validation**: after build, manually verify in preview that cancel survives a hard refresh, that the replacement picker lists the user's real events, and that `+ ADD TAG` works on an active priority and persists across refresh.
