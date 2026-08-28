# Fix: refreshed brief still shows the old 8:47 copy

## What is actually happening

Confirmed against your account for 28 Aug (morning window):

- Your calendar does have an event today (`Shukrita Puri | Jane`, 12:30, present on both Apple and Google).
- The brief row for this morning was created at 04:00 UTC and its `updated_at` moved to 10:07 when you pressed refresh — so the refresh *is* reaching the backend.
- But the stored body is still the old sentence ("...no calendar demand in view"), even though that sentence no longer exists anywhere in the code we deployed.

Root cause: the brief generator replays a cached snapshot. It looks up an existing `brief_snapshots` row keyed on `(user, local_date, window, input_signature, prompt_version)` and, if copy is present, returns it verbatim and skips regeneration. The signature is built from *signals* only. None of your signals changed today, and the version constant was not bumped when we changed the deterministic copy — so every refresh replays the 04:00 text. Deploying new copy has no effect on any day/window that already has a row.

Secondary: the manual refresh path already sends `forceRefresh`, but the brief generator never reads that flag. And the browser holds its own per-window copy of the brief in local storage, which the refresh action does not clear.

## The fix

1. **Manual refresh forces regeneration — signal-accurate, not random.**
   `compute-outer-readiness` will read the `forceRefresh` flag and, when true, skip the snapshot-replay read so the brief is rebuilt from the *current* signals. Purity is preserved because regeneration is deterministic on inputs: the same signals produce the same read and directive, so if nothing material has changed the direction stays the same and only the parts that were factually wrong (the calendar sentence) change. The full validator runs on the regenerated body exactly as on the cron path — nothing bypasses it. Scheduled cron runs never set the flag, so their behaviour and LLM volume are unchanged.

2. **Refresh writes a new row with a new timestamp; nothing is deleted.**
   The forced run persists a fresh `brief_snapshots` row (new `created_at`/`updated_at`) rather than overwriting or removing the earlier one. Readers already pick the latest row for the day+window, so the newest brief wins while the 04:00 and 07:47 rows stay in the table as history. Existing overwrite-protection stays in place, so a forced run that produces no usable copy can never blank a good brief — it simply leaves the previous one showing.

3. **Bump the brief version so today's already-cached rows stop being replayed.**
   Bump `supabase/functions/_shared/brief-prompt-version.ts` to a new version for the calendar-honesty copy change and sync the frontend mirror (`src/constants/briefPromptVersion.ts`, currently one behind). This is what makes the corrected copy reach users who don't press refresh. No rows are deleted; old-version rows simply stop matching the cache key.

4. **Keep the per-window browser cache; refresh it rather than remove it.**
   The browser continues to hold its own copy of the brief per user/date/window in local storage — that behaviour stays exactly as it is, including instant repaint on normal page loads and revisits. The only change: on a *manual* refresh, the stale entry for the current user/date/window is replaced with the newly generated brief (cleared, then rewritten when the fresh brief arrives) so the card cannot repaint the old text. Other windows' and other days' cached entries are untouched, and nothing changes on automatic loads.


5. **Standing rule:** any change to deterministic brief copy requires a version bump, otherwise it is invisible to every user who already has a row for that window. Noted in the brief architecture doc.

## Launch-safety

- Additive and reversible: no scoring, gating, schema or plan/nudge changes; no deletes; the cron path is untouched.
- Gates before deploy: deterministic brief Deno suite, 171-fixture golden set, validator harness, frontend suite — all green.
- Deploy `compute-outer-readiness` alone first. Then on your account: press "Refresh today's cards" and confirm (a) a new row appears with a new timestamp, (b) the body describes a light calendar rather than "no calendar demand", (c) the sentence agrees with the CALENDAR pill, (d) the overall direction is unchanged where signals are unchanged.
- Repeat on the second account and in the afternoon window; check validator rejection logs after.
- Rollback: redeploy the previous function version and revert the version constant. Historical rows are untouched either way.
