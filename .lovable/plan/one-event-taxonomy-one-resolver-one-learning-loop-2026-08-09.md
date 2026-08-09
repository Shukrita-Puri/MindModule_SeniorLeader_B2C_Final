# One Event Taxonomy, One Resolver, One Learning Loop

You are right — nothing gets reinvented. Your A–H schema is the specification; the existing `_shared/events/*` files are the implementation of it. This pass reconciles the implementation to your document, wires every surface through one resolver, and makes the learning loop shared rather than per-feature.

## What I verified first

Ran the live classifier against the exact titles in your screenshots:

```text
Flight to New York (BA 183)           -> G  trv.flight        OK
Flight to JFK (BA 183)                -> G  trv.flight        OK
Flight: BA 183 from LHR to JFK        -> G  trv.flight        OK
Chief AI Thursday connects            -> E  str.community     OK
Stay: DoubleTree by Hilton New York   -> (no match)           MISS
National Day / National Day observed  -> (no match)           MISS
1 day liquid fast                     -> (no match)           MISS
Reservation at Yoshoku                -> (no match)           MISS
Statue of Liberty and Ellis Island    -> (no match)           MISS
Weekly AI Forum - Personal            -> H  rhy.catchup       MIS-ROUTED
```

Every one of those misses already has a home in your schema — `G.accommodation`, `H.holiday`, `H.wellness_self_care`, `H.recreation`, `G.travel_day`, `E.community`. No new subtype is needed anywhere. The rows exist; they are simply not being reached.

## A — Is there one TypeScript source of truth?

Yes, and it is the only classifier any surface uses today:

```text
event-categories.ts   A–H pillars
event-subtypes.ts     the subcategory rows + matching cues
event-classifier.ts   title -> subtype
enrich-event.ts       the one adapter every surface reads
```

Brief (LLM and deterministic), calendar load / signal pills (`signal-engine/db-queries.ts`), Week-Ahead, Plan, JIT v2, Smart Nudges, Insights and `event_priority_memory` all resolve through that chain. There is no competing taxonomy file. `src/utils/rules/calendarEvents.ts` does not classify — it only ranks importance and picks "Next Up", so it stays out of scope.

`classify-event-v2.ts` is the richer layered resolver (status, user tags, presentation verbs, attendee roles, travel, acronyms) that currently only shadow-runs. It is the right place for the learning layers, and it already falls back to the same dictionary — so adopting it is a wiring change, not a second taxonomy.

## B — Reconcile the implementation to your schema (no new subcategories)

I compared your 28 subcategories against the rows that exist. The overwhelming majority already match one-for-one. Only these need reconciling, and each is a **mapping** decision, not a new invention:

| Your schema | Current implementation | Action |
|---|---|---|
| `E.routine_sync` | `rhy.catchup` sits under **H** | Re-home to E, subcategory `routine_sync` |
| `C.town_hall` | `vis.all_hands` | Keep row, emit subcategory `town_hall` |
| `C.roundtable` | "roundtable" owned by `str.community` | Split on the speaking gate you defined: speaking/presenting → `C.roundtable`, member-of → `E.community` |
| `C.speaking` | `conf.speaking` under **F** | Speaking-at-event → C; multi-day attendance stays F |
| `F.workshop`, `F.event` | no row | Map onto the existing F rows (`conf.customer_summit`, `conf.award`, offsite) and label per your names |
| `A.strategy` | `str.strategy_planning` under **E** | Multi-hour strategic decision session → `A.strategy`; strategy *review/analysis* stays `E.deep_work` per your doc |
| `D.crisis_decision` | `gov.crisis` under **A** | Re-home to D |

Matching cues come **verbatim from the Examples in your document** — "Stay at Marriott…", "Narrowboat stay", "Reservation at Hakkasan Mayfair", "Racial Harmony Day", "Traditional Thai Massage", "Chief AI Thursday connects", "Banking on Breakfast", "Visit west reservoir". Nothing is authored from scratch; the doc's examples become the row's cues. The `rhy.catchup` "weekly" cue that swallowed "Weekly AI Forum" gets an exclusion so the community gate wins, exactly as your `E.community vs E.routine_sync` distinction requires.

Naming: `subcategoryFromSubtypeId` becomes the single alias table that emits **your** spec names (`deep_work`, `learning`, `community`, `routine_sync`, `accommodation`, `flight`, `travel_day`, `holiday`, `recreation`, `wellness_self_care`, `social`, `family`, `pto`, `stakeholder_communication`, `town_hall`, `roundtable`, `crisis_decision`, `trustee`, `strategy`, `client_presentation`, `pitch_competitive`, `hiring_interview`, `difficult_conversation`, `review`, `compliance`, `workshop`, `event`, `wellness_*`). Internal ids stay stable so no historical row breaks. One test asserts the emitted set equals your 28 names exactly — that is the anti-drift guard.

Your 12 verification cases become the acceptance test file, plus the six titles from today's screenshots.

## C — One resolver, so every surface is identical by construction

New `_shared/events/resolve-event-category.ts` — the only entry point:

```text
1 user override        (explicit, per user)
2 learned token map    (rolled up from confirmed history)
3 persisted class.     (calendar_events.event_category / event_priority_memory)
4 layered classifier   (classify-event-v2 -> dictionary)
5 unresolved           (internal best guess + confidence, label hidden)
```

`enrichEvent` calls it and returns `{ categoryId, subcategory, confidence, source }`. Brief, load pill, Week-Ahead, Plan/JIT v2, Nudges, Insights and `event_priority_memory` already read `enrichEvent`, so they inherit every layer without individual changes. A repo guard test fails the build if any surface imports `classifyEvent` directly again — that is what stops the drift you are describing.

**User-facing vs internal, per your instruction:** when confidence is low the internal category is still assigned and stored (so allocation, arcs and load counting keep working), but the visible chip renders **blank** — never "Meeting". `list-week-ahead-priorities` drops its `|| "Meeting"` default and `WeekAheadPriorities.tsx` drops its client-side `"Meeting"` fallback. Labels stay as they read today: `Travel · accommodation`, `Deep Work & Strategy · community` — no `E.` prefixes.

Load counting improves for free: `isLoadBearingEvent` already excludes G, all-day H and public holidays, so once the hotel stay and National Day actually resolve, they leave the meeting count instead of inflating it.

## D — Learning that feeds every feature, not just JIT v2

Because all surfaces read one resolver, learning only has to be written once to reach all of them. Three shared stores, all read at layers 1–3 above:

1. **Confirmed classifications** — every resolve writes back `event_category` / `event_subcategory` on `calendar_events` and `event_priority_memory`. A title resolved once is never re-derived, and Brief, pills, Week-Ahead, Nudges and Insights all read the same stamped value on the next pass.
2. **Signals from the day's 3 plan slots** — as you asked, Week-Ahead stays read-only for category (users only mark importance there). When an event surfaces in one of the day's three slots and the user categorises or acts on it, that becomes a confirmed observation for that title. No new Week-Ahead UI.
3. **Token generalisation** — nightly, when the same confirmed category recurs across three or more distinct titles sharing a distinctive token (`doubletree`, `forum`, `yoshoku`), the token is promoted to a learned cue for that user, consulted at layer 2. That is how new hotel names and new forum names classify themselves without you populating anything again.

Everything is keyed per user, with a `source` and `confidence` column so a learned guess can be told apart from a dictionary hit and shown or hidden accordingly.

## Safe deployment

Four isolated steps, each independently verifiable and reversible:

1. **Taxonomy reconciliation + spec-name alias table + acceptance tests.** Pure classifier change, no surface behaviour flip. Verified by your 12 cases plus today's six titles.
2. **Resolver + `enrichEvent` rewire, run in shadow.** Both old and new results logged to `event_classifier_parity_log`; I review divergence before flipping. No user-visible change.
3. **Flip the resolver on and remove the "Meeting" fallback.** Deploy Brief / Week-Ahead / Nudges / Plan / Insights together in one pass so no two surfaces disagree for even a minute, then re-run the backfill script over the last 30 days.
4. **Learning-loop migration and nightly roll-up.** Additive tables; layers 1–3 degrade to the dictionary if empty.

I will report the exact classification of every event in your screenshots on each surface before calling it done.