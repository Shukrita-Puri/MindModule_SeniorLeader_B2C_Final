

# Fix Stage 7 Google Calendar Connection — Auth0 Only

## Current Issues
1. **Optimistic toggle**: Sets `calendarEnabled(true)` before the connect request succeeds (line 66) — false positive if redirect fails
2. **Anonymous fallback**: Falls back to `userId` in body when no Auth0 token (line 80) — violates Auth0-only requirement
3. **No on-load status check**: Doesn't query backend for existing connection on mount — returning users always see toggle OFF
4. **Trusts URL param blindly**: OAuth callback sets connected based on `?calendar_connected=true` without backend verification
5. **Unused import**: `supabase` client imported but should use `getAuthToken()` + `supabase.functions.invoke()` pattern consistently

## Changes

### Stage7ContextConnection.tsx

**On mount — check existing connection status:**
- Add a `useEffect` that calls `check-calendar-status` edge function with Auth0 bearer token
- If response shows `connected: true`, set `calendarEnabled(true)`
- Silent failure (user just sees toggle OFF if check fails)

**OAuth callback — verify before trusting:**
- When `?calendar_connected=true` is in URL, call `check-calendar-status` to confirm
- Only set toggle ON if backend confirms connection exists
- Show success toast only on confirmed connection

**Connect toggle — remove optimistic + anonymous fallback:**
- Remove line that sets `calendarEnabled(true)` before the request
- Remove `userId` body fallback (`...(!token && user?.id ? { userId: user.id } : {})`)
- If no Auth0 token, show error toast and return (don't proceed)
- Keep `calendarEnabled(false)` on error

**handleComplete — use verified state:**
- `calendar_provider: calendarEnabled ? 'google' : null` already uses state — no change needed since state is now truth-verified

**Remove unused import:**
- Remove `import { supabase } from "@/integrations/supabase/client"` — use `getAuthToken()` + fetch pattern for `check-calendar-status`, keep `supabase.functions.invoke` for `calendar-auth`

### No edge function changes needed
- `calendar-auth` already accepts Auth0 bearer tokens and verifies via `/userinfo`
- `check-calendar-status` already accepts Auth0 bearer tokens and returns connection status
- Both use service_role for DB access — no RLS issues

### Helper function addition
Add a `checkCalendarStatus` async function inside the component that:
```
1. Gets Auth0 token via getAuthToken()
2. Calls check-calendar-status edge function with Bearer token
3. Returns { connected: boolean, provider: string | null }
4. Returns { connected: false } on any error
```

Used by both mount effect and callback effect.

## Files Changed
- `src/pages/onboarding/stages/Stage7ContextConnection.tsx` — sole file modified

## Test Checklist
- Connected user sees toggle ON on reload
- Unconnected user sees toggle OFF
- Connect success (after OAuth redirect) flips toggle ON
- Failed connect remains OFF
- Onboarding completion sends `calendar_provider: 'google'` only when verified connected

