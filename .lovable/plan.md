# Deterministic Brief: Best-in-Class Scenario Copy + Brief Engine Audit

Two deliverables. Part 1 is the copy work — the heart of the ask. Part 2 is a document only — no implementation.

---

## Design decision: what drives the Brief's lead event

**Not `selectJitCandidates()`.** That function ranks (event × phase) JIT slot candidates for the Plan — "which practice, in which slot, now." Its A–H weight ladder (A 40 / C 32 / B 30 / D 22…) is tuned for slot allocation, not narrative. A day of ten D-category meetings scores below one board call, yet the day's *story* is the compression, not the board call. Using it as the Brief's ranker would import slot logic into narrative logic.

Instead:

- **Narrative engine stays with `buildBehaviourSnapshot()`** — the existing deterministic layer Brief and Plan already share. It knows day shape + travel phase (long/short-haul via duration), conference day number, back-to-back compression, `contextSwitchingCost`, `decisionDensityScore`, and the CEO behaviour flags with A–H category + subtype + anchor event + minutes-until.
- **Plan parity via the shared taxonomy + a persisted check.** JIT v2 and the behaviour rules rank off the *same* A–H categories, subtypes and stakes. The Brief's chosen lead event is written onto the existing `daily_context_snapshot` row, and a parity guard compares it against the Plan's top JIT v2 candidate — divergence surfaces in logs instead of silently shipping a Brief that emphasises an event the Plan ignores. This is a small addition, not a new engine.

---

## Part 1 — Best-in-class deterministic copy per scenario family

The substance: for each family, hand-crafted four-beat bodies in the Chief-of-Staff register, keyed off signals the behaviour snapshot already emits. Copy lives as new entries in the existing CEO copy pack (`_shared/personas/ceo/behaviour-copy.ts`) and as branches in `_shared/brief/deterministic-brief.ts` — no new shared folder.

### Families and their keys

1. **Travel**
   - Long-haul (≥6h, duration is already known to the ranker) with meetings after landing — pre / in-transit / post variants.
   - Short-haul with work either side — the sandwich day: transit as the hinge, both meetings named.
   - Intercity / rail day trip — same-day return; the cost is the re-entry, not the distance.
   - Keyed off: `dayShape` + `travelPhase` + duration + next meeting's category and timing.
2. **Influence & persuasion (B), pre-event** — variants for `B` investor pitch, `B.client_presentation`, `B.pitch_competitive`, sales close. Time-bucketed ("in 45 minutes" vs "later today") — outcome clarity and first move; never confidence theatre.
3. **Visibility (C), pre and post** — variants for `C.speaking` / keynote, `C.media`, `C.town_hall`, `C.stakeholder_communication`, `C.roundtable`. Pre = presence prime (arousal vs anxiety). Post = clear-down beat (stage chemistry, decompression before the next room), not celebration.
4. **Conference / summit long-day arc (F)** — day number in the chain; whether a C event sits inside the day (presenting), the user is running the show (organiser flag), or attending; evening social obligations carried as a separate load beat. Reads accumulate across day 1 vs day 2+.
5. **Back-to-back load day** — from the existing `backToBack` rule + meeting count + compression hours. Compression is the subject; sequencing and the gaps between rooms are the directive.
6. **Weight vs volume** — separates *heavy high-stakes* (few rooms, large consequence: sum of behaviour-flag severities high, meeting count low) from *heavy low-yield* (many rooms, little consequence: count high, stakes low). Different read, different directive (protect the few rooms vs prune the many).
7. **Context switching** — from `contextSwitchingCost` / distinct A–H categories in the day (board → talent → town hall → client pitch). The re-orientation cost is the read; ordering and buffer placement is the directive.
8. **Carry-over depletion (overlay)** — poor sleep / poor recovery / heavy previous day (pill tiers + sleep score + yesterday's load) going into any of families 2–7. Not a standalone family: it rewrites the *read* (the gap between demand and supply) and hardens the *close* (shorter, more protective self-regulation clause) of whichever family leads.

### Copy contract every family follows

- Four beats per `BODY_FOUR_BEAT_CONTRACT`: (a) evidence — two signals from different buckets, stated not explained; (b) one unhedged read; (c) work directive naming a cognitive posture (decide / lead / listen / analyse / defer / execute / sequence / protect) applied to today's specific work; (d) 3–8 word self-regulation close.
- Register per `CHIEF_OF_STAFF_PERSONA`, `HOW_YOU_SPEAK`, `VOICE_SOUND_LIKE`, `VOICE_NEVER_SOUND_LIKE`, `REPLACEMENT_VOCABULARY`. No wellness/clinical words, no score or tier leak, no HRV/baseline vocabulary.
- Event references from the resolver's A–H category + subtype (replacing `shortRef()`'s title regex where resolver output exists). Timing clauses only via `time-phrase.ts`.
- 2–3 lexical variants per beat, chosen deterministically from a hash of (user, local date, window) — stable within a day, varied across days.
- These same family keys feed the LLM prompt block, so deterministic and LLM outputs share one narrative skeleton and differ only in phrasing.

### Verification

- `deterministic-brief.test.ts` extended to a scenario matrix: each family × phase × pill-tier band × depletion overlay on/off — asserting four beats, word budget (40–55, max 60), forbidden-word cleanliness, no beat restating another.
- Golden-output snapshots so every copy change is reviewable as a diff.
- Parity test: Brief lead event == Plan top JIT candidate for a fixed event set.
- Bump `BRIEF_PROMPT_VERSION` (frontend mirror too), deploy `compute-outer-readiness` (and `smart-nudges` / `generate-mastery-plan` if shared modules changed).

---

## Part 2 — Brief engine architecture audit (document only)

Write `docs/BRIEF_ENGINE_ARCHITECTURE_AUDIT.md`:

**How it works today** — the full path from raw signals to rendered brief: wearable + check-in ingestion, MRS v4 snapshot, signal pills and their under-the-hood inputs, calendar load and A–H resolution, `buildBehaviourSnapshot` / `evaluateForScope` rules, `buildWindowContext`, causality `signal_summary` read, JIT v2 selection (Plan side), prompt assembly in `compute-outer-readiness`, validators, the deterministic fallback, caching and the awaiting contract.

**Where the knowledge graph is and isn't used** — which signals actually reach generation, which arrive as flat facts with no inference, and which (insights patterns, causality findings, practice effectiveness, week-over-week movement) are read but under-exploited or arrive too late in the pipeline to shape the narrative.

**The structural findings** — analysis vs generation boundary; rule evaluation as independent booleans with no cross-rule correlation; the LLM receiving a flat flag list rather than a ranked causal story; deterministic and LLM paths deriving narrative separately.

**Recommendation** — a single pre-computed inference result (lead cause, supporting evidence, consequence, horizon) built once from the behaviour snapshot + signal matrix + JIT selection, consumed identically by the LLM prompt and the deterministic renderer, so the LLM only handles phrasing.

**Step-by-step evolution** — sequenced, additive, pre-launch-safe: shadow-mode comparison before any cut-over; each step with scope, risk and rollback; no rewrite of the existing pipeline.

---

## Technical notes

- Changed: `_shared/brief/deterministic-brief.ts` (family routing + copy), `_shared/personas/ceo/behaviour-copy.ts` (new family entries), `compute-outer-readiness/index.ts` (persist lead event on `daily_context_snapshot`, parity guard, family keys into the LLM prompt block), `src/constants/briefPromptVersion.ts` + `_shared/brief-prompt-version.ts` (bump).
- Reused as-is: `_shared/jit/select-jit.ts` (Plan ranking unchanged), `buildBehaviourSnapshot`, `_shared/events/*` resolver + subtypes, `time-phrase.ts`, `copy-vocabulary.ts`.
- No new `_shared` abstraction layer; family copy extends the existing copy pack.
- Part 2 produces a markdown document only.
