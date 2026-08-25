# Completion timestamps for precise wearable badges

Goal: make new practice completions carry `practice_started_at` and `practice_completed_at` reliably, so the existing precise-window wearable badge path has usable anchors whenever HR samples exist.

## Verified current state

- `daily_ritual_completions` already has nullable `practice_started_at` and `practice_completed_at` columns.
- Current database rows show `0 / 427` rows populated for both timestamp fields.
- The frontend completion helper already accepts `startedAt` / `completedAt` and sends them to the `daily-rituals` function.
- The `content-feedback` impact engine already reads those two fields and prefers them over estimated timing when both are present.
- The remaining risk is the completion write path: timestamps are not yet being persisted in production rows.

## Fix 1 — Make completion timing a first-class contract

Update the `daily-rituals` function request shape and `COMPLETE_PRACTICE` handler so timing fields are explicit, validated, and persisted:

- Accept `startedAt`, `completedAt`, `isPlanPractice`, and `planContext` in the request body contract.
- Validate timestamp strings before writing.
- Persist `practice_completed_at` for every completion.
- Persist `practice_started_at` when provided and earlier than completion.
- Keep existing fallback behavior if `startedAt` is unavailable, so completion tracking does not fail.

## Fix 2 — Ensure every player sends a valid start anchor

Harden the frontend completion calls across guided, audio, soundscape, micro, card-deck, and inline reflection completions:

- Prefer the real start time captured when the user begins the practice.
- Fall back to duration-derived start time only when a live start marker is missing.
- Always pass `completedAt` at completion time.
- For inline Reflection Corner completions, provide a short same-session timing window instead of leaving timestamps absent.

## Fix 3 — Preserve multi-practice slot attribution

Keep the current one-row-per-practice rating attribution, and add timing context to those rows’ `context_data` where available:

- `practice_started_at`
- `practice_completed_at`
- `plan_slot_index`
- full `slot_content_ids`

This keeps the practice rating SSOT and the completion ledger aligned without adding tables.

## Fix 4 — Backfill only safe historical anchors

Run a data update for recent rows where reliable completion timestamps already exist in the same row:

- Set `practice_completed_at` from the earliest populated completion column among `guided_practice_completed_at`, `micro_exercise_completed_at`, and `soundscape_completed_at`.
- Set `practice_started_at` by subtracting the known content duration when there is exactly one completed practice id and a content duration is available.
- Leave ambiguous multi-practice historical rows null rather than inventing misleading windows.

## Verification

- Deploy `daily-rituals` after code changes.
- Complete one guided/card/soundscape practice from the plan and confirm the new row has both timestamps.
- Probe `content-feedback` / `GET_PRACTICE_IMPACT` and verify precise-window sessions are counted when HR samples exist.
- Query timestamp population counts before and after the test completion.
- Run the targeted tests or typecheck that cover the touched frontend helpers and edge function contract.
