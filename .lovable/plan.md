

## Plan: Fix Three Issues — Accountability Tracking, Restart Button, Completed Card Styling

### Issue 1: `coach_accountability_tracker` Not Recording Commitments

**Root Cause**: The `generate-coach-summary` edge function uses AI to extract commitments from session transcripts. Looking at the last 5 session summaries, ALL have `commitments_made: []` — the AI is not recognizing accountability requests like "hold me accountable for X" as formal commitments.

**Fix**: Update the AI prompt in `generate-coach-summary/index.ts` to explicitly recognize accountability language patterns ("hold me accountable", "I commit to", "I want to", "help me stick to") as commitments. Also add a fallback: scan user messages for explicit accountability phrases and inject them into the commitment extraction context so the AI doesn't miss them.

**Files**: `supabase/functions/generate-coach-summary/index.ts`

---

### Issue 2: Restart Button Shows New Plan Instead of Same Plan

**Root Cause**: `handleRestartRitual` (DailyRitual.tsx line 472) deletes the ritual row, clears all session/local caches, then calls `loadPlan()` which hits the server for a fresh plan. This means the user gets a completely different set of practices.

**Fix**: Change `handleRestartRitual` to:
- Reset the `completed_practice_ids` to `[]` and `completion_status` to `partial` on the existing ritual (instead of deleting it)
- Clear local queue state (`practiceQueue`, `queueIndex`)
- Keep the session cache and `recommended_practice_ids` intact
- Re-read the existing plan from session cache (not regenerate)
- This way the same practices appear, just with progress reset

**Files**: `src/components/home/DailyRitual.tsx`

---

### Issue 3: Completed Card Styling Too Heavy

**Current state** (from screenshot): Orange-tinted card background, "Done" pill, strikethrough title, "Completed" text, and an orange check circle — all at once. User wants only the "Done" pill and the tick circle; no "Completed" label, no strikethrough on title, no orange card background.

**Fix** in both `DailyRitual.tsx` and `JitCarousel.tsx`:
- Remove `bg-saffron/10` and `border-saffron/30` from completed card container — use the same neutral styling as incomplete cards but with reduced opacity
- Remove `line-through decoration-1` from the title `<h4>`
- Remove the `"Completed"` text span in the bottom area
- Keep the "Done" pill badge (top-left) and the saffron check circle (right side)
- Keep thumbnail dimming (brightness/grayscale) for subtle differentiation

**Files**: `src/components/home/DailyRitual.tsx`, `src/components/home/JitCarousel.tsx`

---

### Summary of File Changes

| File | Change |
|------|--------|
| `supabase/functions/generate-coach-summary/index.ts` | Improve AI prompt to detect accountability language |
| `src/components/home/DailyRitual.tsx` | Fix restart to reset progress (not regenerate), fix completed card styling |
| `src/components/home/JitCarousel.tsx` | Fix completed card styling |

