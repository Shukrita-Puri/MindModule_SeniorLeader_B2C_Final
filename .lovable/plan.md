# Practice Effectiveness: event context on plan practices

Make each practice row in "Your most effective practices" say what it was actually done for, using the same A–H taxonomy the rest of the app uses.

## What the pill will read

- Plan practice tied to an event: `Board Governance · Investor · Evening` — A–H category label, its sub-type, then the arc (Morning / Afternoon / Evening).
- Plan practice with no event anchor (e.g. a recovery slot): `Evening Cooldown · Evening` style, i.e. slot label + arc.
- Ad-hoc practice with no plan slot: arc only (`Morning`).
- Nothing resolvable: no pill. No inferred day type any more.

Where a practice has been done in several contexts, the pill shows the dominant one (most frequent), so the row stays one line.

## Multi-practice slots

Confirmed behaviour stays as it is today: one review covering two or more practices in a slot writes the same full-weight rating to every practice in that slot. No shared marker, no extra picker step. The change here is only that each of those rows now carries the event context of the slot that produced them.

## Technical notes

Capture (client)
- `submitPlanSlotPracticeFeedback` and the completion-timing payload gain the slot's event context: anchor event id, anchor event title, slot label, and the arc already available as `session_period`. Sourced from the rated `horizonModule` (`anchorEventId`, `jitEventTitle`, `timeLabel`) in `TodayThreePriorities.tsx`, written into `context_data` alongside the existing `slot_content_ids`.
- Same context is written for every practice in the slot, so a two-practice slot yields two rows with identical event context.

Resolve (server, `content-feedback` `GET_PRACTICE_IMPACT`)
- Replace the `eventCategoryAgg` 24-hour-follower inference with a context-first tally per `content_id`:
  1. `context_data.anchor_event_id` / `anchor_event_title` → look up the merged calendar event and run it through `resolveEvent()` (`_shared/events/resolve-event-category.ts`) for the A–H category label and sub-type.
  2. else `context_data.slot_label` → used as the label.
  3. else arc only, from `session_period` or the completion timestamp.
- Emit a structured field per practice instead of a free string: `{ eventCategory, eventSubtype, arc }` plus a precomposed `contextLabel`. Keep `dominantEventCategory` populated with `contextLabel` for backwards compatibility with `section2`.
- Never invent context: absent anchor and absent slot label means arc only; absent everything means null.

Render (`PracticeEffectiveness.tsx`)
- `FindingRow` renders the pill from `contextLabel`, truncating to the existing 22-char rule on the middle segment first so the arc always stays visible. No other UI change.

Tests
- Unit coverage for the resolver precedence (anchor event → slot label → arc → null) and for a two-practice slot producing identical context on both rows.
