# Fix "Unable to load calendar events" in the replacement picker

## Root cause

`TodayThreePriorities.tsx` now sends two custom headers on the invoke call:

- `x-user-tz-offset` (timezone for the Today→Tomorrow window)
- (optionally) `x-client-platform` (iOS vs web for provider precedence)

But `supabase/functions/list-replacement-calendar-events/index.ts` still declares:

```
'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dev-user-id'
```

The browser preflight (`OPTIONS`) sees `x-user-tz-offset` is not in the allow-list and blocks the actual `POST`. `supabase.functions.invoke` then throws, the catch block sets `Unable to load calendar events right now.`, and the empty events array renders `No calendar events found for today or tomorrow.`

The earlier 14:15 success in the logs was from before the timezone header was added; nothing has reached the function from the browser since.

## Change

Single-file edit, no behavior changes elsewhere.

**`supabase/functions/list-replacement-calendar-events/index.ts`** — extend `corsHeaders`:

```text
'Access-Control-Allow-Headers':
  'authorization, x-client-info, apikey, content-type, x-dev-user-id, x-user-tz-offset, x-client-platform'
```

Everything else (Today→Tomorrow window, dedupe, period tagging, picker UI with no day/period toggle) is already in place from the previous turn and stays untouched.

## Verification

1. Redeploy the function (automatic on save).
2. Reload `/plan`, click Replace on Priority 1.
3. Expect the Today and Tomorrow groups to render with the 9 deduped events the function already returns, each with a Morning/Afternoon/Evening chip.
4. Confirm in browser DevTools Network that the `OPTIONS` preflight returns 200 with the expanded allow-list and the `POST` succeeds.
