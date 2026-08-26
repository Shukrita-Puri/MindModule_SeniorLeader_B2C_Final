# Deterministic Brief: Scenario Copy Families + Brief Engine Audit

Two separate deliverables. Part 1 is code (deterministic copy quality). Part 2 is a document only — no implementation.

---

## Part 1 — Deterministic copy at parity with the LLM

Today the deterministic brief routes on day shape first (travel / conference / off-day), then falls through to a single top CEO behaviour flag, then to a pillar-tier map. That produces correct-but-thin copy for the eight scenarios you listed: only one flag speaks, evidence rarely names the event category, and directives collapse into generic postures.

### What changes

Introduce a **scenario layer** between the behaviour flags and the copy, in a new `_shared/brief/scenarios/` folder, with one module per family. Each module declares: a match predicate (reading day shape, JIT v2 priority, A–H category + subtype, flags, pill tiers, sleep/recovery, load shape), a precedence rank, and four beat builders written in the Chief-of-Staff register.

Families to build:

1. **Travel** — long-haul with work after landing; short-haul with work either side; intercity/rail day trip. Each with pre / in-transit / post phase copy.
2. **Influence & persuasion (B)** — pre-event only: client pitch, investor pitch, sales close. Copy differs by subtype and by time-to-event bucket.
3. **Visibility (C)** — keynote, media, town hall, all-hands. Pre-event and post-event variants (post = stage-chemistry clear-down, not celebration).
4. **Conference / summit long-day arc** — day number, whether the user is presenting, running the event, or attending, plus evening social obligations as a separate load beat.
5. **Back-to-back load day** — compression as the subject; sequencing and recovery gaps as the directive.
6. **Weight vs volume** — separates a heavy high-stakes day (few rooms, large consequence) from a heavy low-value day (many rooms, little consequence). Different read, different directive.
7. **Context switching** — three or more distinct A–H categories in a day; the cost of re-orienting is the read, ordering and buffering is the directive.
8. **Carry-over depletion** — poor sleep / poor recovery / heavy previous day going into any of families 4–7. This is a *modifier*, not a standalone family: it rewrites the read and hardens the close of whichever family won.

### Copy rules every family follows

- Four beats from `BODY_FOUR_BEAT_CONTRACT`: (a) evidence from two different buckets, (b) one-sentence read with no hedge, (c) work directive naming a cognitive posture and the kind of work, (d) 3–8 word self-regulation close.
- Voice from `CHIEF_OF_STAFF_PERSONA`, `HOW_YOU_SPEAK`, `VOICE_SOUND_LIKE`, `REPLACEMENT_VOCABULARY`. No wellness or clinical vocabulary, no score/tier leak.
- Event references use the resolved A–H category and subtype, never title regex. `shortRef()`'s keyword matching gets replaced by the resolver output where available.
- All timing clauses come from `time-phrase.ts`. Copy never invents timing.
- Two or three lexical variants per beat, selected deterministically from a hash of (user, local date, window), so the same day always renders the same brief but consecutive days do not read identically.

### Precedence

A single ordered resolver decides which family owns the brief when several match — travel and conference own the day; visibility and persuasion own the pre-event window inside a workday; back-to-back / weight / context-switching compete on load severity; carry-over depletion always applies as an overlay. One family leads; at most one other contributes a clause to evidence.

### Verification

- Extend `deterministic-brief.test.ts` with a scenario matrix: every family × phase × pill-tier band × depletion on/off, asserting beat count, word budget, forbidden-word cleanliness, and that no two beats restate each other.
- A golden-output snapshot file so copy regressions are visible in review.
- Bump `BRIEF_PROMPT_VERSION` to invalidate cached briefs, then deploy `compute-outer-readiness`.

---

## Part 2 — Brief engine architecture audit (document only)

Write `docs/BRIEF_ENGINE_ARCHITECTURE_AUDIT.md` covering:

**How it works today** — the full path from raw signals to rendered brief: wearable and check-in ingestion, MRS v4 snapshot, signal pills and their under-the-hood inputs, calendar load and A–H resolution, the JIT v2 priority triangulation, `buildBehaviourSnapshot` / `evaluateForScope` rule evaluation, `buildWindowContext`, the causality `signal_summary` read, prompt assembly in `compute-outer-readiness`, validators, the deterministic fallback, and the caching/awaiting contract.

**Where the knowledge graph is and isn't used** — which of the available signals actually reach the prompt, which reach it only as flat facts, and which (insights patterns, causality findings, historical practice effectiveness, week-over-week movement) are read but under-exploited or arrive too late in the pipeline to influence the narrative.

**The core structural question** — whether analysis, inference and correlation happen before generation or inside it. Findings on: rule evaluation being independent boolean checks with no cross-rule correlation; the LLM receiving a flat flag list rather than a ranked causal story; deterministic and LLM paths deriving their narrative separately rather than sharing one pre-computed "story object".

**Recommendation** — a shared, pre-computed *inference layer* that produces one ranked causal narrative (lead cause, supporting evidence, consequence, horizon) consumed identically by the LLM prompt and the deterministic renderer, so both paths tell the same story and the LLM only handles phrasing.

**Step-by-step evolution** — sequenced, low-risk, pre-launch-safe: additive modules and shadow-mode comparison first, cut-over later, no rewrite of the existing pipeline. Each step with scope, risk, and rollback.

---

## Technical notes

- New: `supabase/functions/_shared/brief/scenarios/*.ts` (one per family), a resolver `scenarios/index.ts`, and shared variant-selection helper.
- Changed: `deterministic-brief.ts` delegates beats to the resolver, keeping current behaviour as the fallback when no family matches; `behaviour-copy.ts` closes stay as-is.
- New tests: scenario matrix + golden snapshots alongside existing 33 tests.
- Part 2 produces a markdown document only. No code changes.
