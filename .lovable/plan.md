

## Plan: Reset feedback per brief, fix event-time pairing, honor traveler timezone

### Issue 1 — "Feedback noted" persists into the next brief

**Cause:** `BriefFeedbackRow` keys its localStorage flag by **date only** (`prb-feedback-2026-04-21`). Submitting feedback on the afternoon brief makes the evening brief render in `submitted` mode without ever showing the thumbs row.

**Fix:**
- **Return a stable brief identifier from the edge function.** When `compute-outer-readiness` writes/reads `brief_snapshots`, it already has the canonical `(local_date, time_window, input_signature, prompt_version)` tuple. Surface it as `briefId` in the response. On cache miss, `select('id')` from the upsert; on cache hit, the existing read already loads the row — just add `id` to the SELECT.
- **`useOuterReadiness`** propagates `briefId` (already permissive `Record<string, unknown>`, just add to typed interface).
- **`BriefFeedbackRow`** rekeys storage to `prb-feedback-{briefId}` (falls back to `prb-feedback-{date}-{time_window}` for the brief view that occurs before the snapshot id is known — extremely rare). When `briefId` changes (new brief generated), `mode` re-initializes from storage → fresh thumbs row appears.
- Pass `briefSnapshotId` into the existing `submitBriefFeedback(rating, feedback, briefSnapshotId, { tier, score })` call so feedback rows in `user_engagements.context_data.brief_snapshot_id` are properly attributed.

This is the canonical fix — feedback resets every time a genuinely new brief is generated, never on plain refresh (snapshot id is stable for the same input window).

### Issue 2 — "Intro Call at 01:00" (wrong time, wrong event paired)

**Confirmed in DB**, tomorrow's calendar:
- `SCALE Expo & Summit 2026` — all-day event, starts `2026-04-22T00:00:00Z` (= 01:00 BST)
- `Intro Call > Isabel @ Karyon Partners` — 13:30–14:30 UTC (= 14:30–15:30 BST)
- `MEETUP: AI, Data & Analytics` — 16:30–18:30 UTC (= 17:30–19:30 BST)

**The TZ math is correct** — `01:00` is the actual BST start of the SCALE expo. The bug is twofold:
1. **All-day / multi-day events leak into the "first event" extractor** (line 2820–2833). The user means "first scheduled meeting", not an all-day expo.
2. **The LLM prompt feeds `Titles: Intro Call …` and `First event: 01:00` as two unrelated lines** (lines 3442–3443), so the LLM happily glues them: "the Intro Call at 01:00".

**Fix in `compute-outer-readiness/index.ts`:**

a. **Filter out all-day / multi-day events** when computing `tomorrowFirstEventTime`. Use the same heuristic already trusted elsewhere in the file (`isMeeting`): exclude events where duration ≥ 8h OR `start_time` is exactly 00:00:00 UTC AND end is 23:59:59 OR next day's 00:00:00. Add `end_time` to the SELECT and skip such events.

b. **Pair title with time, not as separate lines.** Instead of two free-floating fields, emit a single structured line that the LLM cannot misglue:
```
First scheduled meeting: 14:30 — Intro Call > Isabel @ Karyon Partners
High-stakes meetings tomorrow (with local times): 14:30 — Intro Call …, 17:30 — MEETUP: AI…
```
Replace the current two lines (3442–3443) with a single titled-time list built by zipping each high-stakes event with its already-computed local time. This eliminates the conflation class entirely.

c. **Add a hard rule to the system prompt:** "When referencing a meeting time, use ONLY the time printed next to that meeting's title. Never combine a meeting title with a time from a different line. If no time is paired with a title, omit the time."

### Issue 3 — Traveler timezone & home-timezone awareness

**Current state (verified):**
- Frontend sends `timezoneOffset: new Date().getTimezoneOffset()` on every brief request → this **already reflects the user's CURRENT location** (correct for a traveler).
- `profiles` has `timezone_offset` (integer minutes east of UTC, written on login & token refresh) — **only one column, no IANA string, no separate "home" field**.
- `compute-outer-readiness` line 2572 queries `profiles.select('timezone')` — that column **doesn't exist**. The query silently returns null, breaking holiday/country derivation.

**Fix (minimal, non-breaking):**

a. **Schema migration** — add two nullable columns to `profiles`:
- `home_timezone text` (IANA, e.g. `Europe/London`) — set ONCE at first login from `Intl.DateTimeFormat().resolvedOptions().timeZone`, never overwritten.
- `current_timezone text` (IANA) — refreshed on every `sync-profile` call alongside the existing `timezone_offset`.
- Backfill `home_timezone = current_timezone` for existing users on next sync.

b. **Frontend `useAuth.tsx`** — extend the `sync-profile` body to include `current_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone`. On the first sync only (when `home_timezone IS NULL` server-side), `sync-profile/index.ts` also sets `home_timezone`.

c. **Frontend `useOuterReadiness.ts`** — also send `currentTimezone` (IANA) and `homeTimezone` (IANA) in the brief request body. The IANA strings let the edge function format event times via `Intl.DateTimeFormat(currentTimezone, …)` instead of fragile `getUTCHours()` arithmetic.

d. **Edge function `compute-outer-readiness/index.ts`** —
- Replace the broken `select('timezone')` with `select('home_timezone, current_timezone')` and use those for country/holiday derivation. Falls back to deriving country from `current_timezone` first (where the user is now), then `home_timezone`.
- Format every event time using `event.toLocaleString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone: currentTimezone })` — guarantees the time printed matches the user's CURRENT zone, so a traveler in EST sees the UK Intro Call as e.g. "09:30" not "14:30".
- When `currentTimezone !== homeTimezone`, append a single line to the prompt: `Traveling: home ${homeTimezone}, currently ${currentTimezone}`. Add a system-prompt rule: "If the user is traveling, all event times above are in their CURRENT timezone. Do not mention the home timezone unless directly relevant to a sleep/circadian observation."

This delivers the CEO-7 logic correctly: the brief always speaks in the user's CURRENT clock, with the home zone available for circadian/jetlag commentary.

### Files touched

| File | Change |
|---|---|
| `supabase/migrations/<ts>_add_profiles_iana_timezones.sql` | Add `home_timezone`, `current_timezone` text cols |
| `src/hooks/useAuth.tsx` | Send `current_timezone` (and `home_timezone` on first sync) to `sync-profile` |
| `supabase/functions/sync-profile/index.ts` | Persist new columns; only set `home_timezone` once |
| `src/hooks/useOuterReadiness.ts` | Send `currentTimezone`, `homeTimezone` IANA strings + add `briefId` to result type |
| `supabase/functions/compute-outer-readiness/index.ts` | Read IANA cols; format all event times via `Intl` in `currentTimezone`; exclude all-day/multi-day from "first event"; pair titles with their own times; return `briefId` from snapshot upsert/read; add traveler line + LLM grounding rule |
| `src/components/home/DecisionReadinessBrief.tsx` | `BriefFeedbackRow` keys storage by `briefId`; passes `briefSnapshotId` to `submitBriefFeedback` |

### Verification

1. After deploy, re-render `/executive-home` for the user → body copy reads "the Intro Call at 14:30" (or current-tz equivalent), never "01:00". No all-day events surface as "first event".
2. As the same user on the same window, refresh 3× → `BriefFeedbackRow` stays in `submitted` state (same `briefId`).
3. When the next true window flips (evening → next morning's first brief), the row resets to thumbs UI.
4. `SELECT brief_snapshot_id FROM user_engagements WHERE event_type='brief_feedback' ORDER BY created_at DESC LIMIT 5` shows IDs populated.
5. Force `Intl.DateTimeFormat().resolvedOptions().timeZone` to `America/New_York` in dev → calendar event lines in the prompt log show `09:30 — Intro Call …`, traveler line added, brief copy uses NY clock.
6. `home_timezone` populated for the user; never overwritten on subsequent logins.

### Out of scope

- Migrating away from `timezone_offset` (kept as fallback for legacy code).
- Detecting jet-lag / circadian misalignment commentary (data is now available; LLM may surface it organically — explicit logic later).
- Changing snapshot caching cadence — fix only adds `id` to the existing flow.

