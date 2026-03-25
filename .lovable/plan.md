

# Plan: Phase 8 — Per-Touch Dismissal, DEV_MODE Auth, Staleness Fix, Horizon Renaming

## What this fixes

Four issues identified in the audit. No UI changes — only backend logic and one small client-side payload update.

---

## Step 1: DB Migration — Add `dismissed_horizons` column

Add `dismissed_horizons text[] DEFAULT '{}'` to `jit_event_context`. Keep `dismissed_by_user` for backward compatibility (existing queries won't break).

```sql
ALTER TABLE public.jit_event_context 
ADD COLUMN IF NOT EXISTS dismissed_horizons text[] DEFAULT '{}';
```

---

## Step 2: Fix `track-jit-skip` — per-touch dismissal

**File: `supabase/functions/track-jit-skip/index.ts`**

- Accept `horizon` parameter from request body (e.g., `'touch_1'` or `'touch_2'`)
- On dismiss: instead of setting `dismissed_by_user = true`, append the horizon to `dismissed_horizons` array using SQL array append
- Keep writing `dismissed_by_user = true` as well for backward compat (belt and suspenders)
- Lines 40, 52-57 change

---

## Step 3: Fix `generate-mastery-plan` bridge — per-touch filter

**File: `supabase/functions/generate-mastery-plan/index.ts`**

- Line 977: Remove `.eq('dismissed_by_user', false)` from the bridge query
- Add `dismissed_horizons` to the select list (line 974)
- After computing `actionWindow` for each event (line 996), check: if the action window's touch label (e.g., `'touch_1'` for `touch1`, `'touch_2'` for `touch2`) is in `dismissed_horizons`, skip that event. Otherwise allow it through.
- This means dismissing Touch 1 does NOT block Touch 2

---

## Step 4: Widen bridge staleness window

**File: `supabase/functions/generate-mastery-plan/index.ts`**

- Line 971: Change `60 * 60 * 1000` (60 min) to `4 * 60 * 60 * 1000` (4 hours)

---

## Step 5: Add DEV_MODE auth bypass to `generate-jit-events`

**File: `supabase/functions/generate-jit-events/index.ts`**

- Lines 360-362: Replace the immediate return on auth failure with the standard bypass pattern:
```typescript
let userId: string;
const auth = await authenticateRequest(req, corsHeaders);
if (auth.errorResponse) {
  const env = Deno.env.get('ENVIRONMENT') || '';
  if (env !== 'production') {
    const devHeader = req.headers.get('x-dev-user-id');
    if (devHeader) { userId = devHeader; }
    else { return auth.errorResponse; }
  } else { return auth.errorResponse; }
} else {
  userId = auth.userId;
}
```

---

## Step 6: Rename horizon values to `touch_1` / `touch_2`

**File: `supabase/functions/generate-jit-events/index.ts`**

- `determineUrgencyHorizon()` (line 263-266): Return `'touch_2'` instead of `'immediate'`, `'touch_1'` instead of `'tactical'`
- Update type signature to `'touch_1' | 'touch_2' | null`
- All references to the horizon value in deduplication logic (lines 713-718) and storage (line 731-733) automatically use the new values
- Response mapping (line 801): `jitUrgencyHorizon` now returns `'touch_1'`/`'touch_2'`

**File: `supabase/functions/generate-mastery-plan/index.ts`**

- Line 1910: Change `actionWindow === 'touch1' ? 'tactical' : 'immediate'` to `actionWindow === 'touch1' ? 'touch_1' : 'touch_2'`
- Line 2053: `horizon` field in response already derives from above — no separate change needed

---

## Step 7: Update client dismiss call to include horizon

**File: `src/components/home/JitCarousel.tsx`**

- The `preEventPlan` response already includes `actionWindow` and `horizon` (lines 2052-2053 of mastery plan)
- Add `horizon` to the `PreEventPlan` interface
- In `trackJitAction` (line 130-134), add `horizon: preEventPlan.horizon` and `eventId: preEventPlan.eventId` to the body (need to also pass `eventId` through from mastery plan response — currently missing from `PreEventPlan` interface but available on the server as `calendar_event_id`)
- Also add `eventId` to the `PreEventPlan` interface and populate it from mastery plan response

**File: `supabase/functions/generate-mastery-plan/index.ts`**

- In the `preEventPlan` response object (line 2042-2054), add `eventId: topEvent.event.id` (the calendar_event_id) so the client can send it back on dismiss

---

## Step 8: Post-implementation audit

Verify against the definition of done:
- Dismiss Touch 1 → Touch 2 still fires (per-touch `dismissed_horizons`)
- `generate-jit-events` works in DEV_MODE
- Bridge doesn't fall back unnecessarily (4h window)
- All horizon values are `touch_1`/`touch_2` — no `tactical`/`immediate` in `jit_horizons_surfaced`
- No `dismissed_by_user` filtering blocks Touch 2

---

## Files changed

| File | Change |
|------|--------|
| New migration | Add `dismissed_horizons text[]` column |
| `track-jit-skip/index.ts` | Accept `horizon` param, append to `dismissed_horizons` array |
| `generate-mastery-plan/index.ts` | Remove `dismissed_by_user` filter, add per-touch check, widen staleness to 4h, rename horizon labels, add `eventId` to response |
| `generate-jit-events/index.ts` | DEV_MODE auth bypass, rename horizon values to `touch_1`/`touch_2` |
| `src/components/home/JitCarousel.tsx` | Add `horizon` and `eventId` to dismiss payload (no visual changes) |

No visual/UI changes. No breaking changes to existing data.

