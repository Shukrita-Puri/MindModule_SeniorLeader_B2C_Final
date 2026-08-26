# A–H SSOT Document + Deterministic-First Brief Quality

## Audit answers to your questions

### Q1. Why is `event_category` NULL — and is learning happening?

Both partly. The learning layer **already exists** (built 2026-08-09) — I did not invent it:

- `_shared/events/learning-store.ts` — `event_category_confirmations` (per-user title memory), `event_learned_tokens` (nightly token promotion via `promote_learned_event_tokens()`), and `stampCalendarEventCategory()`.
- It is read at resolver layers 1–2, ahead of the dictionary, inside `classify-event-v2.ts` / `enrich-event.ts`.

What is actually broken, verified against your account:

| Store | State | Meaning |
|---|---|---|
| `event_category_confirmations` | **19 rows** | learning IS writing |
| `event_learned_tokens` | 1 row | promotion barely firing |
| `calendar_events.event_category` | **0 of 121 stamped** | stamping never lands |

Three concrete faults:

1. **Stamping never lands.** `stampCalendarEventCategory` is called only from `generate-mastery-plan` and `record-event-priority-signal`, and it updates by `calendar_events.id`. Those surfaces operate on **merged/deduped** events whose id is the synthetic merge key, not a row id — so the update matches nothing. Hence `event_category: null` everywhere and resolver layer 3 (persisted) never fires.
2. **The loop is learning from itself.** Every confirmation row has `source: resolver`, `confidence: medium`. `why investor comms are so important → A / investor_meeting` has `observation_count: 8`. The dictionary's guess is being re-observed and hardened as if it were ground truth. There is no user-correction write path in the UI, so nothing ever contradicts it. **This is the most damaging finding: the system is currently learning its own mistakes.**
3. **Only 3 of ~8 surfaces load the learning context.** `compute-outer-readiness` (the Brief), the signal engine, JIT and Nudges call `resolveEvent()` **without** `learned`, so even correct memory does not reach the brief.

### Q2. Does an intent layer already exist? Does it cover everything?

No intent layer exists — `classify-event-v2.ts` has layers 0 status, 1 tags, 2 verbs, 3 roles, 4 travel, 5 acronym, 6 dictionary. Intent is new. And no: it will not cover all classification types, nor should it. It is a **narrow discriminator** that answers one question — *is the user in the room, or consuming content about the room?* Everything else stays with the existing layers.

### Q3. Attendee counts — removed

Agreed and dropped entirely. No attendee count, no "large audience", no "small participant list" cue anywhere in the intent layer or the SSOT. Only title semantics and explicit structural markers (registration/webinar URL, series recurrence, user is not the organiser **only as a tie-break, never as evidence of importance**).

### Q4. The 15-minute cron and the "fresh within 1–2s on open" rule

Both exist, and the gap is real. `build-executive-home-cards` and `early-morning-sync` run `*/15`. On open, the app renders the cached snapshot instantly and silently verifies. But the **brief body** is only rewritten when the `input_signature` changes, and that signature does not contain a time-to-anchor bucket. So a brief written at 05:00 keeps saying "within 24 hours" at 11:00 with the event 10 minutes away.

### Q5. What "awaiting afternoon snapshots" means, and why it matters

`brief_snapshots` holds one row per (day, window). When a window opens before its signals are ready, a placeholder row is written with `brief_source: 'awaiting'` and **no body text**. Today, the afternoon rows for your account are exactly that. Because there is no body, the UI falls back to the most recent *delivered* snapshot — the 05:00 morning one. That is why at 15:45 you are still reading 05:00 prose with 05:00 assumptions.

Impact: it is not one stale sentence, it is a whole window of the day where the brief is silently the previous window's. Fix has two halves — the `*/15` cron must upgrade an `awaiting` row into a real deterministic brief the moment its signals land (it currently only writes on the window-open pass), and the card must label the window it is actually showing rather than presenting a morning brief as the current one.

## Implementation order — four phases, each deployed and verified before the next

### Phase 1 — Classification: educational content vs the real room

New **intent layer**, inserted after status/tags and **before** the dictionary, deliberately narrow. It answers one question: *is the user in the room, or consuming content about the room?* Everything else stays with the existing layers.

- Content markers in the title: interrogative or explainer openers (`why …`, `how to …`, `what … `), `the importance of`, `masterclass`, `webinar`, `panel`, `fireside`, `AMA`, `101`, `deep dive on`, `lessons from`.
- Structural markers: registration/webinar link in `event_metadata`, recurring public series. **No attendee counts, ever.**
- Counter-markers that keep it in A/B: bracketed counterparty (`[Sequoia VC]`), `term sheet`, `sign off`, `due diligence`, `funding`, named fund, `1:1`.
- Two or more content markers and no counter-marker → `E / str.learning`, confidence `medium`.

Plus: replace array-position precedence in `dictionaryV2Match` with an explicit specificity weight so multi-word contextual cues beat single generic tokens.

**Verification before Phase 2:** deployed fixtures pass for today's five real titles; live re-resolve of your calendar shows `Why Investor Comms…` as E, and the three bracketed VC events still B/A.

### Phase 2 — Learning-loop integrity and DB-backed reads on every surface

This is the phase that makes "read from what is written in the DB" true.

1. Repair `stampCalendarEventCategory` so it resolves the real `calendar_events` row ids behind a merged/deduped event. Stamp `event_category`, `event_subcategory`, `category_resolved_by`, `category_confidence` on every resolve.
2. Stop the loop learning from itself: `resolver`-sourced confirmations cap at `medium`, self-observation never outranks a corrected classification, and only `user_override` / `plan_slot` reaches `high`.
3. Quarantine and re-resolve the existing 19 confirmation rows under the Phase 1 intent layer.
4. **Load `learned` context and read the persisted stamp in every consuming surface**, so all five read one answer:
   - Plan — `generate-mastery-plan` (already loads; verify stamp read)
   - Week Ahead — `list-week-ahead-priorities` (already loads; verify stamp read)
   - Brief — `compute-outer-readiness` (**not loading today**)
   - Signal engine — `build-daily-context` / `signal-engine/db-queries.ts` (**not loading today**)
   - Nudges — `smart-nudges` (**not loading today**)
   - Insights — `cause-effect-engine` (**not loading today**)
5. One-off re-resolve backfill over the last 30 days of `calendar_events`.

**Verification before Phase 3:** `select count(*) from calendar_events where event_category is not null` is non-zero and rising; each of the six functions returns the same category for the same event id in a live probe.

### Phase 3 — Deterministic brief: make it read like a chief of staff, not a machine

You are right that the current output is clinical. This phase is a genuine rewrite of the copy layer, not a patch.

1. **Time-to-anchor precision.** `boardLevelOutcome` computes `minutesUntil` and throws it away. Add a shared `timeToAnchor()` producing "in 45 minutes" / "in two hours" / "this afternoon" / "tomorrow morning"; "within 24 hours" only when the time is genuinely unknown. Apply across `boardLevelOutcome`, `advancePrep24h`, `decisionLeakageGuard`, `interpersonalMeetingContext`, `stackedStakes`, `boardReadinessWindow`, `reportingUpwards`.
2. **Freshness.** Add the anchor bucket to the brief `input_signature` so crossing 24h → 4h → 1h → started → passed invalidates the cached body and the next `*/15` pass rewrites it. Teach that pass to upgrade `awaiting` rows once signals land, and label the window actually being shown.
3. **Post-start framing.** Once the anchor has started or passed, drop preparation language and switch to during/post copy.
4. **Voice rewrite.** One claim plus one instruction per line, in the register a chief of staff would use out loud. Kill the machine tells: the stray "-" joiner, the duplicated tail ("…and every choice is prep"), stacked clauses, and generic filler. Expand coverage so every combination of (day shape × anchor category × physiology tier) has a written line — no silent fallback to generic prose.
5. **LLM parity.** The LLM prompt inherits the same anchor-time vocabulary, the same register rules and the same forbidden-phrase list, so a reader cannot tell which engine wrote the brief. Acceptance bar: with the LLM disabled, the deterministic brief is publishable as-is.

**Verification before Phase 4:** side-by-side of deterministic vs LLM output for today's calendar at three different times of day, and a forced-deterministic run of the live brief.

### Phase 4 — The A–H SSOT document (documentation only, not wired)

New `docs/EVENT_TAXONOMY_A_H_SSOT.md`, reconciled line-by-line against your uploaded `FINAL_A_to_H_Schema_Summary`, written **after** the code changes above so it documents reality rather than intent. It covers:

- All 8 pillars and every sub-category: id, spec name, display label, keywords, exclude-keywords, demand profile, JIT lead time, timing matrix, scenario mapping, stakes weight, load-bearing flag.
- The resolver contract: layer order (including the new intent layer), confidence semantics, what renders blank vs labelled.
- The Load Shape interaction: category → demand mode map, stakes weights, precedence order.
- The learning loop: which store is read at which layer, what may write `high` confidence.
- **A complete mirror register** — every file that holds any part of the taxonomy, its role, and its drift test:

```text
BACKEND   _shared/events/event-categories.ts      pillars
          _shared/events/event-subtypes.ts        subtypes + cues
          _shared/events/classify-event-v2.ts     layered resolution
          _shared/events/resolve-event-category.ts  resolveEvent() entry point
          _shared/events/enrich-event.ts          adapter
          _shared/events/event-phase-map.ts       pre/during/post
          _shared/events/learning-store.ts        layers 1-2 memory
          _shared/load-shape/{types,modes,classify,read}.ts
          _shared/plan/{exclusion-evaluator,event-priority-memory}.ts
FRONTEND  src/lib/events/categories.ts            labels mirror
          src/lib/loadShape.ts                    shape mirror
          src/utils/rules/calendarEvents.ts       ranking only, no taxonomy
DB        calendar_events.event_category/_subcategory/_resolved_by/_confidence
          event_category_confirmations, event_learned_tokens,
          event_priority_memory, event_priority_derived
          promote_learned_event_tokens()
EDGE FNS  compute-outer-readiness, generate-mastery-plan,
          list-week-ahead-priorities, record-event-priority-signal,
          smart-nudges, cause-effect-engine, build-daily-context,
          generate-jit-carousel, content-feedback
```

- A gap table: every place the doc and the code disagree, with the code value marked as current truth. No wiring — that is post-launch.

## Technical notes

- Code touched: `_shared/events/classify-event-v2.ts`, `_shared/events/event-subtypes.ts`, `_shared/events/learning-store.ts`, `_shared/personas/ceo/behaviour-copy.ts`, `_shared/ceo-behaviour/workweek.ts`, `_shared/brief/deterministic-brief.ts`, `_shared/brief-signal-coverage.ts`, `compute-outer-readiness/index.ts`, plus the learned-context wiring in `smart-nudges`, `build-daily-context` and `cause-effect-engine`.
- Tests: intent-layer fixtures, copy tests per time bucket, cross-surface consistency test, existing drift tests unchanged.
- Redeploy per phase, verified with a live probe each time rather than assumed.
- No schema changes; the columns already exist on `calendar_events`.

