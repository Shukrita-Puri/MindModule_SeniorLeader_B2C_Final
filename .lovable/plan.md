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

- Canonicalize calendar rows before choosing the candidate, so the Google + Apple duplicate for the 12:00 London meeting becomes one event.
- Use a stable event fingerprint based on title + start + end + provider/external identifiers so the notification and outcome prompt dedupe correctly.
- Add a `post_event_debrief` notification type that fires after the meeting ends and deep-links to the existing post-event reflection/outcome flow.
- Record delivery in `notification_log` and record user response in `event_outcome_feedback`.
- For today’s 12:00–13:00 London meeting, send/test against the canonical single event only and confirm exactly one notification log entry.

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

## Technical files likely touched

- Backend functions: `daily-rituals`, `content-feedback`, `smart-nudges`.
- Frontend helpers: `dailyRituals`, `relevanceFeedback`, `eventOutcomeFeedback`.
- Player screens: guided, soundscape, card-deck micro, legacy micro.
- Notification tap routing: add the post-event route mapping.
- Database: one data cleanup plus one integrity guard for `daily_ritual_completions`.
