# /onboarding/connect — copy + validation-gating update

Scope: `src/pages/onboarding/stages/v8/StageConnections.tsx` only. No changes to picker components, auth/status logic, edge functions, or DB.

## 1. Remove Whoop from this page
- Always pass an explicit `wearableOnly` prop to `ConnectionsPanel` that excludes `'whoop'`.
- Derive `wearOnly` as before from `onboarding_v8_responses.wearable_selections`, then filter out `'whoop'`. If the intersection is empty (user hadn't selected any, or only selected Whoop), fall back to `['apple-watch', 'oura']` so Apple Watch + Oura still render.
- `calendarOnly` behaviour is unchanged.

## 2. Headline copy
- Replace `title="Now plug Mind Module in"` with `title="Mind Module, personalised based on your real data"`.

## 3. Subheading copy
- Replace the `<p>` under the title with:
  "Connect your day with one calendar and your body with one wearable to unlock bespoke insights from day one. No generic advice — just recommendations built for you. You can connect more later in Profile → Connected Data."

## 4. Mandatory-connection gating on Continue
- Add local state `hasCalendar` / `hasWearable` (booleans).
- On mount and whenever `ConnectionsPanel` fires `onChanged`, call both `fetchCalendarProvidersState()` (from `@/components/calendar/CalendarProviderPicker`) and `fetchWearableProvidersState()` (from `@/components/connections/WearableProviderPicker`) in parallel.
  - `hasCalendar = providers.google.connected || providers.microsoft.connected || providers.apple.connected` (result may be `partial` or `ok` — treat any `connected: true` as satisfied; ignore `error` result).
  - `hasWearable = providers['apple-watch'].connected || providers.oura.connected` (Whoop deliberately excluded).
- `canContinue = hasCalendar && hasWearable`.
- Both the footer `PrimaryCTA` and the inline "Skip for now" link:
  - The `PrimaryCTA` is passed `disabled={!canContinue}` and only navigates when `canContinue` is true.
  - Replace the "Skip for now" text link with helper text: `Requires 1 calendar and 1 wearable` shown when `!canContinue`. When `canContinue` is true, hide the helper text. (This removes the skip escape hatch, consistent with "must connect before proceeding".)
- Add a small `aria-live="polite"` helper `<p>` above the CTA with the "Requires 1 calendar and 1 wearable" copy so screen readers announce the gate.

## 5. Out of scope (untouched)
- Picker components, their "Not authenticated" / "Status unavailable" / Retry states, OAuth flows, HealthKit bridge, `onboarding-v8-save`, `StageDone`, routing.
- `PrimaryCTA` component itself (already supports a `disabled` prop; will verify during build and use existing styling for disabled state — no new component).

## Technical notes
- Existing `PrimaryCTA` usage in other stages already passes `disabled`; if the prop is missing, wrap the CTA in a `<div aria-disabled>` and short-circuit `onClick` — no styling changes beyond opacity utility already used elsewhere.
- The status fetch is cheap and already used elsewhere; running it on mount + `onChanged` mirrors `CalendarConnectionSettings`.
- Whoop stays available on the Profile → Connected Data page (that page renders `ConnectionsPanel` without a `wearableOnly` filter). This edit does not touch it.

## Verification
- Type-check the edited file.
- Manually confirm on `/onboarding/connect`:
  - Whoop row absent.
  - New title + subheading render.
  - Continue disabled until one calendar + Apple Watch/Oura both show Connected; helper text visible while disabled; helper text hidden and CTA active once both are connected.
