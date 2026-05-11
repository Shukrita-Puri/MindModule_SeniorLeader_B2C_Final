## Goal

Introduce three experience modes driven by two flags — `wearable_connected` and `self_check_ins_enabled` — and gate visibility/routing of `/daily-check-in` and `/check-in-detail` accordingly. **No scoring, brief, plan, signal, or backend logic changes.**

Derived mode:
- Wearable + Self → both flags true
- Wearable Only → wearable true, self false
- Self-Declared Only → wearable false (self defaults true)

## Visibility Matrix

| Mode | /daily-check-in | /check-in-detail | Daily CTA target |
|------|-----------------|------------------|------------------|
| Wearable + Self | Visible | Hidden | Today's Brief (`/executive-home`) |
| Wearable Only | Hidden (redirect) | Hidden (redirect) | n/a |
| Self-Declared Only | Visible | Visible | Body State Check (`/check-in-detail`) — current behaviour |

## Changes

### 1. Persistence (new profile flag)

Add `self_check_ins_enabled boolean` to `public.profiles`, default `true` (preserves current behaviour for existing users). New migration only; no edits to existing migrations or scoring tables.

### 2. Onboarding — `Stage7ContextConnection.tsx`

- Keep wearable connection optional (no change).
- When `watchEnabled === true`, render a new sub-section beneath the wearable card:
  - Question: "Would you also like to complete daily self check-ins for a more rounded assessment?"
  - 2-option segmented selector:
    - "Yes — I'm happy to complete short daily self check-ins." → `selfCheckIns = true`
    - "No — I'd prefer the wearable to do the heavy lifting." → `selfCheckIns = false`
  - Helper copy: "You can change this later in settings."
  - Default selection: Yes.
- When `watchEnabled === false`, hide the sub-section and force `selfCheckIns = true` on submit.
- On submit, include `self_check_ins_enabled` in the `complete-onboarding` payload.

### 3. Backend — `complete-onboarding` edge function

Accept and persist `self_check_ins_enabled` onto `profiles`. No other logic touched.

### 4. Routing & visibility helpers

Add a tiny client helper `src/utils/checkInMode.ts` that derives the mode from `profile.watch_type`/integration state + `profile.self_check_ins_enabled`, exposing:
- `useCheckInMode()` hook returning `{ mode, showDailyCheckIn, showCheckInDetail, dailyCtaTarget }`.

Wire it in:
- **`src/App.tsx`** — wrap `/daily-check-in` and `/check-in-detail` route elements with a guard that redirects to `/executive-home` when the mode hides them. (Keeps file-level changes minimal.)
- **`src/pages/DailyCheckIn.tsx`** — CTA label & navigation derived from `dailyCtaTarget`:
  - Wearable + Self → label "Continue to Today's Brief", navigate `/executive-home`.
  - Self-Declared Only → keep current "Continue to Body State Check in" → `/check-in-detail`.
- **`src/pages/ExecutiveHome.tsx`** — any existing "start check-in" entry uses the same helper so Wearable-Only users land straight on Brief (no link to hidden pages).

### 5. Connected Data page (`src/pages/ConnectedData.tsx`)

Add a "Daily self check-ins" row inside the existing wearable section:
- Visible **only** when wearable is connected AND `self_check_ins_enabled === false` (i.e. user opted out during onboarding). Per spec, all other users keep current UI.
- A Switch labelled "Enable daily self check-ins" with helper "Adds a short morning check-in for a more rounded assessment."
- Toggling on calls existing profile-update path to set `self_check_ins_enabled = true`; afterwards the row disappears (now matches default state).
- No path to disable from this page in MVP (keeps surface minimal; matches "only visible to users who opted out").

### 6. Returning user behaviour

No bespoke landing logic needed — `ExecutiveHome` remains the post-onboarding entry. The route guards + CTA helper enforce the matrix on every visit, using the persisted flags.

## Out of Scope (explicitly untouched)

- Readiness/triangulation engine, brief generation, signal pills, plan generation, smart nudges, AI prompts.
- Wearable upsell entry points elsewhere in the app.
- `CheckInDetail` internal UI (only its route-level visibility changes).

## Acceptance

- Mode A: `/daily-check-in` reachable, `/check-in-detail` redirects to `/executive-home`, CTA reads "Continue to Today's Brief" and routes there.
- Mode B: both check-in routes redirect to `/executive-home`; user lands on Brief.
- Mode C: both pages visible; current CTA preserved.
- Existing users (no new flag value) behave as Mode C or A depending on wearable — default `true` keeps parity.
- Connected Data shows the re-enable toggle only for opted-out wearable users.

## Files touched

- `supabase/migrations/<new>.sql` (add column)
- `supabase/functions/complete-onboarding/index.ts` (persist new field)
- `src/pages/onboarding/stages/Stage7ContextConnection.tsx`
- `src/utils/checkInMode.ts` (new)
- `src/App.tsx` (route guards)
- `src/pages/DailyCheckIn.tsx` (CTA label + target)
- `src/pages/ConnectedData.tsx` (conditional re-enable toggle)
