# One Event Taxonomy, Correct Tags, and a Learning Loop

## What I verified first

Ran the live classifier against the exact titles in your screenshots:

```text
Flight to New York (BA 183)           -> G  trv.flight        OK
Flight to JFK (BA 183)                -> G  trv.flight        OK
Flight: BA 183 from LHR to JFK        -> G  trv.flight        OK
Chief AI Thursday connects            -> E  str.community     OK
Stay: DoubleTree by Hilton New York   -> (no match)           WRONG
National Day / National Day observed  -> (no match)           WRONG
1 day liquid fast                     -> (no match)           WRONG
Reservation at Yoshoku                -> (no match)           WRONG
Statue of Liberty and Ellis Island    -> (no match)           WRONG
Weekly AI Forum - Personal            -> H  rhy.catchup       WRONG (should be E.community)
```

So flights are already correct end-to-end. The visible failures are (a) missing keywords for accommodation / holiday / self-care / recreation, (b) a precedence bug where the generic "weekly" keyword on `rhy.catchup` beats the community row, and (c) Week-Ahead printing the word "Meeting" whenever nothing matched.

## A — Is there one TypeScript source of truth?

Yes, and it is already the only one in use. `_shared/events/event-categories.ts` owns A–H; `_shared/events/event-subtypes.ts` owns the 30 subtypes; `event-classifier.ts` does the matching; `enrich-event.ts` is the single read adapter. Brief (LLM + deterministic), calendar signal pills / load count (`signal-engine/db-queries.ts`), Week-Ahead, Plan, JIT v2, Nudges and Insights all resolve through that same path — no forked copy exists. `src/utils/rules/calendarEvents.ts` does not classify; it only ranks importance and picks "Next Up", so it stays untouched.

One real duplication to note: `classify-event-v2.ts` is a second, richer classifier that currently only shadow-runs. It stays additive in this pass; no engine switch.

## B — Make that one file complete

Edit `event-subtypes.ts` only (no new taxonomy file):

- `trv.accommodation` (G): add `stay:`, `stay at`, `hotel`, `doubletree`, `marriott`, `hilton`, `airbnb`, `guesthouse`, `narrowboat stay`.
- `trv.travel_day` (G): add `tour`, `sightseeing`, `excursion`, so "Statue of Liberty and Ellis Island Tour" lands in G rather than nowhere.
- `rhy.holiday` (H): add `national day`, `day observed`, `observed`, alongside the existing all-day gate.
- `rhy.wellness_self_care` (H): add `liquid fast`, `fast`, `detox`, `massage`, `spa`, `salon`.
- `rhy.recreation` (H): add `reservation at`, `dinner at`, `booking at`, `museum`, `exhibition`.
- `str.community` (E): add `forum`, `roundtable`, `connects`, `breakfast club`, and move the row so it is evaluated **before** `rhy.catchup`; add `forum`, `roundtable`, `community` to `rhy.catchup.excludeKeywords` so "Weekly AI Forum" no longer collapses into a catch-up.

Every added keyword gets a matching case in `event-tagging-v2.test.ts` using the exact titles above.

## C — Stop the blanket "Meeting" tag

`list-week-ahead-priorities/index.ts` line 96 ends with `|| "Meeting"`. That is what stamps "Meeting" on National Day, hotel stays and the liquid fast. Change it to return `null` when nothing classifies, and have `WeekAheadPriorities.tsx` render no chip at all in that case (it currently defaults `category` to `"Meeting"` too — that default goes as well). Consumer-facing labels stay as today: bucket name plus the bare subcategory, e.g. `Travel · accommodation`, `Deep Work & Strategy · community` — never `E.community`.

Load count moves in the right direction for free: `isLoadBearingEvent` already drops G, all-day H, and public holidays, so once the hotel stay and National Day actually classify, they finally leave the meeting count instead of inflating it.

## D — How the system learns instead of being hand-fed

Three layers, cheapest first:

1. **Persist what was decided.** `event_priority_memory` already carries `event_category` / `event_subcategory` per `event_id`, and Week-Ahead already prefers the persisted value over a fresh classify. Extend the writer so every classified event stamps its category — not only the ones that reach a plan — so a title is resolved once and reused.
2. **Learn from user corrections.** Add a small `event_category_overrides` table keyed by `(user_id, normalized_title_key)` holding `category`, `subcategory`, `source`. Insert on any explicit user tag, then read it as the top layer of `classifyEventV2` (Layer 1 already accepts `userTags` — this feeds it from the database). One correction fixes that event forever on every surface, because all surfaces share the classifier.
3. **Generalise across new names.** Nightly, roll overrides up by token: when the same corrected category appears for three or more distinct titles sharing a distinctive token (`doubletree`, `yoshoku`, `forum`), promote that token to a per-user learned keyword consulted after the shared dictionary and before "unknown". Unknown stays unknown — the system never guesses "Meeting".

If you would rather not add a user-visible "change category" control in Week-Ahead this pass, layers 1 and 3 still work off implicit signals; say so and I will scope the UI separately.

## Technical notes

- Files touched: `_shared/events/event-subtypes.ts`, `_shared/events/event-tagging-v2.test.ts`, `list-week-ahead-priorities/index.ts`, `src/components/home/WeekAheadPriorities.tsx`, plus one migration and a small override reader in `classify-event-v2.ts`.
- No change to the Calendar "Next" pill, to travel arc logic, or to MRS scoring.
- Verification: Deno tests for the ten titles above, then live calls to `list-week-ahead-priorities` and `compute-outer-readiness` to confirm identical tags on both surfaces.
- Deploy order: keyword + test change first (isolated), then the Week-Ahead label change, then the learning-loop migration.