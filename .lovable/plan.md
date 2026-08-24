# Recalibrate data architecture fix

Four database changes plus four code fixes, executed in the order below. No table renames, no column renames or type changes, existing RLS untouched.

## What I verified first

- `src/data/practicesAndSoundscapes.ts` (1785 lines) is the live catalogue: entries carry `structuredTags` on most items, `practiceSteps` on guided practices, and rich metadata fields.
- `sanctuary_content_steps` currently holds 0 rows; `sanctuary_content` holds 41.
- All three players (`SoundscapePlayer.tsx`, `GuidedPracticePlayer.tsx`, `MicroPracticePlayerCards.tsx`) call `trackSanctuaryEvent()` (dead path — writes to `sanctuary_events` / `practice_sessions`) and only call `updateRitualCompletion` when `shouldTrackRitual` is true, which is why ad-hoc library practices never reach `daily_ritual_completions`.
- Client writes to `daily_ritual_completions` go through the `daily-rituals` edge function (`UPSERT_RITUAL` / `COMPLETE_PRACTICE`), not direct table writes — so the new columns must be accepted there too.
- `content-feedback` `GET_PRACTICE_IMPACT` reads `user_favorites` with no `user_id` filter, and the ledger guard triggers on `daily_ritual_completions` constrain user updates.

## Migration 1 — `sanctuary_content` columns

Add `intensity_level`, `energy_direction`, `goal_tags`, `physio_targets`, `equipment`, `environment` with the exact checks and `'{}'` array defaults as specified.

## Migration 2 — Catalogue backfill (data, not schema)

Run as data statements (INSERT ... ON CONFLICT), not a schema migration:

- Generate the upsert set from `src/data/practicesAndSoundscapes.ts` using the field mapping given, with thumbnails stored as the relative asset path with the bundler prefix stripped.
- `protocol_type` has exactly two valid values, **`mindset`** and **`somatic`** — no `audio` or `hybrid`. Rule: `subType: 'mindset'` → `mindset`; everything else (`subType: 'tool'`, soundbaths, guided practices) → `somatic`. Verified counts in the static file: 20 `mindset`, 5 `tool`, 10 soundbaths, 5 guided practices.
- Existing non-null `protocol_type` values already in `sanctuary_content` (currently 21 `mindset` / 20 `somatic`) are **preserved** — the upsert only fills `protocol_type` where it is null, so no current classification flips. Same additive rule for `category`: existing values are not overwritten.

- Entries without `structuredTags` keep defaults (null scalars, empty arrays).
- Upsert `sanctuary_content_steps` for every entry with `practiceSteps` (`step_order` = index + 1, `duration` rounded to seconds). If no unique constraint on `(content_id, step_order)` exists, add it in Migration 1 so the `ON CONFLICT` is valid.
- Upsert `sanctuary_content_metadata` for entries with rich metadata, per the given mapping (`benefits` / `what_you_need` / `expected_outcomes` / `delivery_modality` as `text[]`, `real_examples` and `structured_tags` as jsonb).

Verify: `sanctuary_content` count >= 42, `energy-through-reframe` present, `sanctuary_content_steps` count > 0.

The static file stays the runtime source for the player UI; the DB becomes the analytics mirror the impact engine reads.

## Migration 3 — `daily_ritual_completions` columns

Add `is_plan_practice`, `plan_context` (with the 12-value check), `plan_event_category`, `plan_event_date`, `practice_started_at`, `practice_completed_at`.

## Migration 4 — `event_outcome_feedback`

Create the table, both indexes, GRANTs (`SELECT, INSERT` to `authenticated`, `ALL` to `service_role`), enable RLS, and add the two Auth0-`sub` scoped policies exactly as specified.

## Code Fix 1 — favourites scoping

`content-feedback/index.ts`: add `.eq('user_id', userId)` to the `user_favorites` read in `GET_PRACTICE_IMPACT`.

## Code Fix 2 — thumbs mapping

In `GET_PRACTICE_IMPACT` only: restrict `feedbackRows` to `post_practice_completion`, `post_plan_completion`, or null/undefined `trigger_context`; map `star_rating >= 4` to thumbs up, `<= 2` to thumbs down, 3 excluded; `thumbsTotal = up + down`, `thumbsRate` null when total is 0. Deploy `content-feedback`.

## Code Fix 3 — player completion handlers

In all three players:

- Remove `trackSanctuaryEvent()` calls and any `practice_sessions` writes (and now-unused imports). `src/utils/practiceCompletionTracker.ts` is updated or removed if it becomes dead.
- Capture `practice_started_at` when the player opens / play is pressed (ref), pass it into the completion handler.
- Call the ritual completion path for **every** completion (plan queue and ad-hoc): `ritual_date` (local), `session_period` from local time (05–12 morning / 12–18 afternoon / 18–05 evening), `completed_practice_ids` accumulating the content id, `is_plan_practice`, `plan_context`, `plan_event_category`, `plan_event_date` (plan-only, else null), `practice_started_at`, `practice_completed_at`.
- Slot booleans (`soundscape_completed`, `guided_practice_completed`, `micro_exercise_completed`) stay gated by `shouldTrackRitual`; only the ids + new columns write is ungated.
- `src/utils/dailyRituals.ts` gains the new fields on `RitualData` and passes them through; the `daily-rituals` edge function's `UPSERT_RITUAL` / `COMPLETE_PRACTICE` handlers are widened to accept and persist them (server-side clamp so a client cannot set plan fields when `is_plan_practice` is false).

## Code Fix 4 — post-event feedback

- New edge function `event-outcome-prompt` with a `CHECK_PENDING` action: finds high-demand events (Board & Governance, Interpersonal High-Stakes, Travel, Visibility & Comms, Business Development, Conferences & Events, via the canonical A–H resolver) that ended in the last 2 hours, where at least one practice was completed in the 24h before the event start, and no `event_outcome_feedback` row exists for that event; returns the event plus `practice_ids_used`. A `SUBMIT` action writes the row (`rating` 1 / 0 / -1, `open_text`, `practice_ids_used`, `trigger_context: 'post_event'`) via service role.
- Surfacing: checked in-app on app open and on return to the home route (no push notification in this change), reusing the existing rating modal component in a post-event variant — title "How did [event_title] go?", subtitle "You practised beforehand — did it help?", the same three-button layout, optional "What helped or didn't?" text field. Skip dismisses and writes nothing.
- The existing post-practice and post-plan rating popups and the `SUBMIT_FEEDBACK` / `GET_FEEDBACK` / `UPDATE_SESSION_RATING` actions are untouched.

## Verification

- After each migration: row-count and existence checks listed above, plus the DB linter.
- Typecheck and the full existing test suite after each step.
- Deploy `content-feedback`, `daily-rituals`, and the new `event-outcome-prompt`; then complete an ad-hoc practice as a live user and confirm a `daily_ritual_completions` row appears with `is_plan_practice = false` and both timestamps set, and that `GET_PRACTICE_IMPACT` returns thumbs counts scoped to that user only.
