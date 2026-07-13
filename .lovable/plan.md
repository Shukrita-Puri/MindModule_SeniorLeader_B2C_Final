# Fix B — Smart Nudges Production Delivery Contract

## Problem
`smart-nudges/index.ts:3898` defaults `forceDryRun = true` unless caller passes `?force_dry=0`. pg_cron never passes that, so every scheduled run silently drops APNs delivery.

## Delivery Contract (new)
Resolve `dryRun` via a single helper `resolveDeliveryMode({ url, forceUserId, adminGuard, apnsCredsPresent })` returning `{ dryRun: boolean, reason: string }` with this precedence:

1. `missing_apns_credentials` — any of APNS_P8_KEY / APNS_KEY_ID / APNS_TEAM_ID missing → dry-run
2. `explicit_force_dry` — `force_dry` in {`1`,`true`,`yes`} (case-insensitive) → dry-run
3. `admin_auth_failure` — `force_user` present but admin guard rejected → dry-run (existing behaviour; caller already returns 401, but defensive)
4. `production_delivery` — otherwise → real APNs send

Removed conditions:
- No-parameter default flips from dry-run → production.
- `force_dry=0` becomes a no-op alias for "not dry" (kept for backward-compat with any manual callers).

## Changes

### `supabase/functions/smart-nudges/index.ts`
1. Add `resolveDeliveryMode(...)` helper near top-level utilities.
2. Replace lines 3893–3921 block:
   - Parse `forceUserId` unchanged.
   - Compute `explicitDry = ['1','true','yes'].includes(url.searchParams.get('force_dry')?.toLowerCase())`.
   - Run admin guard when `forceUserId` present (unchanged path); on rejection, keep returning the 401 response (unchanged) — admin-diagnostic without admin rights never reaches evaluator, so it's effectively dry-run by short-circuit. Add a comment reflecting the contract.
   - Do NOT set `forceDryRun = true` by default anymore.
3. At line 4906, replace `isDryRun` computation with the helper result. Keep `apnsCredsPresent = !!(apnsKey && apnsKeyId && apnsTeamId)`.
4. Add unambiguous summary log before the send loop:
   ```
   [smart-nudges] Execution mode: Production Delivery | reason=production_delivery
   ```
   or
   ```
   [smart-nudges] Execution mode: Dry Run | reason=missing_apns_credentials
   ```
5. Include `delivery_mode` and `delivery_reason` in:
   - The final summary log (line ~5293), replacing bare `dry_run=...`.
   - The JSON response body (line ~5310).
   - `notification_evaluator_runs.metadata` insert (line ~3867) — patched at the point we know the mode (after APNs env check), via an `update` on the run row.
6. Update the admin audit `metadata` (line 3915) to include `delivery_reason`.

### New: `supabase/functions/smart-nudges/delivery-mode.ts`
Pure helper exporting `resolveDeliveryMode` + `DeliveryReason` union. Keeps the logic unit-testable in isolation without booting the whole handler.

### New: `supabase/functions/smart-nudges/delivery-mode.test.ts`
Deno tests covering:
- pg_cron (no params, creds present) → `{dryRun:false, reason:'production_delivery'}`
- `?force_dry=true` → dry-run/`explicit_force_dry`
- `?force_dry=1` → dry-run/`explicit_force_dry`
- `?force_dry=0` with creds → production
- missing APNs creds → dry-run/`missing_apns_credentials` (even without `force_dry`)
- missing creds AND `force_dry=true` → `missing_apns_credentials` wins (deterministic precedence)
- admin auth failure surface: helper called with `adminAuthFailed:true` → dry-run/`admin_auth_failure`

## Non-goals / Safety
- Admin gating logic in `requireAdmin` untouched; `force_user` still requires admin JWT.
- No change to APNs client, cooldowns, suppression, or notification_log schema.
- `delivery_state` continues to be `'dry_run' | 'pending'` mapped from `isDryRun`.

## Validation
1. Run `deno test supabase/functions/smart-nudges/delivery-mode.test.ts` — 7 cases pass.
2. Run existing smart-nudges related tests to confirm no regressions (`availability-cross-surface.test.ts` etc.).
3. Manual curl equivalents documented in test file comments.

## Rollout note
After merge, next pg_cron tick will attempt real APNs delivery. Monitor `notification_log` for `pending → accepted` transitions and edge-function logs for `Execution mode: Production Delivery`.
