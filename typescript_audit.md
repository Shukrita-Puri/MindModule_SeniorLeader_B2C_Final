# Shared-Modules Delegation Audit

**Scope:** Brief (`compute-outer-readiness`), Plan (`generate-mastery-plan`), Nudges (`smart-nudges`) — do the edge functions, LLM prompts and copy actually delegate to the shared CEO modules, or are they still running legacy in-file logic?

**References cross-walked against the code**
- `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md`
- `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md`
- `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md`
- `Decision_Readiness_Brief_LLM_Prompt_v2.docx`
- `CEO_Self_Regulation_Framework_1-3.pages` (uploaded) — §2 protocol combos, §3 event categories A–H, §4 pre / during / post, §5 behaviour logic

**Method.** Primary‑source `rg` against every consumer for every shared symbol, plus targeted reads of the `userPrompt` builders. Findings are file:line citations, not paraphrase.

**Deliverable.** Audit only. No code, prompt, taxonomy or migration changes proposed below are applied.

---

## 1. Executive verdict

| Feature | Verdict | Headline |
|---|---|---|
| **Brief** (`compute-outer-readiness/index.ts`) | ⚠️ **Partial — legacy-dominant** | Pulls in `evaluateForScope("brief").promptBlock` and `selectLeadEvent`, but the ~400-line `userPrompt` (lines ~3306–3700) hand-builds every state/event/copy block. It **does not** import `EVENT_CATEGORIES`, `EVENT_PHASE_MAP`, `PROTOCOL_COMBOS`, `classifyEvent`, or `copy-vocabulary`. The §3/§4 event-coaching block prescribed by the CEO framework and by `Decision_Readiness_Brief_LLM_Prompt_v2.docx` is missing from the Brief LLM input. |
| **Plan** (`generate-mastery-plan/index.ts`) | ⚠️ **Wired but shadowed** | Imports every relevant shared module (`EVENT_CATEGORIES`, `EVENT_PHASE_MAP`, `PROTOCOL_COMBOS`, `classifyEvent`, `selectJitCandidates`, `applySlotBoostsToMapping`, `buildActionFrame`, `generateWhyStatement`, `evaluateForScope`). But the slot-resolution region (lines ~4220–4930) still computes its own phase, its own combo, its own copy and its own anchor dedupe in parallel. Dedupe is `contentId`-only, not `(eventId, phase)` — root cause of the "same event twice" bug. |
| **Nudges** (`smart-nudges/index.ts`) | ⚠️ **Partial** | Consumes `briefBehaviour.promptBlockBrief`, `EVENT_PHASE_MAP`, `PROTOCOL_COMBOS` and `classifyByLegacyTable`. But the per-nudge-type `userPrompt` library (lines ~1273–1597) **hand-authors the framing for every nudge type**; the shared CEO behaviour block is appended *after* the body has already been authored, so the LLM treats it as context, not as a brief. Static fallback copy (lines 1953+) is its own copy world. |

**Top five risks**

1. The Brief LLM never sees the §4 pre/during/post coaching block for the actual events on today's calendar. It infers them from raw titles in a free-text `=== CALENDAR TODAY ===` section.
2. Plan's `(eventId, phase)` dedupe gap lets the *same* meeting consume two priority slots with identical copy when the §4 phase resolver returns `pre` for both slots (root cause of "same event twice without pre/during/post distinction").
3. Brief, Plan and Nudges each derive "high-stakes" / "executive presence" / "decision leakage" framing through three different code paths even though `ceo-behaviour-rules` + `event-phase-map` is the single source of truth.
4. Plan still owns ~150 lines of phase / combo / category resolution that is general-purpose taxonomy logic — duplicated *de facto* with `event-phase-map.ts`.
5. Nudges' static-fallback copy library (~lines 1953–2200) is not validated against `PROTOCOL_COMBOS.whenToUse` / `outcome`, so it can drift from the framework as the doc evolves.

---

## 2. Delegation matrix

Legend: ✅ imported **and** drives output · ⚠️ imported but parallel legacy path also runs · ❌ not used (legacy in-file logic instead).

| Shared module | Brief | Plan | Nudges |
|---|---|---|---|
| `_shared/ceo-behaviour/**` (rules registry) | ✅ via `evaluateForScope("brief")` → `promptBlock` (`compute-outer-readiness/index.ts:7`) | ✅ via `evaluateForScope("plan")` + `applySlotBoostsToMapping` (`generate-mastery-plan/index.ts:15`) | ✅ via `evaluateForScope("nudge")` (`smart-nudges/index.ts:4`) |
| `_shared/behaviour-wiring.ts` (`evaluateForScope`, `applySlotBoostsToMapping`) | ✅ Brief scope only | ✅ Plan scope + slot boosts | ✅ Nudge scope |
| `_shared/load-brief-behaviour-snapshot.ts` (`promptBlockBrief` / `promptBlockPlan` / `taxonomyBlock`) | ✅ writes the snapshot | ✅ reads `promptBlockPlan` → fed to plan-context LLM call (`index.ts:4061`) | ✅ reads `promptBlockBrief` + `taxonomyBlock` and appends to nudge userPrompt (`smart-nudges:1531`) |
| `_shared/events/event-categories.ts` (`EVENT_CATEGORIES`, A–H + triggers) | ❌ not imported | ✅ imported (`generate-mastery-plan:38`) but used only for category lookup, not for triggers vocabulary | ❌ not imported |
| `_shared/events/event-classifier.ts` (`classifyEvent`) | ❌ not imported | ✅ `classifyEvent` + `isHighStakesTitle` (`index.ts:13, 39`) | ⚠️ only `classifyByLegacyTable` (`smart-nudges:566`) — legacy table, not the canonical classifier |
| `_shared/events/event-phase-map.ts` (`EVENT_PHASE_MAP`, `phaseForEvent`, `protocolsForEvent`, `CATEGORY_MAX_SLOTS`) | ❌ not imported | ⚠️ `EVENT_PHASE_MAP` + `CATEGORY_MAX_SLOTS` imported (`index.ts:46`) but `phaseForEvent` / `protocolsForEvent` are **not** the call path — Plan re-derives combo via its own `PRACTICE_TYPE_TO_COMBO` mirror at `index.ts:4363` | ✅ `EVENT_PHASE_MAP` (`smart-nudges:237`) for travel arc |
| `_shared/protocols/protocol-combos.ts` (`PROTOCOL_COMBOS`, `PRACTICE_TYPE_TO_COMBO`, `comboFor`) | ❌ not imported | ✅ imported and used inside slot resolver, but mirrored in a local map (see Finding F-12) | ✅ for travel-arc copy only |
| `_shared/jit/select-jit.ts` (`selectJitCandidates`) | ❌ n/a (Brief isn't a JIT consumer) | ✅ (`index.ts:64`) — single triangulated selector | ❌ Nudges runs its own first-touch / mid-day JIT scoring (`smart-nudges:1394, 1411`) |
| `_shared/jit/maturity-tier.ts`, `tactical-signals.ts`, `noise-filters.ts`, `goal-alignment.ts`, `relationship-weights.ts` | ❌ | ✅ (via `select-jit`) | ❌ |
| `_shared/plan/action-frame.ts` (`buildActionFrame`) | n/a | ✅ (`index.ts:58`) | n/a |
| `_shared/plan/why-llm.ts` (`generateWhyStatement`, `jaccard`) | n/a | ✅ (`index.ts:59`) | n/a |
| `_shared/plan/title-prefixes.ts` | n/a | ✅ | n/a |
| `_shared/executive-state-taxonomy.ts` (`selectLeadEvent`, copy vocabulary) | ✅ `selectLeadEvent` only (`outer-readiness:5`) | ✅ multiple imports (`index.ts:12`) | ✅ multiple imports (`smart-nudges:230`) |
| `_shared/copy-vocabulary.ts` (taxonomy copy primitives) | ❌ not imported — Brief still embeds its own copy bans in the system prompt | ❌ not imported | ❌ not imported |
| `_shared/brief-prompt-version.ts` (cache key) | ✅ canonical writer | ✅ disambiguates snapshot read (`index.ts:30, 2334`) | ✅ disambiguates snapshot read (`smart-nudges:14`) |
| `_shared/brief-validators.ts` (V8 contract) | ✅ on the Brief output | n/a | ✅ on the Nudge output (`smart-nudges:1117, 1657`) |
| `_shared/anthropic.ts` (`callClaudeText`, `callLovableAIText`, `CLAUDE_MODELS`) | ✅ | ✅ | ✅ |
| `_shared/auth.ts` | ✅ | ✅ | ✅ |
| `_shared/signal-engine/window-context.ts` + morning/afternoon/evening builders | ✅ (`outer-readiness` writes the snapshot) | ✅ reads `daily_context_snapshot` | ✅ reads `daily_context_snapshot` |

Raw evidence for every row is in **Appendix A**.

---

## 3. Per-feature audit

### 3.1 Brief — `compute-outer-readiness/index.ts`

**What it claims to do** (`PERFORMANCE_READINESS_BRIEF_LOGIC.md` + Brief LLM Prompt v2):
the LLM must receive, in order: `TIME`, `READINESS`, `WEARABLE`, `CALENDAR TODAY` (with §3 categories + §4 phases pre-stamped), `CALENDAR TOMORROW`, `COACH SIGNALS`, `ACTIVE CEO BEHAVIOURS`, and `EVENT COACHING CONTEXT` (per the framework `.pages` doc §4 and the v2 prompt doc).

**What the code actually does** (`compute-outer-readiness/index.ts:3306–3700`):

| Block in v2 prompt doc | Built by | Source of truth used? | Finding |
|---|---|---|---|
| `=== TIME ===` | Inline string builder (`:3519`) | Local timezone helpers only | OK |
| `=== READINESS ===` | Inline (`:3522–3529`) | local | OK |
| `=== WEARABLE ===` | Inline (`:3533–3548`) | local + `mem://features/wearable/hr-elevated-proxy-logic` | OK |
| `=== CALENDAR TODAY ===` | Inline (`:3553–3563`) | **Raw titles only** — no category, no §4 phase, no combo, no triggers vocabulary | **F-01 (S1)** |
| `=== CALENDAR TOMORROW ===` | Inline | Raw titles only | **F-02 (S2)** |
| `=== ACTIVE CEO BEHAVIOURS ===` | `behaviour-wiring.formatPromptBlock` (appended) | ✅ shared | OK |
| `=== EVENT COACHING CONTEXT ===` (from `.pages` doc §4) | **Not emitted** | n/a | **F-03 (S1)** |
| Decision-leakage / veto / post-peak / circadian rules | Appended via behaviours block | ✅ shared | OK |
| Copy bans ("calm down", "be present", etc.) | Embedded verbatim in the system prompt at `:3306` | ❌ duplicates `copy-vocabulary.ts` | **F-04 (S3)** |

**Verdict:** Brief uses the *behaviour* half of the shared layer but not the *event-taxonomy* half. The LLM is being asked to infer §3/§4 every turn from raw titles. This is the root reason that brief body copy reads generic (it has no `phaseForEvent` to ground it).

### 3.2 Plan — `generate-mastery-plan/index.ts`

**Imports (`index.ts:12–64`):** `selectLeadEvent`, `isHighStakesTitle`, `applySlotBoostsToMapping`, `evaluateForScope`, `EVENT_CATEGORIES`, `classifyEvent`, `EVENT_PHASE_MAP`, `CATEGORY_MAX_SLOTS`, `PROTOCOL_COMBOS`, `isTravelTitle`, `isPtoOrHolidayTitle`, `buildActionFrame`, `generateWhyStatement`, `selectJitCandidates`.

**Where the legacy path still wins:**

| Region | What it does | Should defer to | Finding |
|---|---|---|---|
| `:4220–4340` (`phase` resolver) | Computes `phase: Phase` from `nowMs` vs event start/end with its own thresholds, then *separately* looks up `EVENT_PHASE_MAP[id][phase]` | The canonical helper `phaseForEvent(title, phase, stakesLevel)` exists in `event-phase-map.ts:110` and returns `{...EventPhase, resolvedCombo}`. Plan does not call it. | **F-05 (S2)** |
| `:4363` (`Mirror of PRACTICE_TYPE_TO_COMBO`) | Plan keeps a local mirror map for legacy `practiceType → combo` | The single source of truth is exported from `protocol-combos.ts:62`. The comment even admits the mirror exists. | **F-06 (S2)** |
| `:4628`, `:4715` (slot 2 / slot 3 time labels) | Hand-built `'Prepare ahead of <title>'` / `'Recover from <title>'` strings | `EVENT_PHASE_MAP[id][phase].timing` + `.goal` already give the timing window and goal verbatim per the framework doc | **F-07 (S2)** |
| `:4775–4795` (dedupe) | `seenContentIds` dedupes on `contentId` only | Should be `(eventId, phase)` keyed; an event with no §4 `post` defined collapses both slots to `phase='pre'` → same title appears twice with identical copy | **F-08 (S1) — root cause of user-reported "same event twice"** |
| `:4061` (plan LLM context) | Appends `shared.briefBehaviour?.promptBlockPlan` once at the top | OK, but no `EVENT COACHING CONTEXT` block injected for the *plan-specific* §4 phase prescriptions | **F-09 (S2)** |
| `:1170`, `:1270` (event classification comments) | Comments say "single source of truth in event-classifier.ts" but two parallel keyword tables still live in Plan around the JIT path | Consolidate into `event-classifier.ts` / `event-subtypes.ts` | **F-10 (S3)** |

**Verdict:** Plan is the most-wired consumer, but the slot 2 / slot 3 builder still constructs the user-visible "Prepare ahead of …" / "Recover from …" sentences without grounding them in `EVENT_PHASE_MAP[*].goal` / `.preventsBuilds`, so two slots that legitimately point at the same event with different §4 phases lose their phase distinction at render time even when the resolver got it right.

### 3.3 Nudges — `smart-nudges/index.ts`

**Imports:** `evaluateForScope`, `BRIEF_PROMPT_VERSION`, `EVENT_PHASE_MAP`, `PROTOCOL_COMBOS`, `isTravelTitle`, `classifyByLegacyTable as classifyEventForPattern`.

**Where the legacy path still wins:**

| Region | What it does | Should defer to | Finding |
|---|---|---|---|
| `:1273` (system prompt) | "You are the Chief of Staff for the Mind of a C-suite leader..." authored inline | Shared system-prompt fragment would let Brief + Nudges share voice | **F-11 (S3)** |
| `:1362–1497` (per-nudge-type `userPrompt` library) | Hand-authored framing per nudge type: morning, JIT first-touch, mid-day JIT, mid-day plan, state-aware recalibration, reserves-down, evening | Should request the §4 phase prescription for the anchor event and let the shared block drive the framing | **F-12 (S2)** |
| `:1531` (snapshot append) | `userPrompt += ctx.briefBehaviour.taxonomyBlock` / `.promptBlockBrief` is appended **after** the per-type framing | Should be prepended or interleaved per nudge type | **F-13 (S3)** |
| `:566` (`classifyByLegacyTable`) | Uses the **legacy** classifier table | Should use canonical `classifyEvent` (the codebase has marked the legacy table for retirement in the file header) | **F-14 (S2)** |
| `:1953–2200` (static fallback library) | Hard-coded copy variants for travel arc / look-ahead | Validate each variant against `PROTOCOL_COMBOS[*].outcome` (currently V8 lint only, not framework-conformance lint) | **F-15 (S3)** |
| `:1394, 1411` (JIT first-touch / mid-day JIT) | Selects + scores its own anchor event | Should reuse `selectJitCandidates` (already used by Plan) | **F-16 (S2)** |

**Verdict:** Nudges reads the *Brief* snapshot well, but its own LLM prompts have a parallel framing library and a parallel classifier. Same-event-twice doesn't occur in Nudges (cron throttling protects it) but copy drift across Brief / Plan / Nudges originates here.

---

## 4. LLM prompt cross-walk vs `Decision_Readiness_Brief_LLM_Prompt_v2.docx`

| v2 prompt block | Code path | Shared module that should populate it | Status |
|---|---|---|---|
| Persona ("Chief of Staff for the Mind...") | `compute-outer-readiness:3306` | Could move to a shared persona constant if Nudges adopts (see F-11) | OK in Brief, duplicated in Nudges |
| `=== TIME ===` | inline `:3519` | n/a (local) | OK |
| `=== READINESS ===` | inline `:3522` | n/a (local — scoring lives in `compute-inner-readiness`) | OK |
| `=== WEARABLE ===` | inline `:3533` | n/a | OK |
| `=== CALENDAR TODAY ===` w/ §3 category labels | inline raw titles `:3553` | `event-classifier.classifyEvent` + `EVENT_CATEGORIES[id].name` | **Missing** (F-01) |
| `=== CALENDAR TODAY ===` w/ §4 phase + combo per anchor event | not emitted | `phaseForEvent(title, phase, stakesLevel)` returns `{timing, combo, goal, preventsBuilds, resolvedCombo}` | **Missing** (F-03) |
| `=== COACH SIGNALS ===` | inline | shared snapshot already feeds it | OK |
| `=== ACTIVE CEO BEHAVIOURS ===` | `behaviour-wiring.formatPromptBlock` | ✅ shared | OK |
| `=== EVENT COACHING CONTEXT ===` (per `.pages` doc §4) | not emitted | New helper `buildEventCoachingBlock(events)` referenced in the `.pages` doc Part 1 — not yet authored | **Missing** (F-03, F-09) |
| Copy bans / vocabulary lints | inline persona `:3306` | `copy-vocabulary.ts` | Drift risk (F-04) |

---

## 5. Event taxonomy & §4 pre/during/post coverage

Cross-walking `CEO_Self_Regulation_Framework_1-3.pages` §3 (categories A–H) and §4 (per-category phases) against the code:

| Cat | `EVENT_CATEGORIES.triggers[]` covers doc? | `EVENT_PHASE_MAP[cat]` covers doc phases? | Notes |
|---|---|---|---|
| A High-Stakes Governance | ✅ | ✅ pre + post (no during, per doc) | Aligned |
| B Influence & Persuasion | ✅ | ✅ pre + post | Aligned |
| C Visibility & Communication | ✅ | ✅ pre + post | Aligned |
| D People & Difficult Convos | ✅ | ✅ pre + post | Aligned |
| E Deep Work & Strategy | ✅ | ✅ pre + during + post | Aligned |
| F Conferences | ✅ | ✅ pre + during (notification-only) + post | `duringNotificationOnly` flag respected by `event-categories.ts` but not surfaced to Plan slot resolver — **F-17 (S2)** |
| G Travel | ✅ | ✅ pre + during + post (full arc) | Aligned; Nudges uses this — Plan does not consume `during` |
| H Daily Rhythm | ✅ | ⚠️ only `during` defined (`event-phase-map:62`) — `.pages` doc spec is sparse here | Acceptable per spec |

No category is missing from the shared taxonomy. The gap is *consumption*, not *definition*.

---

## 6. Root cause: "same event appears twice in Plan with no pre/during/post distinction"

Trace:

1. `:4247` `phase: Phase = 'pre'` (default) is recomputed by Plan's own resolver based on `nowMs`. Result is correct for the *first* anchor but isn't reconciled against `phaseAlreadyAnchored(id, phase)`.
2. `:4337` `slotAnchors: { eventId, phase }[]` is collected.
3. `:4343` `phaseAlreadyAnchored(id, phase)` exists but is only consulted inside the per-slot builder — it does **not** prevent slot 2 and slot 3 from both resolving to `(eventId='X', phase='pre')` when category C/B/H has no `post` row in `EVENT_PHASE_MAP` and Plan still wants to fill 3 slots.
4. `:4775` dedupe loop is keyed on `m.practice.contentId` (the *practice* content), not on `(eventId, phase)`. When two slots pull *different* practices for the same event/phase, both survive.
5. `:4628` / `:4715` build the time labels (`'Prepare ahead of <title>'`) from the event title only — so even when the slot-2 anchor genuinely is `pre` and slot-3 is `post`, the user-visible copy degenerates to "Prepare ahead of Board Call" / "Prepare ahead of Board Call" if the phase resolver fell back.

**Recommended fix (audit-only, not implemented):** add `(eventId, phase)` to the dedupe key at `:4775` and route the slot-label builder through `phaseForEvent(...).timing + .goal` so every slot is forced to declare its §4 phase or be dropped. Also respect `CATEGORY_MAX_SLOTS[cat]` (already imported, not enforced) before allowing a second slot for the same event.

---

## 7. Plan-only logic that should move out of `generate-mastery-plan`

| Region | Current line | What it is | Proposed home | Why |
|---|---|---|---|---|
| Phase resolver (`nowMs` → `pre|during|post`) | `:4247` | Pure event-time math, no plan state | `_shared/events/event-phase-map.ts` (new `phaseAtTime(event, nowMs)`) | Nudges already needs this for JIT first-touch — currently duplicates |
| `PRACTICE_TYPE_TO_COMBO` mirror | `:4363` | Local copy of the canonical map | Delete; import from `_shared/protocols/protocol-combos.ts:62` | SSOT enforcement |
| Slot-label composer (`'Prepare ahead of …'`) | `:4628`, `:4715` | Phase-aware copy fragment | `_shared/plan/title-prefixes.ts` (already exists — extend) | Reusable by Nudges' JIT first-touch copy |
| `classifyEvent` keyword tables | `:1170`, `:1270` (legacy comments) | Title → category | `_shared/events/event-classifier.ts` (already canonical — collapse remaining call sites) | One classifier, not three |
| `isHighStakesPost` heuristic | `:4281`, `:4627`, `:4714` | `phase === 'post' && (cat==='A'||cat==='D')` | `event-phase-map.ts` (`isHighStakesPost(phase, cat)`) | Brief + Nudges also reason about this |
| `dedupeBy (eventId, phase)` (proposed) | new | Slot anchor dedupe | `_shared/plan/` (Plan-only) | Stays in plan |

## 8. Plan-only logic that should stay

| Region | Why it's plan-only |
|---|---|
| Minimum-slot habit rule (weekday=2, weekend=1, PTO=1) | Plan-render-only contract |
| Slot-3-of-3 filler pass | Plan-render-only |
| JIT exclusion ledger to prevent double-booking | Plan owns the queue |
| Foundational / maturity tier mix | Plan owns the slot weighting |
| Mastery completion ledger + per-priority queue contract | Plan-render-only, governed by `mem://features/mastery-plan/per-priority-queue-contract` |

---

## 9. Shared edge utilities check

| Utility | Brief | Plan | Nudges | Finding |
|---|---|---|---|---|
| `_shared/auth.ts` | ✅ | ✅ | ✅ | OK |
| `_shared/anthropic.ts` (`callClaudeText`, `callLovableAIText`, `CLAUDE_MODELS`) | ✅ | ✅ | ✅ | OK — provider resilience via `mem://architecture/llm-provider-resilience-strategy` |
| `_shared/brief-prompt-version.ts` | ✅ | ✅ | ✅ | OK — snapshot disambiguation honored everywhere |
| `_shared/brief-validators.ts` (V8 contract) | ✅ | n/a | ✅ | OK |
| `_shared/brief-signal-coverage.ts` | ✅ | ✅ (via wiring) | ✅ (via wiring) | OK |
| `_shared/brief-context.ts` (RuleContext types) | ✅ | ✅ | ✅ | OK |
| `_shared/copy-vocabulary.ts` | ❌ | ❌ | ❌ | **F-04 / F-15 — not imported anywhere; copy bans live as string literals in three different prompts** |
| `_shared/signal-engine/build-daily-context.ts` | ✅ (writer) | ✅ (reader) | ✅ (reader) | OK — `mem://architecture/signal-engine/build-daily-context-orchestrator` |

No private `callClaude` / `verifyJwt` clones found in any consumer. ✅

---

## 10. Findings register

| ID | Sev | Feature | File:line | Finding | Recommended remediation (contract-level) |
|---|---|---|---|---|---|
| F-01 | S1 | Brief | `compute-outer-readiness/index.ts:3553` | `=== CALENDAR TODAY ===` emits raw titles only | Inject `EVENT_CATEGORIES[classifyEvent(t).categoryId].name` next to each title |
| F-02 | S2 | Brief | `compute-outer-readiness/index.ts:~3580` | Same for tomorrow | Same |
| F-03 | S1 | Brief | `compute-outer-readiness/index.ts:3306–3700` | No `=== EVENT COACHING CONTEXT ===` block | Add `buildEventCoachingBlock(events)` (per `.pages` doc Part 1) sourced from `phaseForEvent(...)` |
| F-04 | S3 | Brief | `compute-outer-readiness/index.ts:3306` | Copy bans embedded in system prompt | Import lints from `copy-vocabulary.ts`; lint at write-time, not in-prompt |
| F-05 | S2 | Plan | `generate-mastery-plan/index.ts:4220–4340` | Local phase resolver | Call `phaseForEvent(...)` (already exported) |
| F-06 | S2 | Plan | `generate-mastery-plan/index.ts:4363` | `PRACTICE_TYPE_TO_COMBO` local mirror | Delete mirror, import canonical |
| F-07 | S2 | Plan | `generate-mastery-plan/index.ts:4628, 4715` | Slot-label string built from title only | Compose from `EVENT_PHASE_MAP[id][phase].timing + .goal` |
| F-08 | S1 | Plan | `generate-mastery-plan/index.ts:4775–4795` | Dedupe keyed on `contentId` only — same event can occupy 2 slots | Add `(eventId, phase)` key; enforce `CATEGORY_MAX_SLOTS[cat]` |
| F-09 | S2 | Plan | `generate-mastery-plan/index.ts:4061` | Plan LLM call gets behaviour block but no §4 event-coaching block | Inject `EVENT COACHING CONTEXT` for each anchor event |
| F-10 | S3 | Plan | `generate-mastery-plan/index.ts:1170, 1270` | Comments claim single SoT but parallel keyword tables remain | Collapse remaining tables into `event-classifier.ts` |
| F-11 | S3 | Nudges + Brief | `smart-nudges/index.ts:1273` + `compute-outer-readiness:3306` | Persona authored twice | Extract to `_shared/personas/cos-mind.ts` |
| F-12 | S2 | Nudges | `smart-nudges/index.ts:1362–1497` | Per-nudge-type framing library hand-authored | Request §4 phase prescription per anchor event; let the shared block carry the framing |
| F-13 | S3 | Nudges | `smart-nudges/index.ts:1531` | Snapshot block appended *after* framing | Prepend or interleave |
| F-14 | S2 | Nudges | `smart-nudges/index.ts:566` | Uses `classifyByLegacyTable`, not canonical `classifyEvent` | Switch to canonical |
| F-15 | S3 | Nudges | `smart-nudges/index.ts:1953–2200` | Static fallback copy not framework-lint-validated | Add `whenToUse` / `outcome` conformance check at fallback registration |
| F-16 | S2 | Nudges | `smart-nudges/index.ts:1394, 1411` | Own JIT first-touch / mid-day JIT scorer | Reuse `selectJitCandidates` |
| F-17 | S2 | Plan | `generate-mastery-plan/index.ts:4220+` | `EVENT_PHASE_MAP.F.during.duringNotificationOnly` not respected — Plan can schedule a slot for F-during | Drop slots whose `phase.combo` carries `duringNotificationOnly`; let Nudges own them |

---

## 11. Recommended remediation roadmap (no implementation in this audit)

**Wave 1 — Plan dedupe + §4 phase enforcement (closes user bug)**
- F-05, F-07, F-08, F-17. Atomic change inside Plan slot resolver. No prompt-engineering risk. Closes the "same event twice" bug and lands phase-aware copy in the same change.

**Wave 2 — Brief gets §3/§4 in the prompt**
- F-01, F-02, F-03, F-09. Land `buildEventCoachingBlock(events)` once in `behaviour-wiring.ts`; Brief consumes it via `promptBlockBrief`; Plan consumes via `promptBlockPlan`. Bump `BRIEF_PROMPT_VERSION` to invalidate caches.

**Wave 3 — Nudges copy delegation + classifier collapse**
- F-11, F-12, F-13, F-14, F-16. Move persona to shared, switch nudges to canonical classifier + `selectJitCandidates`, restructure the userPrompt assembly so the shared block frames the body, not garnishes it.

**Wave 4 — Copy-vocabulary lint (low-risk hardening)**
- F-04, F-06, F-10, F-15. Cleanup pass; mostly deletions.

---

## Appendix A — grep evidence

```
# Plan: imports
generate-mastery-plan/index.ts:12  selectLeadEvent (executive-state-taxonomy)
generate-mastery-plan/index.ts:13  isHighStakesTitle (event-classifier)
generate-mastery-plan/index.ts:15  applySlotBoostsToMapping, evaluateForScope (behaviour-wiring)
generate-mastery-plan/index.ts:38  EVENT_CATEGORIES (event-categories)
generate-mastery-plan/index.ts:39  classifyEvent (event-classifier)
generate-mastery-plan/index.ts:46  EVENT_PHASE_MAP, CATEGORY_MAX_SLOTS (event-phase-map)
generate-mastery-plan/index.ts:51  PROTOCOL_COMBOS, ComboKey (protocol-combos)
generate-mastery-plan/index.ts:52  isTravelTitle (ceo-behaviour/travel)
generate-mastery-plan/index.ts:53  isPtoOrHolidayTitle (ceo-behaviour/pto-holiday)
generate-mastery-plan/index.ts:58  buildActionFrame (plan/action-frame)
generate-mastery-plan/index.ts:59  generateWhyStatement, jaccard (plan/why-llm)
generate-mastery-plan/index.ts:64  selectJitCandidates (jit/select-jit)

# Brief: imports
compute-outer-readiness/index.ts:5  selectLeadEvent (executive-state-taxonomy)
compute-outer-readiness/index.ts:7  evaluateForScope (behaviour-wiring)
# No imports of event-categories / event-phase-map / event-classifier / protocol-combos / select-jit / copy-vocabulary

# Nudges: imports
smart-nudges/index.ts:4    evaluateForScope (behaviour-wiring)
smart-nudges/index.ts:14   BRIEF_PROMPT_VERSION
smart-nudges/index.ts:230  multiple from executive-state-taxonomy
smart-nudges/index.ts:236  isTravelTitle (ceo-behaviour/travel)
smart-nudges/index.ts:237  EVENT_PHASE_MAP (event-phase-map)
smart-nudges/index.ts:238  PROTOCOL_COMBOS (protocols/protocol-combos)
smart-nudges/index.ts:566  classifyByLegacyTable AS classifyEventForPattern (LEGACY)
# No imports of select-jit / event-categories / classifyEvent (canonical)

# Plan: dedupe loop (root-cause region)
generate-mastery-plan/index.ts:4775  const seenContentIds = new Set<string>();
generate-mastery-plan/index.ts:4781  if (!seenContentIds.has(m.practice.contentId)) {
# No (eventId, phase) check.

# Plan: phase resolver (legacy)
generate-mastery-plan/index.ts:4247  let phase: Phase = 'pre';
generate-mastery-plan/index.ts:4249  if (nowMs >= eventEndMs) phase = 'post';
generate-mastery-plan/index.ts:4254  phase = (nowMs - eventStartMs) > 60 * 60_000 ? 'post' : 'during';
# event-phase-map.ts:110 exports phaseForEvent() — not called from Plan.
```

## Appendix B — file index

| File | Role |
|---|---|
| `supabase/functions/compute-outer-readiness/index.ts` | Brief edge function + LLM prompt builder |
| `supabase/functions/generate-mastery-plan/index.ts` | Plan edge function + slot resolver + LLM context builder |
| `supabase/functions/smart-nudges/index.ts` | Nudges scheduler + per-type LLM prompt library + static fallback |
| `supabase/functions/_shared/behaviour-wiring.ts` | Adapter: scope → `{flags, slotBoosts, promptBlock}` |
| `supabase/functions/_shared/behaviour-evaluator.ts` | Pure rule evaluator over `RuleContext` |
| `supabase/functions/_shared/ceo-behaviour/*` | §2.11–§2.17 rules + new nuances (travel, conference, back-to-back, etc.) |
| `supabase/functions/_shared/events/event-categories.ts` | §3 categories A–H + triggers (SSOT) |
| `supabase/functions/_shared/events/event-classifier.ts` | Canonical title → category resolver |
| `supabase/functions/_shared/events/event-phase-map.ts` | §4 pre/during/post per category, plus `phaseForEvent` / `protocolsForEvent` / `CATEGORY_MAX_SLOTS` |
| `supabase/functions/_shared/events/event-subtypes.ts` | Granular subtypes referencing `categoryId` |
| `supabase/functions/_shared/protocols/protocol-combos.ts` | §2 six combos + `PRACTICE_TYPE_TO_COMBO` SSOT |
| `supabase/functions/_shared/jit/select-jit.ts` | JIT v2 triangulated selector |
| `supabase/functions/_shared/plan/action-frame.ts` | Plan action-frame helper |
| `supabase/functions/_shared/plan/why-llm.ts` | Plan "Why" deterministic + LLM generator |
| `supabase/functions/_shared/plan/title-prefixes.ts` | Plan title-prefix vocabulary |
| `supabase/functions/_shared/executive-state-taxonomy.ts` | `selectLeadEvent` + state vocabulary |
| `supabase/functions/_shared/copy-vocabulary.ts` | Copy bans / phrase lints (not currently consumed) |
| `supabase/functions/_shared/load-brief-behaviour-snapshot.ts` | Snapshot reader (`promptBlockBrief`, `promptBlockPlan`, `taxonomyBlock`) |
| `supabase/functions/_shared/brief-prompt-version.ts` | Cache disambiguator |
| `supabase/functions/_shared/anthropic.ts` | LLM provider resilience |
| `supabase/functions/_shared/signal-engine/*` | Window-context + daily-context-snapshot orchestrator |

— end of audit —