# Brief Engine — Architecture Audit & Evolution Plan

Date: 2026-08 · Scope: how the Decision Readiness Brief turns raw signals into
copy, whether the current layering is right, and a low-risk evolution path.
**No implementation is proposed for immediate execution in this document** —
Part 1 (lead narrative + scenario copy) is already landed; everything below is
analysis and a staged recommendation.

---

## 1. What the Brief actually is

The Brief is the single sentence-block on Executive Home that tells the user:
what their body and mind are doing today, what the day is going to ask of
them, what work posture to take, and one self-regulation instruction.

It is produced by `supabase/functions/compute-outer-readiness/index.ts`, which
is also the MRS writer. That co-location is deliberate: the Brief must never
describe a different readiness state than the score shown above it.

Two producers, one contract:

| Path | Producer | When it is used |
|---|---|---|
| LLM | Claude/Gemini via the copy prompt | Signals are sufficient and the model returns a body that passes validation |
| Deterministic | `_shared/brief/deterministic-brief.ts` | LLM unavailable, over budget, rejected by the validator, or signals are thin |

Both paths are fed from the same resolved inputs. Neither re-derives signals.

---

## 2. Current end-to-end path

```text
 SOURCES                     RESOLUTION                    COMPOSITION            OUTPUT
 ────────────────────────    ─────────────────────────     ──────────────────     ─────────────
 wearable_data          ┐
 daily_checkins         │    signal-engine/db-queries  ┐
 calendar_events        ├──► enrich-event (A–H SSOT)   ├─► buildBehaviourSnapshot ─┐
 travel_state           │    exclusion-evaluator       │   (signals + flags)       │
 causality_findings     │    mergeCalendarEvents       ┘                           │
 brief_snapshots (hist) ┘                                                          │
                                                        deriveDayShape ────────────┤
                             MRS v4 (inner-readiness) ─► pills + band + tier ──────┤
                                                                                   │
                                                        resolveLeadNarrative ──────┤  ← NEW (Part 1A)
                                                        (family + anchor event)    │
                                                                                   ▼
                                                                    ┌──────────────────────────┐
                                                                    │ LLM prompt   OR          │
                                                                    │ deterministic-brief.ts   │
                                                                    │  → family-copy.ts beats  │
                                                                    └──────────────────────────┘
                                                                                   │
                                                          validator (phrase bans)  ▼
                                                          brief_snapshots + daily_context_snapshot
```

### Layer by layer

**L1 — Retrieval.** `_shared/signal-engine/db-queries.ts` pulls wearables,
check-ins, calendar, travel and history for the user/local date. Calendar rows
pass through `mergeCalendarEvents` (dedupe SSOT) and `exclusion-evaluator`
(cancelled/tentative/all-day rules) before anything downstream sees them.

**L2 — Taxonomy.** Every event is resolved once through `enrichEvent`, giving
category A–H, subtype, stakes and intent (content-consumption vs real room).
This is the only resolver; Brief, Plan, Nudges and Insights all read it.

**L3 — Signal matrix.** `buildBehaviourSnapshot` produces the shared signal
object: back-to-back minutes, decision density, context-switching cost, travel
tier, conference day, meeting weight vs volume, recovery deltas. Brief and Plan
consume the *same instance*, which is what stops them contradicting each other.

**L4 — Scoring.** MRS v4 produces baseline/refined scores, band, tier caps and
the signal pills. `briefMustAwait` gates the Brief: if the pills are not yet
resolved, the Brief shows the canonical awaiting message rather than guessing.

**L5 — Narrative (new).** `resolveLeadNarrative` collapses the matrix into
exactly one story family (travel long-haul, persuasion-pre, visibility-post,
conference arc, back-to-back load, weight-vs-volume, context switching,
depletion-into-heavy) plus one anchor event and a depletion overlay. It is
persisted to `daily_context_snapshot.lead_narrative`.

**L6 — Copy.** Either the LLM (prompt now carries the narrative block) or
`family-copy.ts` renders the four beats: Evidence → Read → Work Directive →
Self-Regulation Close, under the Chief-of-Staff persona rules in
`copy-vocabulary.ts`.

**L7 — Validation & persistence.** Phrase validation rejects wellness/clinical
vocabulary; acceptance is atomic (all four beats or none). The accepted brief
is written to `brief_snapshots` and mirrored to `daily_context_snapshot`.

---

## 3. Is this the right approach?

Broadly yes, and the ordering is sound: retrieval → taxonomy → matrix →
scoring → narrative → copy → validation. Three properties are worth protecting
because they are the reason the system is coherent today:

1. **One resolver for events.** No surface may re-classify.
2. **One signal matrix instance** shared by Brief and Plan.
3. **Atomic acceptance** — no half-briefs, no "signal is thin" leakage.

### Where it is genuinely weak

**W1 — Correlation happens offline, inference happens inline.**
Causality lives in `causality_findings` (nightly `cause-effect-engine`), but the
Brief only reads a flat `signal_summary`. It cannot say *"your HRV drops the
morning after back-to-back days like tomorrow"* unless that exact string was
pre-computed. The Brief infers about *today*; it barely reasons about *this
user's history*.

**W2 — The prompt is assembled by string concatenation.**
`userPrompt +=` appears in dozens of places across a ~10k-line file. Ordering
is implicit, token cost is unbounded, and there is no single object that says
"this is what the model was told". This makes regressions hard to attribute.

**W3 — No explicit ranking of evidence.**
Beat (a) must name two signals from different buckets. Which two is currently
decided by branch order rather than by a scored salience list, so the Brief can
lead on a technically-true-but-boring signal while the interesting one is
dropped.

**W4 — Deterministic and LLM paths verify differently.**
The deterministic path is validated by construction and bypasses the phrase
validator (correct, but it means copy drift in `family-copy.ts` is only caught
by unit tests). The LLM path is validated at runtime. Two standards.

**W5 — No output-quality telemetry.**
We know which path produced a brief, but not whether the resulting brief was
*good*. There is no per-family logging of family/anchor/evidence chosen against
downstream engagement.

---

## 4. Recommendation — four stages, none of them an overhaul

### Stage 1 — Evidence salience ranking (small, high value)
Add a pure scorer, `rankBriefEvidence(snapshot) → RankedSignal[]`, that assigns
each available signal a salience score from: deviation from personal baseline,
bucket diversity, and relevance to the resolved narrative family. Beats (a) and
(b) then read the top two ranked items instead of falling through branch order.
Deterministic and LLM paths consume the same ranked list — the LLM gets it as an
ordered prompt block rather than free-form context.

*Risk: low. Pure function, unit-testable, no schema change.*

### Stage 2 — Prompt assembly as a typed object
Replace scattered `userPrompt +=` with a `BriefPromptModel` object built once
and rendered by a single `renderBriefPrompt(model)`. Same content on day one —
this is a refactor, not a behaviour change — but it gives one place to see the
model's inputs, one place to trim tokens, and it makes A/B of prompt versions
trivial.

*Risk: medium (mechanical but wide). Do it behind a snapshot test that asserts
the rendered prompt is byte-identical before/after.*

### Stage 3 — Bring causality inline as a first-class beat input
Extend `causality_findings` reads so the Brief receives typed findings
(`{ cause, effect, confidence, sampleSize, lastSeen }`) rather than a summary
string, filtered to those relevant to today's narrative family. Feed the single
highest-confidence relevant finding into beat (b) as a history clause: *"the
last three days like this cost you the next morning."* Gate on
`sampleSize >= 3` and confidence, and stay silent otherwise — an unsupported
causal claim is worse than no claim.

*Risk: medium. Requires discipline on the confidence gate. This is the single
biggest quality lever available.*

### Stage 4 — Quality telemetry and a shared golden set
Log `{ family, anchorCategory, evidenceIds, path, promptVersion }` per brief.
Build a golden-scenario fixture set (the eight families × depletion on/off ×
morning/afternoon/evening) and run both paths against it in CI, asserting: four
beats present, no banned vocabulary, anchor named at most once, close is 3–8
words. Then compare deterministic vs LLM output on the same fixtures — that
comparison is the only honest measure of "deterministic at par with LLM".

*Risk: low. Test-only, but it is what lets Stages 1–3 ship safely.*

### Explicitly not recommended
- Rewriting the Brief as an agentic multi-call chain. Latency and cost do not
  justify it; the analysis is deterministic enough to precompute.
- Moving narrative resolution into the LLM. The Plan must be able to read the
  same resolved story from the database; a model-chosen story cannot be a SSOT.
- A new snapshot table. `daily_context_snapshot` already carries the day's
  resolved context and now carries `lead_narrative`.

---

## 5. Sequencing

| Stage | Effort | Ship before launch? |
|---|---|---|
| 1 — Evidence salience | ~half day | Yes |
| 2 — Typed prompt model | ~1 day | Optional, post-launch is fine |
| 3 — Inline causality | ~1–2 days | Post-launch, behind confidence gate |
| 4 — Golden set + telemetry | ~1 day | Yes (Stage 1 depends on it for safety) |

Recommended order: **4 → 1 → 2 → 3**. Land the safety net first, then the
quality lever that needs it, then the refactor, then the causal reasoning.

---

## 6. Files that matter

| File | Role |
|---|---|
| `compute-outer-readiness/index.ts` | Orchestrator, MRS writer, prompt assembly |
| `_shared/signal-engine/db-queries.ts` | Retrieval |
| `_shared/events/enrich-event.ts` | A–H taxonomy SSOT |
| `_shared/signal-engine/behaviour-snapshot.ts` | Shared signal matrix |
| `_shared/brief/lead-narrative.ts` | Story family + anchor resolution |
| `_shared/brief/family-copy.ts` | Scenario four-beat copy pack |
| `_shared/brief/deterministic-brief.ts` | Deterministic renderer |
| `_shared/brief/copy-vocabulary.ts` | Persona, four-beat contract, banned words |
| `_shared/brief/time-phrase.ts` | Time-to-event phrasing SSOT |
| `cause-effect-engine` | Nightly correlation → `causality_findings` |
