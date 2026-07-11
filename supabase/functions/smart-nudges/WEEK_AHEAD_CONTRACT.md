# Week-Ahead Notification Contract (Batch B lock-in, Batch E implementation)

**Product rule frozen 2026-07-11.** This file documents the invariants that
the Batch E Week-Ahead work must implement and that no other batch may
weaken.

## Precedence over other notification gates

1. **DND**: Week-Ahead must NOT bypass DND. If the candidate would fire
   inside the user's DND window (in their effective timezone, computed via
   `_shared/effective-timezone.resolveEffectiveTimezone`), it is not sent
   for this tick. It may be attempted again on the next eligible tick
   inside the Sunday Week-Ahead window.

2. **Daily cap**: Week-Ahead is a separate weekly bucket. It does NOT
   consume the daily-3 cap and the daily-3 cap does NOT block it.

3. **Two-hour anti-spam**: Week-Ahead DOES participate in the 2-hour
   suppression rule.
     - If a legitimate production notification (any row where
       `isCountableDeliveryState(delivery_state)` is true — see
       `_shared/countable-notification-states.ts`) was sent to the user
       inside the last 2 hours, Week-Ahead is deferred, not
       permanently suppressed. It becomes eligible again on the next
       cron tick inside the approved Sunday Week-Ahead window.
     - Failed, dry-run, test-push, suppressed, validation_rejected,
       expired, configuration_failed, and duplicate_claim rows are
       non-countable and never block Week-Ahead.

4. **Once sent, Week-Ahead itself starts a 2-hour cooldown** for any
   subsequent standard nudge.

5. **Weekly cap**: at most 1 Week-Ahead notification per ISO week per
   user. The uniqueness key is (user_id, iso_year_week,
   notification_type='week_ahead_picker_invite').

## Trace outcomes (unchanged; enumerated here for Batch E)

Week-Ahead evaluations emit trace rows with one of:

- `week_ahead_not_in_window` — outside the Sunday 16:00–19:00 local window.
- `week_ahead_already_sent_this_week` — the weekly-cap row exists.
- `week_ahead_deferred_two_hour_suppression` (**Batch E — new**) — a
  countable production notification landed within 2 h; try again next
  eligible tick.
- `week_ahead_deferred_dnd` (**Batch E — new**) — candidate hour is inside
  DND.
- `week_ahead_not_selected` — evaluator decided no.
- `week_ahead_selected` — dispatched.

## Explicitly out of scope

- Changing the Sunday window boundaries or the weekly cap.
- Re-designing the daily-3 cap semantics.
