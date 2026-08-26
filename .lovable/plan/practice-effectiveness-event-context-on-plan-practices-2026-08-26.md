# Practice Effectiveness: event context on plan practices

Make each practice row in "Your most effective practices" show the A–H event context it was done in, with a minimal UI-only change.

## What the pill will read

- Practice tied to an event: `Board Governance · Investor` — A–H category label + sub-type only. No arc.
- Practice with no event/day context: `Evening` (arc only) — Morning / Afternoon / Evening.
- Where a practice has been done in several contexts, the pill shows the dominant one (most frequent), so the row stays one line.

## Multi-practice slots

Confirmed behaviour stays as today: one review covering two or more practices in a slot writes the same full-weight rating to every practice in that slot. No shared marker, no extra picker step. The change is only that each row now carries the event context of the slot that produced it.

## Heart emoji

Use the heart emoji (❤️) inline before the wearable signal text, exactly like the thumbs-up emoji (👍) used for ratings. No icon swap, no Lucide `Heart`.

## Technical notes

Server (`content-feedback` `GET_PRACTICE_IMPACT`)
- Replace the `eventCategoryAgg` 24-hour-follower inference with a context-first tally per `content_id`:
  1. `context_data.anchor_event_id` / `anchor_event_title` → look up the merged calendar event and run it through `resolveEvent()` (`_shared/events/resolve-event-category.ts`) for the A–H category label and sub-type.
  2. else `context_data.slot_label` → used as the label.
  3. else arc only, from `session_period` or the completion timestamp.
- Emit a structured field per practice: `{ eventCategory, eventSubtype, arc, contextLabel }`.
- `contextLabel` is composed as:
  - `eventCategory + eventSubtype` if both exist.
  - `eventCategory` if only that exists.
  - `slot_label` if no event.
  - `arc` if nothing else.
  - `null` if even the arc is missing.
- Keep `dominantEventCategory` populated with `contextLabel` for backwards compatibility with `section2`.
- Never invent context: absent anchor and absent slot label means arc only; absent everything means null.

Capture (client)
- `submitPlanSlotPracticeFeedback` and the completion-timing payload gain the slot's event context: anchor event id, anchor event title, slot label, and the arc already available as `session_period`. Sourced from the rated `horizonModule` (`anchorEventId`, `jitEventTitle`, `timeLabel`) in `TodayThreePriorities.tsx`, written into `context_data` alongside the existing `slot_content_ids`.
- Same context is written for every practice in the slot, so a two-practice slot yields two rows with identical event context.

Render (`PracticeEffectiveness.tsx`)
- Replace the Lucide `Heart` import with the heart emoji inline before the wearable signal text.
- `FindingRow` renders the pill from `contextLabel`, truncating to the existing 22-char rule on the middle segment first so the arc always stays visible.
- No other UI change.

Tests
- Unit coverage for the resolver precedence (anchor event → slot label → arc → null) and for a two-practice slot producing identical context on both rows.
