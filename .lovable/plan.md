# Restores card fixes + completed-slot state + wearable window correction

Files: `src/components/insights/PracticeEffectiveness.tsx`, `src/components/home/TodayThreePriorities.tsx`, `supabase/functions/content-feedback/index.ts`. No schema changes, no new tables, no new content.

## Verified before planning

- **Plan reload (previous Fix 1): no change needed.** Home is snapshot-only and the hydrate path already skips `generate-mastery-plan`; you confirmed it behaves correctly. Post-practice return already navigates back via `entryRoute`, i.e. the plan route, not MRS.
- **Review popup is recording.** Three `post_plan_completion` rows landed today in `content_relevance_feedback` (14:28–14:30, star_rating 5, one with your "loved it!!!" text), alongside the `post_practice_completion` rows. One flaw: `content_id` is stored as the literal `plan-tod`, not the slot's primary practice id, so the row can't be attributed to a practice.
- **Wearable windows in the engine today:** before = 15 min, during = start → start + estimated duration, after = end → end + **60 min**, and all three are required. The engine does **not** read the new `practice_started_at` / `practice_completed_at` columns on `daily_ritual_completions` — session start comes from the earliest post-practice rating `created_at` (or a slot `*_completed_at` field) and session end from a static duration table.

## Fix A — Completed slot shows as done

In `TodayThreePriorities.tsx`, a completed slot currently collapses: strikethrough title, no expanded body, no button. Add the accomplishment state:

- Keep the slot visibly greyed (`opacity-60`) and show a **disabled "Completed" button** in place of Start/Continue, with the check styling already used for the slot number.
- Multi-practice slots that are fully done show `Completed (n/n)`.
- No behaviour change for partially complete slots — they keep `Continue (x/n)`.

## Fix B — Review popup attribution covers every practice in the slot

A slot can hold one, two or more practices; the rating applies to all of them.

- Keep the existing plan-level row (`content_id: 'plan-tod'`) and the localStorage gate unchanged.
- Additionally write **one row per completed practice in that slot** — so a two-practice slot produces two attributed rows — each with:
  - `content_id` = that practice's contentId, `content_type` = its real type (soundbath / guided-practice / micro-practice)
  - the same `star_rating` and `feedback_text` as the slot rating
  - `trigger_context: 'post_plan_completion'`
  - `context_data` carrying the slot index, time label and the full array of practice contentIds in the slot, so the group is reconstructable
- Rows are written in one batched insert alongside the plan-level row; existing columns only, no schema change. The impact engine already keys on `content_id`, so each practice picks up its rating with no engine change.


## Fix C — Chevron + type size (PracticeEffectiveness)

- Tier 2 button switches from `▸ / ▾` glyphs to `ChevronRight` with `rotate-90` when open, matching Tier 3.
- Both buttons: `text-xs text-muted-foreground`, no `uppercase`, no `tracking-widest`, plus `min-h-[44px]` tap target.

## Fix D — Wearable signal windows (content-feedback, GET_PRACTICE_IMPACT only)

1. **Narrow HR AFTER from 60 to 15 minutes**: `(session_end, session_end + 15min]`. The immediate post-practice window is the practice response; beyond it the reading is confounded by whatever the user did next, and it is in practice easier to populate honestly.
2. **All three windows stay required** (>= 1 sample each). No optional-after relaxation — a partial signal is misleading. A session missing any window still counts as a session but contributes nothing to `wearableSignalAgg`.
3. **Before window stays symmetric at 15 minutes**: `[session_start − 15min, session_start)` — already correct, confirmed.
4. **Precise session timestamps**: read `practice_started_at` / `practice_completed_at` from `daily_ritual_completions` and use them as session start/end when both are non-null. Fall back to the current derivation (rating/slot completion timestamp + static duration) only when they are null. This replaces the estimated end time for any session recorded since the timing migration.

## Fix E — Two cards, not three sections

- Wrap Tier 1 rows + Tier 2 disclosure + Tier 3 disclosure in one `rounded-xl bg-muted/30 p-3.5` card headed "Your most effective practices".
- Move "Before your hardest days" below that card (today it renders between Tier 1 and Tier 2) into its own `rounded-xl bg-muted/30 p-3.5 mt-3` card, rendered only when `section2.length > 0`.

## Verification

- Typecheck plus the full test suite.
- Deploy `content-feedback`, then probe `GET_PRACTICE_IMPACT` for shukrita@mindmodule.me and confirm at least one practice returns a non-null `primarySignalPct`. If no session has HR samples in all three windows, I will report that rather than loosen the gate.
- Playwright pass: plan page with a completed slot (greyed + Completed button), and the insights card for the two-card layout and chevrons.
- Publish once green.
