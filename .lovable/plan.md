## Problem

The Brief shows the next high-stakes meeting as `15:14` while the calendar entry is actually `15:15`. The mismatch happens because the time the LLM sees and the time the UI displays are both **derived from "minutes-until"**, not from the event's real `start_time`. Two compounding bugs:

1. **5-minute bucketing.** `nextHighStakesMinutesUntil` is rounded to the nearest 5 minutes before being persisted/exposed (`compute-outer-readiness/index.ts` line 78). A meeting at 15:15 with 11 mins to go becomes "10 mins", which the UI converts back to a fake clock time → `15:14`-style drift.
2. **No real clock time sent to the LLM for TODAY's events.** The TODAY block of the prompt only contains `Next high-stakes: <title> in <N>mins` (line 3546). The LLM has no `HH:mm`, so it either invents one (often echoing the literal `15:14` example in the system prompt at line 3388) or computes one from the rounded minutes. TOMORROW's block already pairs each title with a real local `HH:mm` via `fmtLocalHHmm` and the user's IANA timezone — TODAY just needs the same treatment.

Timezone resolution itself is already correct: the client sends `currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone`, the function persists `current_timezone` / `home_timezone` on `profiles`, and `effectiveCurrentTz = clientCurrentTz || persistedCurrentTz` is used by `fmtLocalHHmm`. We just need to USE that formatter for TODAY's events and at the UI layer.

## Fix

### 1. Edge function: `supabase/functions/compute-outer-readiness/index.ts`

- Capture the raw `start_time` (ISO UTC) for `nextHighStakesEvent` and `nextEventAny` alongside `minutesUntil`. Type becomes `{ title; minutesUntil; startTimeUTC: string } | null`.
- Add a top-level `fmtLocalHHmm(utcDate)` helper (the one currently nested at line 2905) that uses `effectiveCurrentTz` via `Intl.DateTimeFormat('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone })`. Reuse for TODAY and TOMORROW.
- In the LLM prompt's `=== CALENDAR TODAY ===` block, replace the relative-minutes line with paired absolute clock times:
  - `Next event: <title> at HH:mm (in N mins)`
  - `Next high-stakes: <title> at HH:mm (in N mins)`
  - For each entry in `todayHighStakes`, look up its `start_time` (already fetched in `getServerCalendarMetrics`) and emit a `Title — HH:mm` pair, mirroring how TOMORROW does it.
- Tighten the system prompt (around line 3388):
  - Replace the `15:14` literal example with a generic placeholder so the LLM cannot copy it verbatim. Use something like `"…before the [HH:mm] with [Name]"` and add an explicit rule: **"Never invent or reformat clock times. Use ONLY the HH:mm strings provided in the CALENDAR TODAY / TOMORROW sections, character-for-character."**
- Stop bucketing the displayed time: keep the 5-min bucket on `nextHighStakesMinutesUntil` (used elsewhere for triage/horizon) but additionally expose the unrounded `startTimeUTC` (and an unrounded `minutesUntilExact`) on the response for the UI to use. Persist both in `payload_json` / `brief_snapshots` so a re-render uses the same source of truth.

### 2. Brief snapshot regeneration

- Add a one-shot DELETE migration to clear `brief_snapshots` rows for today that contain a clock time in the body, so they regenerate against the new prompt and are no longer stuck on the old `15:14`-style strings. Scope: `local_date = current local date` only.

### 3. UI: `src/components/home/DecisionReadinessBrief.tsx`

- Replace the time derivation in `formatEventTime` with a formatter that takes `startTimeUTC` (ISO) and uses the user's IANA timezone:
  ```ts
  new Intl.DateTimeFormat([], {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date(startTimeUTC));
  ```
  Keep the existing `"now"` / `"in N mins"` short-form for events <30 / <90 minutes away, but switch the long form to read directly off `startTimeUTC` instead of recomputing `Date.now() + minutesUntil*60000` (which silently loses the bucketed minutes).
- Pull `startTimeUTC` from `outerBrief.nextHighStakesEvent` and `outerBrief.nextEvent`.

### 4. Calendar event source of truth (traveler safety)

- The `calendar_events.start_time` column is already stored as a `timestamptz` (UTC). Display always goes through `Intl.DateTimeFormat({ timeZone: <IANA> })`, so when the user crosses a timezone the new IANA TZ they send up next request is what's used — no per-event TZ mutation needed.
- On `useOuterReadiness` request, additionally send `currentTimezoneOffsetMinutes` only as a fallback. Primary key remains the IANA name. (Already done; documenting for reviewers.)
- Add a small `useEffect` in `App.tsx` (or wherever timezone is currently persisted to `profiles`) to re-send `current_timezone` whenever `Intl.DateTimeFormat().resolvedOptions().timeZone` changes during the session — covers cross-timezone flights without an app restart. Compare against last-seen value in `localStorage`; if different, fire a one-shot Edge Function (existing `update-user-timezone` if present, otherwise add a tiny POST that updates only `profiles.current_timezone`).

### 5. Verification

- Unit-style log assertion in the Edge Function: when building the LLM prompt, log `[brief] today_event_times` containing the paired `[title, HH:mm, startTimeUTC]`. Inspect a fresh request to confirm `15:15` appears (matching the calendar) and `15:14` does not.
- Manual: change device timezone (or use the OS travel toggle), reload, confirm pill clock and Brief copy both render in the new zone and match the user's calendar app.
- Regression: confirm Tomorrow's high-stakes line still uses paired times.

## Files to change

- `supabase/functions/compute-outer-readiness/index.ts` — hoist `fmtLocalHHmm`, add `startTimeUTC` to `nextHighStakesEvent` / `nextEventAny`, rewrite TODAY prompt block with paired `HH:mm`, scrub the `15:14` literal from the system prompt, add explicit "do not invent times" rule.
- `src/components/home/DecisionReadinessBrief.tsx` — format clock time off `startTimeUTC` + IANA TZ instead of `Date.now() + bucketedMinutes`.
- `src/hooks/useOuterReadiness.ts` — surface `startTimeUTC` on the typed response.
- `src/App.tsx` (or existing timezone-persist hook) — re-send `current_timezone` when it changes mid-session.
- New migration: `DELETE FROM public.brief_snapshots WHERE local_date = <today> AND body_text ~ '\d{1,2}:\d{2}'` to force regeneration with the new prompt.

No UI design changes. Only data plumbing, formatting, and prompt wording.
