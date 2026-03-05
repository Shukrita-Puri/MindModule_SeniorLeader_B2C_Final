

## Confirmation & Active Bug Fix

### Audit Confirmation

All 7 Phase 5 fixes are verified as implemented and correct for auth-based users. The data flow, scoping, and security posture are sound. The deprecated `mentalFitnessEngine.ts` localStorage read is a cleanup-only item with no functional impact.

### Active Bug: `UPDATE_ENERGY_BALANCE` Returning 500

**Root cause:** `energyStateEngine.ts` line 53 calls `UPDATE_ENERGY_BALANCE` without sending `timeWindow`. The EF (line 313-315) only filters by `time_window` when provided. Without it, the `.update().maybeSingle()` query matches ALL check-ins for that date across all time windows. When multiple windows exist (e.g., morning + evening), PostgREST throws PGRST116 ("more than one row"), which surfaces as 500.

This is directly caused by the DB migration we just applied (unique constraint now includes `time_window`), which enables multiple rows per date.

### Fix

**File:** `src/utils/energyStateEngine.ts` line 53

Add `timeWindow` to the request body by importing and calling `getCurrentTimeWindow()` from `dailyCheckins.ts`:

```typescript
import { getCurrentTimeWindow } from '@/utils/dailyCheckins';

// Line 53 becomes:
body: { 
  action: 'UPDATE_ENERGY_BALANCE', 
  checkinDate, 
  energyBalance: score, 
  timeWindow: getCurrentTimeWindow() 
},
```

This ensures the update targets only the current time window's check-in row, matching the multi-window architecture.

**Files changed:** 1 client file edit.

