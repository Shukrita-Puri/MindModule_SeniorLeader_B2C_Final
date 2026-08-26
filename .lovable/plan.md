# Completion ledger integrity, wearable signals, and post-event proof

## Corrected verified state for shukrita@mindmodule.me

- Watch data is available for recent days: `wearable_data.hr_samples` has dense HR samples on 24 and 25 Aug, and HRV exists on most recent days.
- `daily_ritual_completions` has a status mix:
  - `skipped` rows with empty `completed_practice_ids` are expected placeholders/non-completions.
  - `partial` or `full` rows with empty `completed_practice_ids` are incorrect and must not be allowed to keep happening.
  - Current counts checked: `skipped=175 empty`, `partial=15 total / 8 empty`, `full=2 total / 0 empty`.
  - Last 30 days checked: `33` rows, `30 skipped`, `2 partial rows with empty ids`.
- Recent post-practice ratings still have empty `context_data`, so the insights card cannot reliably recover per-practice start/end timing from ratings.
- The calendar issue is one real meeting, stored twice because it is present from two providers:
  - Google row and Apple row both point to the same real event: “Why Investor Comms are so Important”, 11:00–12:00 UTC / 12:00–13:00 London.
  - Post-event logic must canonicalize those provider rows into one event and must record/send once only.
- There is currently no dedicated post-event notification type in `notification_log`; the existing post-event reflection is an in-app card, not a push notification flow.

## Why existing calendar dedupe did not fully protect this path

The dedupe rule already exists, but it is not uniformly enforced as a required read gateway for every calendar consumer.

Verified current wiring:

- The project memory and shared rules define the contract: same normalized title plus same start/end window across providers must collapse to one logical event.
- The backend shared calendar rule exports `mergeCalendarEvents`, and the load-specific helper `calendar-dedupe.ts` is for CEO-behaviour load aggregation.
- `content-feedback` now calls `mergeCalendarEvents` before choosing an in-app event outcome candidate.
- `smart-nudges` has a helper that wraps `mergeCalendarEvents`, but there is no dedicated `post_event_debrief` notification path yet, so that new path must explicitly use the same canonicalized event shape from the beginning.
- `PostEventReflection` still performs a frontend raw `calendar_events` read and then merges locally; this is safer than no merge, but it remains a separate implementation path and uses legacy high-stakes keyword filtering instead of the canonical A–H resolver.

Plan correction:

- Treat `mergeCalendarEvents` / `collapseDuplicateEvents` as the mandatory SSOT for all read-time calendar identity, not an optional helper.
- Do not use the load-only `calendar-dedupe.ts` helper for post-event identity unless the requirement is load aggregation; for post-event prompts and notification dedupe, use the richer read-time merge because it preserves canonical IDs, raw event IDs, source calendars, provider precedence, and status resolution.
- Add a stable canonical event fingerprint for post-event writes and notification dispatch, derived from the merged event identity rather than a raw provider row id.
- Add tests proving that the Apple + Google copies of “Why Investor Comms are so Important” collapse to one candidate, one dispatch claim, one notification log row, and one outcome record.

## Fix 1 — Make the completion write impossible to lose practice ids

Because this has regressed repeatedly, move from “client sends fields and hopes the row merges correctly” to a server-owned invariant:

- Create a single backend completion writer used by all practice types.
- On every completion, require a non-empty `practiceId` and append it server-side into `completed_practice_ids`.
- Server-side merge rule:
  - preserve existing ids,
  - append the new id once,
  - never overwrite a non-empty array with an empty one,
  - store `practice_started_at` and `practice_completed_at`,
  - set the modality timestamp (`soundscape_completed_at`, `guided_practice_completed_at`, or `micro_exercise_completed_at`).
- Treat “completion without a practice id” as a hard error, not a silent partial row.
- Keep `skipped` rows allowed to have empty ids; block or auto-correct only `partial/full` rows that have no completed practice ids.

## Fix 2 — Add database-level protection after cleanup

Add a backend guard so future code changes cannot reintroduce the same corruption:

- First run a safe data cleanup:
  - keep skipped rows as skipped with empty ids,
  - repair recent unambiguous partial rows using session/rating evidence where the completed practice can be identified,
  - downgrade truly unidentifiable partial rows to skipped or leave them excluded from insights rather than pretending a practice happened.
- Then add an integrity trigger/constraint on `daily_ritual_completions`:
  - if `completion_status` is `partial` or `full`, `completed_practice_ids` must contain at least one id,
  - if a practice id is present, `practice_completed_at` must be present,
  - `practice_started_at` may be derived from content duration when the client did not provide it.

## Fix 3 — Make all players prove the write worked

For guided practices, soundscapes, card-deck micro-practices, and the legacy micro player:

- Capture `practiceStartedAt` when the user starts the practice.
- Send `startedAt`, `completedAt`, `durationSeconds`, `practiceId`, `practiceType`, and plan context to the backend completion writer.
- After the backend response, verify the returned row contains the practice id and completed timestamp.
- Only then show the rating/reflection flow and link `sessionId` to the rating/reflection.
- If verification fails, surface/log a clear failure and do not mark the UI as successfully completed.

## Fix 4 — Recover wearable signals for the Insights card

- Correct the measurement anchor:
  - precise timing: use `practice_started_at` → `practice_completed_at`,
  - rating-only timing: treat the rating timestamp as the practice end and derive start from content duration.
- Backfill the last 90 days where there is reliable evidence.
- Compute wearable signal in this order:
  1. HR before / during / after, using 15 min pre, during practice, and 0–15 min post.
  2. HR during vs the user’s own time-of-day baseline when all three windows are not available.
  3. HRV next morning vs 30-day HRV baseline when HRV day-pair data is available.
- Keep single-session results as muted early signals; show nothing only when there is genuinely no watch coverage.

## Fix 5 — Post-event notification without duplicate recording

- Build the post-event notification candidate from canonicalized calendar rows only:
  - query raw rows for the time window,
  - immediately run them through `mergeCalendarEvents`,
  - select and dispatch only from the merged event list.
- Use a stable event fingerprint based on the merged event identity:
  - prefer `canonicalEventId` / `identityKey`,
  - include title + start + end when needed,
  - store raw provider row ids only as metadata/audit context, never as the primary dedupe key.
- Add a `post_event_debrief` notification type that fires after the meeting ends and deep-links to the existing post-event reflection/outcome flow.
- Record delivery in `notification_log` with the canonical fingerprint as `event_reference`.
- Record user response in `event_outcome_feedback` against the same canonical fingerprint, so Apple and Google copies cannot create separate “seen” states.
- For today’s 12:00–13:00 London meeting, send/test against the canonical single event only and confirm exactly one notification log entry.

## Fix 6 — Close remaining raw-calendar post-event gaps

- Move the in-app `PostEventReflection` candidate lookup behind the same backend outcome-candidate path, or mirror the backend canonicalization and A–H filtering exactly.
- Replace title-only “already reflected” checks with canonical event fingerprint checks.
- Add regression coverage for:
  - same title + same time in Apple and Google = one logical event,
  - same time but genuinely different titles = separate events where the SSOT says they are separate,
  - cancelled/tentative provider mirrors cannot suppress or duplicate a confirmed canonical event incorrectly,
  - post-event prompt remains available later in the day until it is answered or the allowed post-event window expires.

## Shukrita end-to-end proof checklist

After implementation, validate with the live account:

1. Complete one guided/soundscape/card practice from the plan.
2. Query `daily_ritual_completions` and confirm the newest non-skipped row has:
   - non-empty `completed_practice_ids`,
   - `practice_started_at`,
   - `practice_completed_at`,
   - correct `completion_status`.
3. Query `practice_sessions` and confirm the practice history row exists.
4. Submit the practice rating and confirm `content_relevance_feedback.context_data` contains the timing fields.
5. Probe `content-feedback` and confirm at least one “Your Most Effective Practices” card returns a non-null `wearableSignal`.
6. Open the Insights card and confirm the wearable badge is visible for at least one recently done practice with HR/HRV evidence.
7. Trigger the post-event candidate for the 12:00 London meeting and confirm it resolves to one canonical event, not two rows.
8. Send the post-event notification and confirm exactly one `notification_log` row plus one outcome row after response.
9. Verify the notification and in-app post-event prompt both use the same canonical event fingerprint.

## Technical files likely touched

- Backend functions: `daily-rituals`, `content-feedback`, `smart-nudges`.
- Shared calendar rules: reuse `supabase/functions/_shared/rules/calendarEvents.ts` / `calendar-merge.ts`; do not invent another post-event dedupe helper.
- Frontend helpers: `dailyRituals`, `relevanceFeedback`, `eventOutcomeFeedback`.
- Player screens: guided, soundscape, card-deck micro, legacy micro.
- In-app post-event UI: route `PostEventReflection` through the canonical candidate/fingerprint flow or make it match exactly.
- Notification tap routing: add the post-event route mapping.
- Database: one data cleanup plus one integrity guard for `daily_ritual_completions`; use canonical post-event fingerprints for duplicate prevention.
