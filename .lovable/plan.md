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

Both exist, and the gap is real. `build-executive-home-cards` and `early-morning-sync` run `*/15`. On open, the app renders the cached snapshot instantly and silently verifies (the cached-render standard). But the **brief body** is only rewritten when the `input_signature` changes, and that signature does not contain a time-to-anchor bucket. So a brief written at 05:00 keeps saying "within 24 hours" at 11:00 with the event 10 minutes away, and today's afternoon snapshots are `brief_source: awaiting` with no body — the stale morning card keeps rendering.

## What this run delivers

### 1. The A–H SSOT document (documentation only — not wired)

New `docs/EVENT_TAXONOMY_A_H_SSOT.md`, reconciled line-by-line against your uploaded `FINAL_A_to_H_Schema_Summary`. It covers, in one place:

- All 8 pillars and every sub-category: id, spec name, display label, keywords, exclude-keywords, demand profile, JIT lead time, timing matrix, scenario mapping, stakes weight, load-bearing flag.
- The resolver contract: layer order, confidence semantics, what renders blank vs labelled.
- The Load Shape interaction: category → demand mode map, stakes weights, precedence order.
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

- A gap table: every place the doc and the code disagree today, with the code value marked as current truth. No code moves in this run.

### 2. Deterministic brief: raise it to stand alone without the LLM

1. **Time-to-anchor precision.** `boardLevelOutcome` already computes `minutesUntil` and discards it. Add a shared `timeToAnchor()` producing "in 45 minutes" / "in 2 hours" / "this afternoon" / "tomorrow morning"; "within 24 hours" only when the time is genuinely unknown. Apply across `boardLevelOutcome`, `advancePrep24h`, `decisionLeakageGuard`, `interpersonalMeetingContext`, `stackedStakes`, `boardReadinessWindow`, `reportingUpwards`.
2. **Freshness on the 15-minute cron.** Add the anchor bucket to the brief `input_signature` so a crossing (24h → 4h → 1h → started → passed) invalidates the cached body and the next `*/15` pass rewrites it. Fix the `awaiting` afternoon snapshots so a window with signals never renders yesterday's morning prose.
3. **Post-start framing.** Once the anchor has started or passed, drop "every choice today is a preparation input" and switch to during/post copy.
4. **Copy quality pass.** Remove the duplicated tail ("…and every choice is prep"), the stray "-" joiner, and tighten each rule to one claim + one instruction in Chief-of-Staff register. Expand deterministic coverage so every combination of (day shape × anchor category × physiology tier) has a written line — no silent fallback to generic prose.
5. **LLM prompt parity.** The LLM prompt gets the same anchor-time vocabulary and the same forbidden phrases, so LLM and deterministic outputs are indistinguishable in register.

### 3. Classification: educational content vs the real room

New **intent layer**, inserted after status/tags and **before** the dictionary, deliberately narrow:

- Content markers in the title: interrogative or explainer openers (`why …`, `how to …`, `what … `), `the importance of`, `masterclass`, `webinar`, `panel`, `fireside`, `AMA`, `101`, `deep dive on`, `lessons from`.
- Structural markers: registration/webinar link in `event_metadata`, recurring public series.
- Counter-markers that keep it in A/B: bracketed counterparty (`[Sequoia VC]`), `term sheet`, `sign off`, `due diligence`, `funding`, named fund, `1:1`.
- Two or more content markers and no counter-marker → `E / str.learning`, confidence `medium`.

Plus: replace array-position precedence in `dictionaryV2Match` with an explicit specificity weight so multi-word contextual cues beat single generic tokens.

### 4. Fix the learning loop's integrity (small, high value)

- Repair `stampCalendarEventCategory` to resolve the real `calendar_events` row ids behind a merged event, so layer 3 starts working and `event_category` stops being null.
- Stop resolver-sourced confirmations from hardening: cap `resolver` rows at `low`/`medium`, never let `observation_count` from self-observation outrank a dictionary change, and require a `user_override` or `plan_slot` event to reach `high`.
- Quarantine and re-resolve the 19 existing rows once the intent layer lands (they were all written by the resolver, including the wrong investor row).
- Load `learned` context in `compute-outer-readiness` and the signal engine so the Brief sees the same memory the Plan does.

## Technical notes

- New doc: `docs/EVENT_TAXONOMY_A_H_SSOT.md` (no imports, no wiring — post-launch).
- Code touched: `_shared/personas/ceo/behaviour-copy.ts`, `_shared/ceo-behaviour/workweek.ts`, `_shared/brief/deterministic-brief.ts`, `_shared/brief-signal-coverage.ts`, `_shared/events/classify-event-v2.ts`, `_shared/events/event-subtypes.ts`, `_shared/events/learning-store.ts`, `compute-outer-readiness/index.ts`.
- Tests: intent-layer fixtures for today's five real titles, copy tests for each time bucket, existing drift tests unchanged.
- Redeploy: `compute-outer-readiness`, `generate-mastery-plan`, `list-week-ahead-priorities`, `smart-nudges`, `build-daily-context`, `record-event-priority-signal`.
- No schema changes; a one-off re-resolve backfill over the last 30 days of `calendar_events`.
