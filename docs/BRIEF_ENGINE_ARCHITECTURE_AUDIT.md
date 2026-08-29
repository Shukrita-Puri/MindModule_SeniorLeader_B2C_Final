# Brief Engine — Architecture Audit, Current State & Launch Plan

Date: 2026-08-27 (supersedes the 2026-08 draft) · Scope: how the Decision
Readiness Brief turns raw signals into copy, what changed on 26–27 Aug, and a
prioritised list split into **pre-launch** and **post-launch** work.

Launch context: shipping next week to paying/discerning CEO users. The bar for
launch is **consistently good and never wrong**, not excellent. Anything that
raises the ceiling but risks the floor is post-launch.

---

## 1. What the Brief is

The single sentence-block on Executive Home that tells the user: what their body
and mind are doing, what the day is going to ask of them, what work posture to
take, and one self-regulation instruction.

Produced by `supabase/functions/compute-outer-readiness/index.ts`, which is also
the MRS writer. That co-location is deliberate: the Brief must never describe a
different readiness state than the score shown above it.

Two producers, one contract:

| Path | Producer | When it is used |
|---|---|---|
| LLM | Claude/Gemini via the copy prompt | Signals sufficient and the body passes `validateV61Output` |
| Deterministic | `_shared/brief/deterministic-brief.ts` | LLM unavailable, over budget, rejected by the validator, or signals thin |

Both paths are fed from the same resolved inputs. Neither re-derives signals.
If there is no current personal signal at all, the deterministic fallback
returns `null` and the Brief shows the canonical **awaiting** state — the old
"Signal is thin this {window}…" line is retired.

---

## 2. What changed on 26–27 August

These are landed and deployed, not proposals.

### 2.1 Copy consolidation — one persona pack
- `_shared/brief/family-copy.ts` is **deleted**. Never recreate it.
- All scenario-family copy now lives in `_shared/personas/ceo/behaviour-copy.ts`
  as a `NARRATIVE_COPY` section (`NARRATIVE_READS`, `NARRATIVE_CLOSES`,
  `renderNarrativeBeats()`, `assembleNarrativeBody()`), side by side with the
  rule-level `BEHAVIOUR_COPY`, `DAY_SHAPE_OWNED_RULES` and `missingCopyEntries`,
  which were untouched.
- `deterministic-brief.ts` is the only consumer; `lead-narrative.ts` resolves
  *which* story fires and holds no copy.
- Net effect: one persona seam. Rule copy and family copy can no longer drift.

### 2.2 Window awareness (the substantive correctness fix)
Evidence eligibility is now a function of the time window, matching the
signal-engine window split:

```text
morning    body   = overnight recovery, sleep quality, resting rate
           day    = the full day ahead
afternoon  body   = intraday strain / how the day is landing
           day    = what has run + what is left
           sleep and overnight recovery are NOT quotable
evening    body   = how the day sat (afternoon strain, latest recovery read)
           day    = what today cost + tomorrow's pressure
           sleep NOT quotable; "the day ahead" NOT quotable
```

Consequences now enforced in copy:
- `bodySignal()` returns `null` rather than reaching for sleep outside morning;
  afternoon/evening fall back to **felt state + day shape** and never invent a
  signal.
- Day-shape phrasing is tense-correct: "today runs without a gap" (morning) →
  "what is left of the day runs without a gap" (afternoon) → "the day ran
  without a gap" (evening).
- Pre-day directives (front-load, sequence the morning, clear it before you
  board) are morning-only. Afternoon shifts to the remaining half; evening
  closes the day or names tomorrow's first move.
- Evening closes are recovery-only and never instruct on today's work.

### 2.3 Time precision
`_shared/brief/time-phrase.ts` is the SSOT for every time-to-event clause
(`starting now` · `in under 15 minutes` · `in N minutes` · `in about an hour` ·
`in about N hours` · `later today` · `tomorrow` · `null`). `null` means the copy
omits timing entirely — timing is never invented. The anchor's timing clause is
spent **at most once per body**; later beats use the plain reference. Evening
emits no countdown clauses at all.

### 2.4 Copy polish
- The `"{event} ahead"` suffix is gone in favour of natural constructions.
- Evidence openers come from a seeded connector bank — stable within a day,
  varied across days — replacing the mechanical "X and Y. Then Z." template.

### 2.5 Taxonomy corrections feeding the Brief
- `event-intent.ts` now splits content markers into **STRONG** and **WEAK**.
  Weak formats (panel, fireside, AMA) can no longer file an event as passive
  learning on their own, and speaking cues (keynote, panellist, moderating,
  host, my talk) act as counter-markers. "Panel: Future of Payments" resolves
  to a visibility room again, not a webinar.
- `acronym-dictionary.ts`: RFP → `inf.pitch_competitive`.
- `event-subtypes.ts`: new `conf.attendance` for bare conference titles;
  `conf.speaking` requires a speaker cue.
- Attendee counts are never used for classification.
- 15 taxonomy-consuming edge functions redeployed so live behaviour matches.

### 2.6 Demand pillar + auth hardening (readiness failures)
- `compute-outer-readiness` derives full-day / remaining / realized demand from
  `calendar_events` via service role instead of collapsing to 0/null in the
  afternoon.
- `getAuthTokenWithRetry` (6 attempts, 400 ms) stops the "couldn't reach the
  readiness signal" block rendering on iOS cold foreground.

### 2.7 Test coverage
`behaviour-copy.contract.test.ts` now asserts, per family × window: no sleep or
overnight-recovery language after morning, no morning-only directive verbs in
later windows, no forward-looking evening language, at most one timing clause,
no "ahead" suffix, and baseline stays on the generic path. 47/47 green.

---

## 3. Current end-to-end path

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
                                                        resolveLeadNarrative ──────┤
                                                        (family + anchor + phase)  │
                                                                                   ▼
                                                                    ┌──────────────────────────┐
                                                                    │ LLM prompt   OR          │
                                                                    │ deterministic-brief.ts   │
                                                                    │  → behaviour-copy.ts     │
                                                                    │    NARRATIVE_COPY beats  │
                                                                    │    (window-gated)        │
                                                                    └──────────────────────────┘
                                                                                   │
                                                          validateV61Output        ▼
                                                          brief_snapshots + daily_context_snapshot
```

### Layer by layer

**L1 — Retrieval.** `_shared/signal-engine/db-queries.ts` pulls wearables,
check-ins, calendar, travel and history for the user/local date. Calendar rows
pass `mergeCalendarEvents` (dedupe SSOT) and `exclusion-evaluator`
(cancelled/tentative/all-day) before anything downstream sees them.

**L2 — Taxonomy.** Every event resolves once through `enrichEvent` → category
A–H, subtype, stakes, intent. Only resolver; Brief, Plan, Nudges, Insights
share it.

**L3 — Signal matrix.** `buildBehaviourSnapshot` produces the shared signal
object (back-to-back minutes, decision density, context-switching cost, travel
tier, conference day, weight vs volume, recovery deltas, demand scores). Brief
and Plan consume the *same instance*.

**L4 — Scoring.** MRS v4 → baseline/refined scores, band, tier caps, pills.
`briefMustAwait` gates the Brief until pills resolve.

**L5 — Narrative.** `resolveLeadNarrative` collapses the matrix into exactly one
family + one anchor + phase (pre/post) + depletion overlay, persisted to
`daily_context_snapshot.lead_narrative`.

**L6 — Copy.** LLM (prompt carries the narrative block) or `NARRATIVE_COPY` in
the CEO pack renders four beats: Evidence → Read → Work Directive →
Self-Regulation Close, under `copy-vocabulary.ts` persona rules, gated by window.

**L7 — Validation & persistence.** `validateV61Output` (inline in
`compute-outer-readiness`) rejects wellness/clinical vocabulary and enforces the
45–55 word / 60 max body contract. Acceptance is atomic. Written to
`brief_snapshots`, mirrored to `daily_context_snapshot`.

---

## 4. Is the architecture right?

Yes, and the ordering holds: retrieval → taxonomy → matrix → scoring →
narrative → copy → validation. Three properties are the reason it stays
coherent and must be protected:

1. **One resolver for events.** No surface may re-classify.
2. **One signal matrix instance** shared by Brief and Plan.
3. **Atomic acceptance.** No half-briefs, no thin-signal leakage.

Two more added this week:

4. **One copy home per persona.** Rule copy and family copy in one file.
5. **Window gating is a correctness rule, not styling.** A brief that quotes
   last night's sleep at 6pm is wrong, not merely awkward.

### Remaining weaknesses

**W1 — Correlation offline, inference inline.** The Brief reads a flat
`signal_summary` from `causality_findings`, so it can only say what was
pre-computed. It reasons about today, barely about this user's history.

**W2 — Prompt assembled by string concatenation.** `userPrompt +=` appears in
dozens of places in a very large file. Ordering implicit, token cost unbounded,
regressions hard to attribute.

**W3 — No explicit evidence ranking.** Which two signals lead is decided by
branch order, not a salience score, so a true-but-dull signal can beat the
interesting one.

**W4 — Two verification standards.** Deterministic path is valid by
construction and bypasses the runtime validator; LLM path is validated at
runtime. Copy drift in the pack is caught only by unit tests.

**W5 — No output-quality telemetry.** We log which path produced a brief, not
whether it was good. No per-family logging against downstream engagement.

**W6 — Validator ownership is split.** `_shared/brief-validators.ts` is a
parallel, unwired implementation next to the live inline `validateV61Output`.
Real confusion risk for anyone touching validation. (See
`docs/BRIEF_VALIDATOR_SSOT.md`.)

---

## 5. Recommendations, in priority order

### PRE-LAUNCH — do these (ordered)

**P0 · Golden-set snapshot test across families × windows** — *~half day, low risk*
Fixture set: 11 families × depletion on/off × morning/afternoon/evening, run
through both paths in CI. Assert four beats present, no banned vocabulary,
anchor named at most once, close 3–8 words, window rules respected. Extends the
existing `behaviour-copy.contract.test.ts` rather than adding a new harness.
*Why first: it is the safety net for everything else, and it is the cheapest way
to be confident the Brief is never embarrassing on launch day.*

**P1 · Human read-through of the 33 golden outputs** — *~2 hours, no code*
Print the golden set and read every line as a CEO would. Fix only lines that
read wrong. This is the single highest value-per-hour action before launch —
tests prove the rules hold, they do not prove the copy lands.

**P2 · Evidence salience ranking** — *~half day, low risk*
Pure `rankBriefEvidence(snapshot, window) → RankedSignal[]` scoring each
available signal on deviation from personal baseline, bucket diversity, and
relevance to the resolved family. Beats (a) and (b) read the top two instead of
falling through branch order; the LLM receives the same ordered block. Pure
function, unit-testable, no schema change. Depends on P0 for safety.
*Why pre-launch: it is the difference between "technically accurate" and
"noticed something I hadn't".*

**P3 · Validator SSOT cleanup** — *~1 hour, low risk*
Delete or clearly quarantine `_shared/brief-validators.ts` so there is one
validator. Pure hygiene, but it prevents a bad edit during a launch-week
hotfix.

**P4 · Fallback-path smoke check in production** — *~1 hour*
Force the deterministic path for a test account in each window and confirm the
rendered brief plus the awaiting state both look right on device. The LLM path
gets exercised daily; the fallback is what runs when billing or latency bites,
which is exactly when you cannot inspect it.

That is the whole pre-launch list: roughly **1.5–2 days**, no schema changes,
no prompt-behaviour changes.

### POST-LAUNCH — the fuller revisit

**Q1 · Typed prompt model** — *~1 day, medium risk (mechanical but wide)*
Replace scattered `userPrompt +=` with a `BriefPromptModel` built once and
rendered by `renderBriefPrompt(model)`. Same content on day one; ship behind a
snapshot test asserting the rendered prompt is byte-identical. Unlocks token
trimming and prompt A/B.

**Q2 · Inline causality as a first-class beat input** — *~1–2 days, medium risk*
Give the Brief typed findings (`{ cause, effect, confidence, sampleSize,
lastSeen }`) filtered to today's family, not a summary string. Feed the single
highest-confidence relevant finding into beat (b) as a history clause — *"the
last three days like this cost you the next morning."* Gate on
`sampleSize >= 3` plus confidence and stay silent otherwise.
*This is the biggest remaining quality lever, and precisely why it should not
ship in launch week: an unsupported causal claim is worse than no claim.*

**Q3 · Quality telemetry** — *~1 day, low risk*
Log `{ family, anchorCategory, evidenceIds, path, promptVersion, window }` per
brief and join against downstream engagement (plan starts, check-in follow
through). Without it, all future copy work is opinion.

**Q4 · Unify the two verification standards** — *~1 day*
Run the deterministic output through the same validator as the LLM output in CI
(not at runtime — it should pass by construction; a failure is a bug).

**Q5 · Per-family effectiveness review** — *ongoing, after ~4 weeks of data*
Use Q3's telemetry to find families that fire often but land poorly, and rewrite
those banks only.

### Explicitly not recommended
- Rewriting the Brief as an agentic multi-call chain — latency and cost do not
  justify it; the analysis is deterministic enough to precompute.
- Moving narrative resolution into the LLM — the Plan must read the same
  resolved story from the database; a model-chosen story cannot be SSOT.
- A new snapshot table — `daily_context_snapshot` already carries the day's
  resolved context and `lead_narrative`.
- Recreating a separate `brief/family-copy.ts` or any second copy home.

---

## 6. Launch-week sequencing

| # | Item | Effort | When |
|---|---|---|---|
| P0 | Golden set across families × windows | ~0.5 d | Before launch |
| P1 | Human read-through of golden outputs | ~2 h | Before launch |
| P2 | Evidence salience ranking | ~0.5 d | Before launch |
| P3 | Validator SSOT cleanup | ~1 h | Before launch |
| P4 | Fallback-path production smoke check | ~1 h | Before launch |
| Q1 | Typed prompt model | ~1 d | Post-launch |
| Q2 | Inline causality beat | ~1–2 d | Post-launch |
| Q3 | Quality telemetry | ~1 d | Post-launch (start early — it is the input to Q5) |
| Q4 | Unified verification | ~1 d | Post-launch |
| Q5 | Per-family effectiveness review | ongoing | ~4 weeks after launch |

Order: **P0 → P1 → P2 → P3 → P4**, then **Q3 → Q1 → Q2 → Q4 → Q5**.
Telemetry leads the post-launch block so the later work is evidence-driven.

---

## 7. Files that matter

| File | Role |
|---|---|
| `compute-outer-readiness/index.ts` | Orchestrator, MRS writer, prompt assembly, live validator |
| `_shared/signal-engine/db-queries.ts` | Retrieval |
| `_shared/events/enrich-event.ts` | A–H taxonomy SSOT |
| `_shared/events/event-intent.ts` | Content-vs-room intent layer (strong/weak/counter markers) |
| `_shared/events/event-subtypes.ts` · `acronym-dictionary.ts` | Subtypes incl. `conf.attendance`, `inf.pitch_competitive` |
| `_shared/signal-engine/behaviour-snapshot.ts` | Shared signal matrix |
| `_shared/brief/lead-narrative.ts` | Story family + anchor resolution (no copy) |
| `_shared/personas/ceo/behaviour-copy.ts` | **All** brief copy: `BEHAVIOUR_COPY` + `NARRATIVE_COPY` |
| `_shared/brief/deterministic-brief.ts` | Deterministic renderer, sole copy-pack consumer |
| `_shared/brief/copy-vocabulary.ts` | Persona, four-beat contract, banned words, system prompt |
| `_shared/brief/time-phrase.ts` | Time-to-event phrasing SSOT |
| `_shared/brief/day-shape.ts` | Day-shape derivation |
| `_shared/personas/ceo/behaviour-copy.contract.test.ts` | Window/timing/copy invariants |
| `cause-effect-engine` | Nightly correlation → `causality_findings` |
| `docs/BRIEF_VALIDATOR_SSOT.md` | Validator ownership + consolidation plan |

---

## 8. Addendum — v7.7 (2026-08-29)

Prompt version: `v7.7-calendar-load-honesty` (SSOT `_shared/brief-prompt-version.ts`, client mirror `src/constants/briefPromptVersion.ts`).

**Calendar-load honesty.** The deterministic builder names the day's load with the CALENDAR pill's qualitative vocabulary — light / busy / heavy — and reserves "open day" for a true-zero working day (never weekends or off-day shapes). Load is factual: it follows the deduplicated cross-provider / overlap-collapsed event count and is never altered by whether A–H classification recognised the event. Classification governs naming and high-stakes treatment only.

**Remaining vs total meetings.** `effectiveMeetingCount()` speaks to the whole day in the morning, to what is still ahead in the afternoon, and to what actually ran in the evening.

**Window context is the deterministic signal source.** `DeterministicBriefFallbackOpts.windowContext` accepts the Morning / Afternoon / Evening slice built by `_shared/signal-engine/window-context.ts` — the same slice the LLM prompt and `input_signature` already carry. Sleep and overnight recovery only exist on `MorningContext`, so "overnight signals are morning-only" is a type-level fact rather than a hand-written guard. When the option is absent the flat opts remain the source (tests, golden set).

**Two-party title inference.** `_shared/events/two-party-title.ts`, wired into `classify-event-v2.ts`. Title-driven only: separators (`|`, `/`, `<>`, `-`), conjunctions, and person-like connector forms (catch-up, touch-base, 1:1). Attendee count and duration are **not** evidence of a 1:1 — a calendar block can have no invitees. Attendee data is reserved for characterising the relationship (boss, colleague, interview). Social / group forms and stronger A–H classifications still win.

**Generic-branch copy invariants.** The three narrative invariants now also hold for the non-narrative branch and are tested in `_shared/brief/deterministic-generic-window.test.ts`: no `"<event> ahead"`, no overnight signal after the morning, and the anchor's time-until clause spent at most once per body (`spendTimingOnce`).

**Manual refresh.** `build-executive-home-cards` forwards `forceRefresh`; `compute-outer-readiness` then skips only the snapshot *replay read* — validator and overwrite protection stay in force. The forced snapshot updates the matching conflict row in place with a fresh `updated_at`, so DB history is preserved. Only the current window's browser cache is cleared and rewritten.

**Deterministic fallback contract.** The deterministic body is validated by `validateBrief()` before it is served. On rejection the Brief renders the awaiting-signals state; it never ships unvalidated copy.
