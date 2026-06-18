## What I found (evidence)

**A. The LOW tag did NOT reach the DB.**
- `event_priority_memory` for Shuk (`google-oauth2|111878424918915566691`) currently has **0 rows**. The only row in the entire table is a 2-week-old e2e test seed (`auth0|e2e-week-ahead-test`).
- The schema and edge function (`record-event-priority-signal`) are wired correctly — `tag_importance_low` is whitelisted in both the CHECK constraint and `VALID_SIGNALS`. Function logs show JWT verifies fine and there are **no insert errors** logged.
- The write is being skipped client-side. In `TodayThreePriorities.tsx` (lines 340–426) the bridge only fires when `next.priorityTag !== prev.priorityTag`. `prev` is read from `plan.horizonModules[slotIndex].priorityTag`, which is hydrated from the local `planUserEdits` ledger on every render. So if the local ledger already has `low` cached (from a previous tap or cross-window persistence), tapping LOW again is a no-op and the DB never gets the row. Same trap if the slot is re-tagged from a different surface.

**B. The ordering bug is real and independent of tags.**
- Today's calendar: EY interview = 13:00 (4 attendees), Chief AI Thursday = 15:00 (0 attendees).
- The plan still puts Chief AI as priority 1 and EY as priority 2 — even before any tag was applied. With the sovereign tag (LOW on Chief AI, HIGH on EY) applied, this is doubly wrong.
- Two compounding causes:
  1. **The plan does not regenerate after a tag change.** Sovereign tags are persisted (when the bridge fires) but only read on the *next* scheduled regen, so the user sees no instant impact even when the write lands.
  2. **The base ranking itself put Chief AI first.** Chief AI has 0 attendees and an unmemorable title; EY is an interview with 4 attendees and "Interview" in the title. In `select-jit.ts` the immediate-score is dominated by category + attendee/relationship signals. The 0-attendee "Chief AI Thursday connects" is matching some recurring/standup pattern bonus that's outranking EY's interview signal. Needs targeted scoring trace.

## Your three sub-questions, answered

1. **Does the event stay in the priority page when tagged LOW?** Recommend: **stays visible but visibly de-prioritised** — drops to the bottom slot and renders with a muted/de-emphasised treatment (lighter card, smaller title, no Start CTA expanded by default). This gives the user an instant, reversible signal that their tag had impact, without forcing a cancel. Cancel remains the way to remove it entirely.
2. **Should LOW reshuffle the order immediately?** Yes — see step 2 below. The plan should re-rank in-place client-side the moment the tag flips, mirroring what the next regen would produce.
3. **Why is Chief AI ranking above EY?** A scoring bug in `select-jit.ts`; fix in step 3.

## Plan

### 1. Fix the silent DB write skip
- In `TodayThreePriorities.tsx`, change the bridge fire condition from "tag value changed" to "user-initiated change with a defined importance". Fire whenever the click handler runs with `next.priorityTag` set, regardless of `prev`. The server already de-duplicates by `(user_id, event_type_key, signal)` if needed; an extra row is harmless and gives us a clean audit trail.
- Add a single `console.info('[tag-bridge] fired', { signal, eventId })` so future drops are visible without enabling Supabase logs.
- Backfill: no migration needed — the constraint already accepts the signal.

### 2. Instant re-rank on tag change (no plan regen call)
- Add a pure client-side re-sort in `TodayThreePriorities.tsx` triggered by the tag handler: after `setPlan` applies the new tag, re-order `horizonModules` using a small `applySovereignTagOrder()` helper:
  - HIGH-tagged slots float to the top (preserving their internal time order).
  - LOW-tagged slots sink to the bottom.
  - Untagged + MEDIUM keep their current relative order.
- LOW slots render with the existing muted style already used for `Cancelled`-state cards (collapsed body, no Start). Add a small "De-prioritised — your tag" caption so the cause is obvious.
- This is purely presentational re-ordering of an existing array; no server round-trip, no plan ID changes, no completion-tracking impact.

### 3. Fix the base ranking so EY > Chief AI even untagged
- Add a scoring trace dump (already supported via `JIT_V2` shadow log table `jit_shadow_v2_runs`) for today's two events to confirm the exact bonus tipping Chief AI ahead.
- Expected fix in `supabase/functions/_shared/jit/select-jit.ts`:
  - Cap the recurring-meeting bonus at 0 when `attendees_count === 0` AND title matches the `*connects|sync|standup|check-in*` lexicon (these are personal blocks, not stakeholder events).
  - Add an explicit interview boost (title regex `\\binterview\\b`) of +20 to Immediate, gated to events with ≥2 attendees.
- Re-run JIT unit tests in `select-jit.test.ts`; add one new case "EY interview outranks zero-attendee 'connects' block" and one "0-attendee 'connects' does not get recurring bonus".

### 4. Verification
- Manually tap LOW on a fresh slot and confirm a `tag_importance_low` row appears for `google-oauth2|111878424918915566691` in `event_priority_memory`.
- Confirm the UI immediately moves Chief AI to slot 2 and EY to slot 1 after tagging, with the Chief AI card muted.
- Confirm next scheduled `generate-mastery-plan` run honours the persisted tag (existing logic — already covered by tests).

### Files to touch
- `src/components/home/TodayThreePriorities.tsx` (bridge fire condition + tag-driven re-sort + muted LOW card state)
- `supabase/functions/_shared/jit/select-jit.ts` (recurring-bonus gate + interview boost)
- `supabase/functions/_shared/jit/select-jit.test.ts` (two new cases)

### Explicitly NOT in scope
- No DB migration (signal already whitelisted).
- No change to `generate-mastery-plan` itself.
- No change to cancel flow.

## Open questions before I build

1. For the LOW-card muted state — keep the Start CTA hidden (recommended) or just dim the whole card and keep Start tappable?
2. For HIGH float-to-top — should HIGH override the user's explicit completion order (e.g., if slot 1 is already completed, do we still float HIGH above it)? My default: completed slots stay where they are; HIGH only re-orders the *incomplete* tail.
