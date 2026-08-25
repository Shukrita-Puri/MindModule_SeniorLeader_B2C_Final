# Five targeted fixes: Plan stability + Restores card

Two files carry most of the work: `src/components/home/TodayThreePriorities.tsx` and `src/components/insights/PracticeEffectiveness.tsx`. No schema changes, no new tables, no new content.

## What I verified first

- Home is already snapshot-only (`HOME_SNAPSHOT_ONLY` defaults true) and the hydrate effect skips `generate-mastery-plan` unless a manual force-refresh flag is set. The only remaining live-generation call sites are the refresh/recovery CTA and the retry-after-error path.
- The confirmed cause of "regenerating" on navigation is **window scoping**, not a stray generate call: the instant-render cache keys (`planData`/`planLoaded`) and the snapshot query key are scoped to `date + time window`. Crossing a window boundary (or a cold cache on remount before the snapshot query resolves) makes `initialCached` null, so `loading` starts true and the scripted loader shows again.
- Fix 2 is already built: `plan_slot_rated_${userId}_${date}_slot${i}` gate, slot-complete detection, and `markPlanSlotRated` on both submit and skip. What is missing is the `trigger_context`/`content_id` payload the request specifies — `submitPlanFeedback('tod', ...)` writes context `plan_feedback`, not `post_plan_completion`, and carries no content id.
- Fix 4 backend is already correct: HR windows are `[start−15m, start)`, `[start, end)`, `(end, end+60m]`, `wearableSignal` is emitted at `n >= 1`, and the UI already renders at `n >= 1` with the muted/emerald treatment. One real gap: the HR aggregate only counts a session when **all three** windows resolve, so an after-window that has not elapsed yet discards an otherwise valid before/during pair.

## Fix 1 — Plan does not regenerate or re-load on navigation

- Add a **day-scoped** plan cache mirror alongside the existing window-scoped keys (same `writePersistent` store, new key `plan-data-day-<date>`). Written whenever a plan is hydrated or generated.
- On mount, `initialCached` reads the window key first, then falls back to the day key. If either holds a renderable plan for today, render immediately with `loading = false` and no loader.
- Widen `initialCachedRef` accordingly so a later silent refresh can never re-show `EngravedLoader`.
- The snapshot query keeps its window key (server-side cross-window fallback stays intact); the client just stops treating a window change as "no plan".
- Keep the three allowed regeneration paths untouched: explicit refresh CTA, no snapshot for today, date change (day-scoped cache naturally expires with the date).

## Fix 2 — Review popup payload

- Keep the existing detection and localStorage gate.
- Change the submit handler to record the completion context: `trigger_context: 'post_plan_completion'` and `content_id` = the primary practice `contentId` of the completed slot, via the existing `submitRelevanceFeedback` path in `src/utils/relevanceFeedback.ts` (no new table, no schema change). `submitPlanFeedback` stays for the aggregate plan-level row.

## Fix 3 — Chevron + type size in PracticeEffectiveness

- Tier 2 button switches from the `▸ / ▾` text glyphs to `ChevronRight` with `rotate-90` when open, matching Tier 3.
- Both buttons: `text-xs text-muted-foreground`, no `uppercase`, no `tracking-widest`, and `min-h-[44px]` for iOS tap targets.

## Fix 4 — Wearable signal visibility

- UI already satisfies the spec; no change needed there.
- Backend: relax the HR aggregate so a session counts when **before and during** both resolve (the after window becomes optional and only feeds the Energise "HR recovered" secondary). This is what actually blocks the signal from appearing for recent sessions.
- Redeploy `content-feedback` and probe `GET_PRACTICE_IMPACT` for a live user to confirm at least one practice returns a non-null `wearableSignal`.

## Fix 5 — Two cards, not three sections

- Wrap Tier 1 rows + Tier 2 disclosure + Tier 3 disclosure in one `rounded-xl bg-muted/30 p-3.5` card headed "Your most effective practices".
- Move "Before your hardest days" **below** that card (today it is rendered between Tier 1 and Tier 2) into its own `rounded-xl bg-muted/30 p-3.5 mt-3` card, rendered only when `section2.length > 0`.

## Verification

- `tsgo` typecheck plus the full vitest suite.
- Deploy `content-feedback`, then probe `GET_PRACTICE_IMPACT`.
- Playwright pass on `/executive-home`: load, navigate to a practice and back, confirm no loader and no `generate-mastery-plan` invocation in the console log trail; then `/insights` screenshot for the two-card layout and chevrons.
- Publish to production once green.

## Reporting rule

If Fix 2's `post_plan_completion` context or the wearable signal turns out to need a column that does not exist, I will report it and skip that fix rather than work around it.
