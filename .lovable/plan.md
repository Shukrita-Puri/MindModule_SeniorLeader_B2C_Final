## Problem

`mergeCalendarEvents` (src/utils/rules/calendar-merge.ts + mirror in `supabase/functions/_shared/rules/calendar-merge.ts`) is the canonical cross-provider dedupe helper. Per `mem/architecture/event-load-and-dedupe-rules.md`, every count / render surface must run raw `calendar_events` rows through it before counting load, showing titles, or scoring importance.

Today the write-side syncs (Apple / Google / Microsoft) each insert into `calendar_events` independently — that is correct (each sync only knows its own provider). Dedupe is a **read-side** contract. Two things break that contract:

1. **`primary_calendar_events` view is not a dedupe** — it picks a single "winning" provider and drops the others. That hides cross-provider duplicates but also loses signal (e.g. Apple-only holds not present in Google). It is not equivalent to merging.
2. **Several read paths query raw `calendar_events` and skip the merge entirely.** They count/list duplicates.

### Confirmed offenders (raw `calendar_events`, no merge)

Backend:
- `supabase/functions/build-executive-home-cards/index.ts` — `countTodayEvents` uses `select("id", { count: "exact" })` → double/triple counts eventCount used by MRS / Brief / Plan.
- `supabase/functions/cause-effect-engine/index.ts` (~L441).
- `supabase/functions/self-mastery-coach/index.ts` (~L1611, L2213, L2364).
- `supabase/functions/record-event-priority-signal/index.ts` (~L123, L252).
- `supabase/functions/performance-rhythm-insights/index.ts` (~L95).
- `supabase/functions/generate-coach-summary/index.ts` (~L296).

Frontend:
- `src/utils/energyStateEngine.ts` (~L654) — direct Apple probe used for demand.
- `src/utils/coachContextBuilder.ts` (~L574, L657).
- `src/hooks/useCalendarSync.ts` (~L194, L405) — display + counts.
- `src/components/insights/PerformanceRhythmCard.tsx` (~L470).
- `src/components/insights/CalendarStateCorrelations.tsx` (~L98).
- `src/components/home/PostEventReflection.tsx` (~L59).

Compliant paths (leave alone, use as reference):
- `list-week-ahead-priorities`, `compute-outer-readiness`, `generate-mastery-plan`, `_shared/signal-engine/*` — all pipe through `mergeCalendarEvents` after fetch.

## Fix

**Single rule to enforce everywhere:** after any read of `calendar_events` (or `primary_calendar_events`), pass rows through `mergeCalendarEvents(rows, platform)` before counting, rendering, or scoring. Count the merged array's length, never a SQL `count(*)`.

### Backend edits

1. **build-executive-home-cards** — replace `countTodayEvents` with:
   - `SELECT id,title,start_time,end_time,provider,event_metadata,attendees_count,is_organizer,is_recurring` for today's window, then `mergeCalendarEvents(...).length`. This corrects `eventCount` that flows into MRS/Brief/Plan.
2. **cause-effect-engine, self-mastery-coach, record-event-priority-signal, performance-rhythm-insights, generate-coach-summary** — import `mergeCalendarEvents` from `../_shared/rules/calendarEvents.ts`, select the merge-required columns (title, start_time, end_time, provider, event_metadata, attendees_count, is_organizer, is_recurring, external_id, status), and run through the merger before any counting / grouping / titles / attendee sums.

### Frontend edits

3. `src/utils/energyStateEngine.ts`, `src/utils/coachContextBuilder.ts`, `src/hooks/useCalendarSync.ts`, `src/components/insights/PerformanceRhythmCard.tsx`, `src/components/insights/CalendarStateCorrelations.tsx`, `src/components/home/PostEventReflection.tsx` — same treatment: fetch → `mergeCalendarEvents(rows, isNativeApp() ? 'ios' : 'web')` → downstream logic.

### Contract clarification (docs only)

4. Update `mem/architecture/event-load-and-dedupe-rules.md` and `docs/EXECUTIVE_HOME_SSOT.md` with a "Dedupe is mandatory on every read" section that:
   - Lists `mergeCalendarEvents` as the only supported entry point.
   - Bans `select('id', { count: 'exact' })` against `calendar_events`.
   - Notes `primary_calendar_events` is a legacy single-provider view — new code should read `calendar_events` and merge, not read the view.

### Verification

- Live check for `shukrita@mindmodule.me` (has Apple + Google): before fix, `countTodayEvents` returns N×providers; after fix, returns unique count.
- Unit test: extend `_shared/ceo-behaviour-batch2.test.ts` with a fixture containing the same event mirrored across apple + google + microsoft and assert `mergeCalendarEvents(...).length === 1`, `sourceCalendars.length === 3`.
- Manual: run `build-executive-home-cards` for the user and diff `eventCount` before/after.

### Non-goals

- No changes to write-side sync functions. Cross-provider dedupe cannot happen at insert time.
- No changes to `primary_calendar_events` view semantics in this pass (documented as legacy; migration to raw+merge tracked as follow-up).
- No UI changes beyond corrected counts / collapsed duplicate titles.
