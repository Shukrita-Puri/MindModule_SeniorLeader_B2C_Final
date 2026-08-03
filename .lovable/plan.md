# Relocation Detection: sync-profile, set-home-location, and prompt banner

Adds sustained-relocation detection at login, clears the flag when a new home is set, and surfaces a dismissible prompt in the app.

## 1. sync-profile — best-effort relocation check
In `supabase/functions/sync-profile/index.ts`, after the `current_timezone` / `home_timezone` block (~lines 156-166):
- Import `tzOffsetDiffHours` from `../_shared/plan/tz-to-country.ts`.
- If `clientCurrentTz` differs from the existing `home_timezone` by more than 3 hours, read `travel_state.last_timezone_change_at` and `state`.
- If that change is older than 30 days and the state is not `en_route` / `returning`, set `possible_relocation_detected`, `relocation_candidate_tz`, `relocation_first_detected_at` on the profile.
- The whole block is wrapped in try/catch with a `console.warn` — it can never block or fail the login response.

## 2. set-home-location — clear the flag on an explicit home write
In `supabase/functions/set-home-location/index.ts`, in the `action === "write"` branch where `patch.home_timezone` is set:
- Import `tzToCountry` and derive the country from `decision.timezone`; when it resolves, set `patch.country`.
- Reset `possible_relocation_detected = false`, `relocation_candidate_tz = null`, `relocation_first_detected_at = null`.

**Deviation from the spec:** `profiles` has a `country` column but **no `home_country` column** (`home_country` only exists on `onboarding_v8_responses`). Writing `patch.home_country` would make the whole update fail, so only `patch.country` is set. Say the word if you'd rather add a `home_country` column instead.

## 3. RelocationPromptBanner component
New `src/components/profile/RelocationPromptBanner.tsx`:
- One select on mount for `possible_relocation_detected` (own-row reads are already permitted by existing access rules).
- When true, renders a dismissible banner: "Your timezone suggests you may have moved. Update your home location?"
- Dismiss writes `possible_relocation_detected = false` and hides the banner.
- Tapping the prompt takes the user to the home-location surface. `HomeLocationCard` is a Profile-page card with its own dialog state, so the banner navigates to `/profile` rather than rendering the card inline — same destination, no duplicated state.
- Mounted once in `App.tsx` inside the authenticated shell so it appears wherever relevant; renders nothing while signed out or when the flag is false.

## Verification
- `tsgo` — confirm zero TypeScript errors.
- Redeploy `sync-profile` and `set-home-location`.