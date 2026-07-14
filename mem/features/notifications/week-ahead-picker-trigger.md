---
name: Week-Ahead Picker Invite — dispatch contract
description: Own-bucket weekly digest. Cap-exempt, ISO-week dedupe, fail-open hydration, kill switch.
type: feature
---
The Week-Ahead Picker Invite (§17.7) is a **weekly digest, not a behavioural nudge**. Treat it accordingly:

- **Own bucket.** Dispatched in `smart-nudges/index.ts` BEFORE `DAILY_NOTIFICATION_CAP`, 2-hour intra-tick suppression, `APP_OPEN_COOLDOWN_MS`, and the per-window slot cap. It does not compete in the `qualified` ranking and does not suppress (or get suppressed by) other nudges.
- **Idempotency = one per ISO week per user.** Week starts Monday 00:00 in the user's local timezone. Enforced by a `notification_log` query for `notification_type='week_ahead_picker_invite'` since the local-Monday boundary, BEFORE dispatch. Cross-reason dedupe applies (a `sunday_evening` send blocks a later `last_day_pto_evening` in the same week).
- **Fail-open hydration.** Every upstream signal (todayEvents, tomorrowEvents, lookbackEventsRaw → ptoToday / ptoTomorrow / holiday / consecutiveOffDaysBefore / todayIsOffDay) defaults to a safe value when missing. A `[week-ahead-hydration]` log line is emitted for every defaulted field so a silent week is diagnosable from edge logs alone.
- **"Last day" is inside the break.** `last_day_pto`, `last_day_holiday`, `last_day_long_weekend` require `todayIsOffDay === true` (from the Availability SSOT — `classifyDay`). The last day of a break is the last OFF day, never the first working day after it. The 14-day lookback in smart-nudges walks each day through `classifyDay` with the user's `country`, so foreign FYI regional holidays (e.g. "Bank Holiday (N Ireland)" for a GB-ENG user) are ignored, and empty calendar days are NEVER off-days — only positive evidence (PTO / applicable public holiday / weekend) counts. Weekend ≠ long weekend.
- **Kill switch.** Secret `WEEK_AHEAD_PICKER_ENABLED`. Default = enabled; set to `'false'` to disable without a deploy. Any other value (or missing) = enabled.
- **Telemetry.** `[week-ahead-trigger]` log line on every active or near-active evaluation. `[week-ahead-hydration]` on every defaulted field. Send ledger = `notification_log` filtered by `notification_type='week_ahead_picker_invite'`; reason via `split_part(payload->>'variant_id', '::', 2)`. Reason values are mutually unique suffixes — no LIKE collisions.
- **Historical validation.** `scripts/dry-run-week-ahead.ts` walks back N weeks for a sample of users and prints what would have fired. Read-only; safe against prod.
