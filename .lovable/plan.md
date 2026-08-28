# Fix: refreshed brief still shows the old 8:47 copy

## What is actually happening

Confirmed against your account for 28 Aug (morning window):

- Your calendar does have an event today (`Shukrita Puri | Jane`, 12:30, present on both Apple and Google).
- The brief row for this morning was created at 04:00 UTC and its `updated_at` moved to 10:07 when you pressed refresh — so the refresh *is* reaching the backend.
- But the stored body is still the old sentence ("...no calendar demand in view"), even though that sentence no longer exists anywhere in the code we deployed.

Root cause: the brief generator replays a cached snapshot. It looks up an existing `brief_snapshots` row keyed on `(user, local_date, window, input_signature, prompt_version)` and, if the copy is present, returns it verbatim and skips regeneration. The signature is built from *signals* only (score, wearable deltas, calendar load, meeting counts...). None of your signals changed today, and the prompt version was not bumped when we changed the deterministic copy — so every refresh keeps replaying the 04:00 text. Deploying new copy code has no effect on any day/window that already has a cached row.

Second, smaller factor: the manual refresh path already sends `forceRefresh`, but the brief generator never reads that flag, so "Refresh today's cards" has no way to bust the cache. And the browser keeps its own per-window copy of the brief in local storage, which the refresh action does not clear.

## The fix

1. **Bump the brief version so today's cached rows are invalidated.**
   Change the backend brief version constant (`supabase/functions/_shared/brief-prompt-version.ts`) to a new value covering the calendar-honesty copy change, and sync the frontend mirror (`src/constants/briefPromptVersion.ts`, currently one version behind). Cached rows written under the old version stop matching, so the next run regenerates with the new copy. No data is deleted; old rows simply stop being replayed.

2. **Make manual refresh actually force regeneration.**
   In `compute-outer-readiness`, read the existing `forceRefresh` flag from the request body and skip the snapshot cache read when it is true. Scheduled cron runs are unaffected (they don't set the flag), so this does not increase LLM volume on the cron path — only when you press the button.

3. **Clear the browser's cached brief on manual refresh.**
   In `useExecutiveHomeCardsRefresh`, clear the persistent brief cache key for the current user/window/date (`cacheKeys.brief`) alongside the existing cache clears, so the card cannot repaint the old text after a successful refresh.

4. **Standing rule going forward:** any change to deterministic brief copy requires a version bump, otherwise it is invisible for every user who already has a row for that window. This will be noted in the brief architecture doc.

## Verification before anything goes live

- Run the deterministic brief Deno suite, the golden set, the validator harness and the frontend suite — all must be green.
- Deploy `compute-outer-readiness` only, then press "Refresh today's cards" on your account and confirm the morning body describes a light calendar (not "no calendar demand"), and that the sentence matches the CALENDAR pill.
- Repeat the check on the second account and in the afternoon window.
- Rollback is a single redeploy of the previous function version plus reverting the version constant.

## Not included

No scoring, gating, schema or plan/nudge changes. Copy content itself is unchanged from what we shipped yesterday — this only makes it reach the screen.
