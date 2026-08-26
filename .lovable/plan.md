# Deterministic Brief: Reuse the JIT v2 Selector + Brief Engine Audit

Two deliverables. Part 1 is code (deterministic copy quality, driven by the Plan's existing prioritisation engine). Part 2 is a document only — no implementation.

---

## What the Plan actually uses to prioritise (verified)

`generate-mastery-plan/index.ts` switched to JIT v2 as the sole ranking source (`JIT_V2_LIVE = true`). The chain is:

```text
buildPreferredJitV2Selection()
  → selectJitCandidates()        _shared/jit/select-jit.ts
  → adaptV2Ranked()
  → allocatePlanSlots()          _shared/jit/slot-allocator.ts  → 3 daily slots
```

`selectJitCandidates()` is the only place Immediate / Tactical / Strategic combine into an `importance` score. It carries A–H category base weights (A 40, C 32, B 30, D 22 capped 38, F 18, G 12, E 10, H 5), stakes keywords, interpersonal boost, relationship weights, sovereign tag layer, pattern hits, goal alignment, skip penalty and memory delta, plus maturity-tier weighting. It is a pure function — events in, ranked result out.

The Brief does **not** touch this. It ranks independently via `buildBehaviourSnapshot` → CEO behaviour flags → day shape → pillar tiers. That is exactly the incoherence you described: the Brief can lead on an event the Plan never prioritised.

---

## Part 1 — Drive the deterministic Brief from the same ranking

No new scenario layer. Instead:

### 1. One selection, two consumers

Call `selectJitCandidates()` in `compute-outer-readiness` with the same events and context the Plan builds, and persist the winning selection (top candidate: event id, A–H category, subtype, phase, tier, importance, and the runner-up) onto the existing `daily_context_snapshot` row for the window. The Plan reads or reproduces the same selection, so Brief lead event == Plan slot anchor by construction. If the two ever diverge, the persisted row makes it visible instead of silent.

Where the Brief's context is thinner than the Plan's (relationship signals, goals, memory), it passes the same inputs the Plan does — these already exist in shared helpers, nothing new is derived.

### 2. Copy families keyed off the existing taxonomy, not a new abstraction

The copy families you listed map onto A–H + phase + day shape that the selector already emits. They become additional entries in the **existing** CEO copy pack (`_shared/personas/ceo/behaviour-copy.ts`) plus branches in `deterministic-brief.ts` — no new `_shared/brief/scenarios/` folder:

| Family | Keyed off |
|---|---|
| Travel: long-haul w/ work after, short-haul w/ work either side, intercity | G + `travelPhase` + duration (long-haul ≥6h already known to the ranker) |
| Influence & persuasion, pre-event | B + subtype (`B.client_presentation`, `B.pitch_competitive`) + phase `pre` |
| Visibility, pre and post | C + subtype (`C.speaking`, `C.media`, `C.town_hall`) + phase `pre` / `post` |
| Conference / summit arc | F + conference day number + whether a C event sits inside the day (presenting) + evening social events |
| Back-to-back load day | existing `backToBack` behaviour rule + meeting count |
| Weight vs volume | sum of selector `importance` across the day vs raw meeting count — high total importance on few events = weight; low importance on many = volume |
| Context switching | count of distinct A–H categories in the day, already available from the ranked list |
| Poor sleep / recovery / heavy prior day | overlay modifier on whichever family leads — rewrites the read, hardens the close |

The winning family is the category of the top-ranked JIT candidate; the overlay applies on top. No independent precedence table — precedence *is* the selector's importance score.

### 3. Copy quality

Every family writes the four beats from `BODY_FOUR_BEAT_CONTRACT`: (a) evidence from two different buckets, (b) one unhedged read, (c) work directive naming a cognitive posture and the kind of work, (d) 3–8 word self-regulation close. Voice per `CHIEF_OF_STAFF_PERSONA`, `HOW_YOU_SPEAK`, `VOICE_SOUND_LIKE`, `REPLACEMENT_VOCABULARY`. Timing clauses only from `time-phrase.ts`. Event references come from the resolver's category/subtype, replacing the title-regex in `shortRef()`. Two or three lexical variants per beat, chosen deterministically from (user, local date, window) so days don't read identically.

### 4. Verification

- Extend `deterministic-brief.test.ts` with a matrix: family × phase × pill-tier band × depletion overlay — asserting beat count, word budget, forbidden-word cleanliness, and no beat restating another.
- A parity test: for a fixed event set, the Brief's lead event equals the Plan's slot anchor.
- Golden-output snapshots so copy regressions surface in review.
- Bump `BRIEF_PROMPT_VERSION`, deploy `compute-outer-readiness` and `generate-mastery-plan`.

---

## Part 2 — Brief engine architecture audit (document only)

Write `docs/BRIEF_ENGINE_ARCHITECTURE_AUDIT.md`:

**How it works today** — the full path: wearable + check-in ingestion, MRS v4 snapshot, signal pills and their under-the-hood inputs, calendar load and A–H resolution, JIT v2 selection (Plan) vs behaviour flags (Brief), `buildBehaviourSnapshot` / `evaluateForScope`, `buildWindowContext`, the causality `signal_summary` read, prompt assembly in `compute-outer-readiness`, validators, deterministic fallback, caching and the awaiting contract.

**Where the knowledge graph is and isn't used** — which signals reach the prompt, which arrive as flat facts with no inference, and which (insights patterns, causality findings, practice effectiveness, week-over-week movement) are read but under-exploited or arrive too late to shape the narrative.

**The structural finding** — two independent ranking engines (behaviour flags for Brief, JIT v2 for Plan) producing two views of the same day; rule evaluation as independent booleans with no cross-rule correlation; the LLM receiving a flat flag list rather than a ranked causal story; deterministic and LLM paths deriving narrative separately.

**Recommendation** — a single pre-computed inference result (lead cause, supporting evidence, consequence, horizon) built once from the JIT v2 selection plus the signal matrix, consumed identically by the LLM prompt and the deterministic renderer, so the LLM only handles phrasing.

**Step-by-step evolution** — sequenced, additive, pre-launch-safe. Shadow-mode comparison before cut-over, each step with scope, risk and rollback. No rewrite.

---

## Technical notes

- Changed: `compute-outer-readiness/index.ts` (call the shared selector, persist selection on `daily_context_snapshot`), `_shared/brief/deterministic-brief.ts` (family routing off category + subtype + phase), `_shared/personas/ceo/behaviour-copy.ts` (new family entries).
- Reused as-is: `_shared/jit/select-jit.ts`, `_shared/jit/slot-allocator.ts`, `_shared/events/*` resolver and subtypes, `_shared/brief/time-phrase.ts`, `_shared/brief/copy-vocabulary.ts`.
- No new shared abstraction layer. If `select-jit.ts` needs a small extension to expose day-level aggregates (distinct category count, total importance), that extension lands in the existing file.
- Part 2 produces a markdown document only.
