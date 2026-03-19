

# Plan: Deploy Apple Health Connection-State Fixes

## 1. Fix Build Error in `src/utils/healthKitCapacitor.ts`

Line 154 accesses `.data`, `.results`, `.resultData` which don't exist on the `ReadSamplesResult` type. Fix by casting `hrvRes` to `any` for the fallback chain.

| File | Change |
|------|--------|
| `src/utils/healthKitCapacitor.ts` | Cast `hrvRes` as `any` on line 154 to resolve TS2339 errors |

## 2. Apply DB Migration

Run the migration file `20260319120000_add_watch_connection_status_to_user_integrations.sql` which adds 8 columns to `user_integrations` and backfills existing rows.

## 3. Deploy Edge Functions

Deploy these 3 functions:
- `persist-wearable-data` — handles `update_status` and `disconnect` actions with new columns
- `check-connections-status` — reads new status columns for connection state
- `complete-onboarding` — updated onboarding flow

## 4. Verification

- Confirm migration applied (query `user_integrations` for new columns)
- Confirm edge functions deployed (invoke health check)
- Confirm frontend build passes (no TS errors)

