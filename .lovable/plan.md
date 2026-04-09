

# Fix Test Failures, Dev Mode Persistence, and Payment Page Logic

## 1. Fix 2 Failing Test Assertions

The test at line 137 asserts `"composure under pressure"` (lowercase) which matches `PRACTICE_PRIORITY_LABELS`. However, the component renders with CSS class `capitalize` on line 361 — this doesn't affect DOM text, so the issue is likely elsewhere. I'll run the tests to identify the exact failures and fix the casing mismatches.

**Most likely culprit**: The `Collapsible` component from shadcn wraps content in a way that may hide text from queries, or the `CollapsibleContent` children aren't rendered without being open. Need to verify and adjust assertions.

## 2. Fix Dev Mode Persistence in Stage8Results

**Problem**: `persistBaseline()` checks `window.__auth0Client` directly (line 58). In dev mode, this doesn't exist, so DB persistence silently skips — dev users never persist their baseline data.

**Fix**: Replace the raw `fetch` + `window.__auth0Client` pattern with `getAuthToken()` from `authTokenService.ts`, which already handles dev mode by returning the anon key. Also add the `x-dev-user-id` header when in dev mode, matching the pattern used by the dev interceptor.

```typescript
// Before (broken in dev mode)
if (!window.__auth0Client) return;
const token = await window.__auth0Client.getAccessTokenSilently();

// After (works for both auth + dev)
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

const token = await getAuthToken();
if (!token) return;
const headers: Record<string, string> = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
};
if (DEV_MODE) headers['x-dev-user-id'] = DEV_USER.id;
```

## 3. Payment Page — Confirm Correct Behavior

The current code already handles the scenarios correctly:
- **First-time user** (`currentTier = 'none'`): Shows both Annual + Monthly with "Pricing" title and "Start 7-Day Free Trial" CTA
- **Beta/expired trial user** (`currentTier = 'none'`, `onboarding_completed_at` set): Shows both Annual + Monthly with "Upgrade Plan" title and "Upgrade Now" CTA
- **Monthly subscriber** (`currentTier = 'monthly_pro'`): Shows only Annual with "Upgrade Plan" title

This matches the user's requirements exactly. No code changes needed for the payment page logic.

## Files Modified

| File | Change |
|------|--------|
| `src/pages/onboarding/stages/Stage8Results.tsx` | Replace `window.__auth0Client` with `getAuthToken()` + dev mode headers |
| `src/pages/onboarding/stages/__tests__/Stage8Results.test.tsx` | Fix 2 failing assertions (casing/query mismatches) |

