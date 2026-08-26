# Wearable signals on practice cards + post-event notification

## What I verified first (for shukrita@mindmodule.me)

- Watch HR data is present and dense: `hr_samples` at roughly 5-minute cadence on 24, 25 Aug (63 and 114 samples), plus HRV on most days.
- Practice completions are not carrying identity or timing: every `daily_ritual_completions` row since 24 Aug has an **empty** `completed_practice_ids` and null `practice_started_at` / `practice_completed_at`. Only one row (23 Aug, `harmonic-calm`) has both timestamps.
- Every recent post-practice rating in `content_relevance_feedback` has `context_data = {}`, so the per-practice timing the card relies on never arrives.
- Consequence: the card can only anchor the HR window on the **rating** timestamp, so "before / during / after" is measured *after* the practice finished, and for evening sessions (22:xx) there are zero samples in any window — hence no badge.
- HRV path additionally requires HRV on both the practice day and the next day; 24 Aug HRV is null, so that path silently drops out.
- Today's meeting exists twice in the calendar (same title, 11:00–12:00 UTC = 12:00–13:00 London, "Why Investor Comms are so Important"), so any post-event send must dedupe.
- There is no post-event notification type today: `notification_log` only shows `nudge_one/two/three`, `week_ahead_picker_invite`, `pattern_alert`, `early_morning_sync`. The post-event "How did that go?" prompt is in-app only.

## Fix 1 — Make completions carry identity and timing

- Repair the `daily-rituals` COMPLETE_PRACTICE write so `completed_practice_ids` is always appended (this is the regression that empties the ledger) alongside `practice_started_at` / `practice_completed_at`.
- Ensure each player (guided, soundscape, card-deck, micro) sends the real start marker and completion time, and that the post-practice rating writes `practice_started_at` / `practice_completed_at` / `local_date` into `context_data`.

## Fix 2 — Correct the measurement window and backfill history

- In `content-feedback`, when precise timings exist use them; when only a rating timestamp exists, treat the rating as the practice **end** and derive the start as `end − content duration`, instead of treating it as the start.
- Backfill the last 90 days: set `practice_completed_at` from the slot completion stamp, `practice_started_at` from duration, and repopulate `completed_practice_ids` where the completed practice is unambiguous. Ambiguous multi-practice rows stay null rather than inventing a window.

## Fix 3 — Show a signal whenever the watch has anything usable

Order of preference per practice, first one that resolves wins:

1. HR before / during / after triple (current logic, corrected anchors).
2. HR during vs the user's own baseline for that time of day (14-day mean at the same hour, else resting HR) — labelled "HR vs your baseline".
3. HRV next morning vs the 30-day HRV baseline when same-day HRV is missing.

Single-session values keep the existing muted "early signal" treatment, and practices with genuinely no watch coverage show nothing rather than a misleading number.

## Fix 4 — Post-event notification, recorded end to end

- Add a `post_event_debrief` notification type: fires roughly 10 minutes after a meeting ends, deduped on the merged calendar event, deep-linking to the post-event reflection so the tap writes `event_outcome_feedback`.
- Log it like other nudges (`notification_log` + evaluator trace) so delivery and engagement are auditable.
- Send a live test push after today's 12:00–13:00 London meeting, then confirm the log row, the APNs delivery state, and that responding records the outcome row.

## End-to-end validation

- Run the frontend test suite plus the targeted guards for rituals, reflection capture and calendar reads.
- Complete one practice from the plan and confirm the new row has the practice id and both timestamps.
- Probe `content-feedback` for this user and confirm at least one Tier 1 card returns a non-null `wearableSignal`.
- SQL checks before/after: timing population counts, backfilled row counts, `notification_log` entry for the post-event send, and any `event_outcome_feedback` row created by the tap.

## Technical notes

- Files: `supabase/functions/daily-rituals/index.ts`, `supabase/functions/content-feedback/index.ts`, `supabase/functions/smart-nudges/index.ts`, `src/utils/dailyRituals.ts`, `src/utils/relevanceFeedback.ts`, the four player pages, `src/components/insights/PracticeEffectiveness.tsx` (label for the new baseline signal only).
- Backfill runs as data updates, not schema migrations; the timing columns already exist.
- Baseline HR/HRV comparisons read `wearable_data` columns only — no new tables.
