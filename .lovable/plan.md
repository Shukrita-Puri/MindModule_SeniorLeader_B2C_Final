# Relocation Detection — close all 7 gaps

Verified against the live code before writing this:
- `sync-profile/index.ts` line 14 imports only `tzOffsetDiffHours`; line 162 selects only `home_timezone`; the relocation block (lines 169-207) derives its clock solely from `travel_state.last_timezone_change_at`.
- `RelocationPromptBanner.tsx` reads only `possible_relocation_detected`, once, on mount.
- `profiles` has no `current_timezone_changed_at` column.

## 0. Self-healing country backfill (why Jaydeep is still null)

The earlier migration sourced `profiles.country` from `onboarding_v8_responses.home_country`, which was null for every row, so it healed nobody and had no timezone fallback. Fix it in `sync-profile` instead of SQL:
- Import `tzToCountry` alongside `tzOffsetDiffHours`.
- On every login, when `country` is null, set `upsertData.country = tzToCountry(home_timezone)` when it resolves.

Jaydeep's next login sets `country = 'US'`; every pre-v8 user self-heals the same way. The existing migration stays as-is for future v8 completions.

## A. Migration

Add `profiles.current_timezone_changed_at timestamptz` (`ADD COLUMN IF NOT EXISTS`) with a comment noting it is the login-level relocation clock, immune to GPS ping resets, written only by `sync-profile`.

## B. sync-profile — five additions

1. Merge the profile read: select `home_timezone, current_timezone, current_timezone_changed_at, country` in the single existing `existingTz` query.
2. After `upsertData.current_timezone = clientCurrentTz`, stamp `current_timezone_changed_at = now()` only when the stored `current_timezone` exists and differs. (Gaps 1, 3)
3. In the relocation check, use `primaryChangeDate` from `current_timezone_changed_at`, `secondaryChangeDate` from `travel_state.last_timezone_change_at`, and take `primary ?? secondary`. The `> 30 days` and `sustainedRelocation` conditions are unchanged. (Gaps 1, 3)
4. Inside `if (sustainedRelocation)`, also set `country` from `tzToCountry(clientCurrentTz)` — only when the existing `country` is null, never overwriting a confirmed one. (Gap 4)
5. Before the relocation check, inside the same try/catch: when `clientCurrentTz === existingTz.home_timezone`, clear `possible_relocation_detected` and `relocation_candidate_tz`, guarded with `.eq('possible_relocation_detected', true)` so it only writes when a flag exists. (Gap 6)

Everything stays inside the existing non-fatal try/catch — login can never be blocked.

Gap 2 (login-only evaluation) needs no separate work: the login-level clock from item 2 makes the check correct whenever it does run.

## C. RelocationPromptBanner — two changes

6. Also select `home_location_set_at`; show the banner only when `possible_relocation_detected === true` **and** `home_location_set_at != null`. Without a confirmed home anchor, `HomeLocationCard` would silently adopt the current GPS location as home. (Gap 5)
7. Add a Realtime `postgres_changes` UPDATE subscription on the user's own `profiles` row (`filter: id=eq.<user.id>`), re-evaluating visibility from `payload.new` with the same two conditions, torn down on unmount. The banner then appears in the session the flag is written, not the next one. (Gap 7)

### Realtime enablement (exact SQL in the migration)

Confirmed live: the `supabase_realtime` publication currently contains **zero** tables, and `public.profiles` has `relreplident = 'd'` (DEFAULT). So the migration must add both the column and the publication entry:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_timezone_changed_at timestamptz;

COMMENT ON COLUMN public.profiles.current_timezone_changed_at IS
  'Set at login when current_timezone changes value. Primary clock for relocation detection. Immune to GPS ping resets (unlike travel_state.last_timezone_change_at). Only updated from sync-profile.';

-- Realtime enablement for RelocationPromptBanner (item 7)
ALTER TABLE public.profiles REPLICA IDENTITY DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
```

`REPLICA IDENTITY DEFAULT` is sufficient here: the `id=eq.<user.id>` filter and the callback both read `payload.new`, which carries every column on an UPDATE under DEFAULT. `FULL` is only needed to receive the *old* row, which this banner does not use — and it doubles WAL volume on a 91-column table, so we keep DEFAULT. Existing row-level access rules on `profiles` continue to apply to the Realtime stream, so a user only ever receives their own row.

## Verification

- `tsgo` — zero TypeScript errors.
- Deploy `sync-profile`.
- Run the five scenario checks: no-GPS-history flagging, brief-trip clock immunity, convergence clear, banner hidden with no home anchor, and same-session banner appearance.
