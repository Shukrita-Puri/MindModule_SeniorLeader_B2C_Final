# Week-Ahead Priorities — "Rank, never filter"

## Problem

The Week-Ahead list currently drops legitimately important meetings before you ever see them. In `supabase/functions/list-week-ahead-priorities/index.ts` and the shared `selectJitCandidates` (`supabase/functions/_shared/jit/select-jit.ts`), events are removed by nine different gates:

1. `isNoiseTitle`
2. `isEducationalTitle` when you're not the organizer
3. `enrichEvent` → `no_category`
4. `isPersonalNoise`
5. `memory_hard_demote` / `memory_escalated_low` (learned)
6. `user_tag_low`
7. `below_min_immediate` score floor
8. `crisis_route_to_nudge`
9. Per-category soft cap (4) + hard `TOP_N = 10`

Even if you cancel a few, no "next best" backfill happens beyond the top 10, and the score floor still hides events entirely — which is why the exercise feels amputated.

## Goal

Move Week-Ahead to a **human-first triage list**: show every real calendar event in the next 7 days, ordered by learned signal, tagged so the human can spot what the system has learned — but never eliminated by scoring, category caps, or top-N truncation.

## Behaviour after change

- Every real event in the 7-day window is returned.
- Only these two auto-hides remain (per your answer):
  - Declined or cancelled events
  - All-day OOO / holiday blocks
- Everything else — including low-attendee syncs, "personal noise", low-score events, memory-demoted events, over-cap categories, and beyond-top-10 — appears in the list.
- Each event carries **tags** (not filters) that the UI can render as chips:
  - `prior_priority` — user starred this recurring series or same-title event in a prior week
  - `pattern_based` — recurring pressure pattern (`patternScore ≥ 10`) or physiological correlation from `causality_findings` / `signal_summary` (e.g. elevated HR at board meetings)
  - `known_relationship` — attendee resolved via `attendee_relationships`
  - `high_stakes` — Category A/B/C
  - `historically_low_signal` — user has dismissed similar events (advisory only, does NOT hide)
- Ordering: prior-priority + pattern-based first, then high-stakes, then remaining events chronologically. No hard cap; return the full week.

## Scope of changes

### 1. `supabase/functions/list-week-ahead-priorities/index.ts`

- Replace the `selectJitCandidates` call with a new `annotateWeekAheadEvents(...)` pass that:
  - Keeps the full deduped event list.
  - Drops only: declined / cancelled (from `event_metadata.status` / attendee response) and all-day OOO (`is_all_day` + OOO title match via existing `classifyAvailability` SSOT).
  - Reuses the same context loaders (`loadJitContextForEvents`) so we still have access to `memoryDeltaByEventId`, `signalSummary`, attendee relationships, sovereign tags — but only to produce **tags and an ordering score**, never to exclude.
- Remove `PER_CATEGORY_SOFT_CAP` and `TOP_N` caps.
- Sort: prior_priority DESC → pattern_based DESC → stakes rank DESC → startTime ASC. Then return chronological for UI, with the tag/score fields intact.
- Persist the full list to `weekly_plan_snapshots.priorities` (same shape, longer array).

### 2. `supabase/functions/_shared/jit/` — no changes

Leave `selectJitCandidates` untouched; the daily Plan / JIT surfaces still need its filtering behaviour. The new `annotateWeekAheadEvents` lives inside the week-ahead function or as a sibling helper.

### 3. Frontend — `src/components/home/WeekAheadPriorities.tsx` (and children)

- Render every returned event grouped by day (no truncation).
- Show tag chips: "Prior priority", "Pattern-based", "Known relationship", "High stakes", "Historically low-signal".
- Keep existing star / dismiss / snooze controls; dismiss no longer removes the event from view — it just clears any tag emphasis and records the memory signal for future weeks.
- No score number shown to the user; tags are the whole story.

### 4. Tests

- Update `supabase/functions/list-week-ahead-priorities/selector-evidence.test.ts`: replace "uses selectJitCandidates" assertions with "does not filter by score / category cap / top-N" assertions.
- Add unit tests for the new annotator:
  - Declined event is hidden.
  - All-day OOO is hidden.
  - Low-score event is present with no tags.
  - Prior-priority event carries `prior_priority` tag and sorts above an unrelated same-day event.
  - Pattern-based event (from `signal_summary`) carries `pattern_based` tag.
- Keep `weekly_snapshot_test.ts` green (upsert shape unchanged).

## Technical detail

**Data sources for tags** (all already loaded by `loadJitContextForEvents`, no new queries):

| Tag | Source |
|-----|--------|
| `prior_priority` | `event_priority_memory` via `memoryDeltaByEventId[eventId].delta ≥ 8` OR same normalized title starred in prior `weekly_plan_snapshots.selected_plan` |
| `pattern_based` | `signal_summary.patternHits` for the event's bucket, or `causality_findings` matching bucket (physiological correlation) |
| `known_relationship` | `attendee_relationships` resolved role ≠ `unknown` with `source ∈ {user_tag, memory_user_tag, llm}` |
| `high_stakes` | `enrichEvent(title).categoryId ∈ {A,B,C}` |
| `historically_low_signal` | `memoryDeltaByEventId[eventId].delta ≤ -10` — advisory tag only, event is NOT excluded even if `hardDemote` is true |

**Declined / cancelled detection**: `event_metadata.status === 'cancelled'` OR attendee response for the user is `declined`. Fall back to keeping the event if metadata is missing (never hide by inference).

**All-day OOO detection**: reuse `classifyAvailability` from `_shared/availability/` (already the SSOT after the C2 cleanup) rather than adding new regexes.

## Out of scope

- No changes to the daily Plan, Brief, or JIT selectors.
- No new taxonomy, no new DB tables.
- No changes to `selectJitCandidates` — the weekday Plan still filters, only Week-Ahead becomes permissive.
- No changes to the weekly snapshot schema.

## Rollout

1. Implement server changes behind no flag (single-surface, low blast radius; weekday Plan is untouched).
2. Update frontend to render tags and remove any client-side "top N" slicing.
3. Deploy `list-week-ahead-priorities`.
4. Verify on your account: open Week Ahead, confirm the Mind Module beta-test event and the Do's and Don'ts event both appear alongside the rest of the week, with correct tags.
