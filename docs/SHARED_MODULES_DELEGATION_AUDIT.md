# Shared Modules Delegation Audit

**Scope:** Brief (`compute-outer-readiness`), Plan (`generate-mastery-plan`), Nudges (`smart-nudges`) vs. the `_shared/` source-of-truth modules (CEO behaviour, event taxonomy + classification, protocol combos, JIT v2, plan helpers, brief utilities).

**Update (June 3, 2026) — shared-module landing status:**

| # | Status | Resolution notes |
|---|--------|------------------|
| F-01 | 🟡 Partial | Brief now appends shared event-coaching blocks built from `classifyEvent` + `phaseForEvent`, so the LLM sees category / phase / combo context for today and tomorrow events. The remaining gap is replacing the larger inline coverage accumulator with the shared builder. |
| F-02 | ✅ Resolved | `briefBehaviour.promptBlockBrief` + `taxonomyBlock` already appended to `userPrompt` (`compute-outer-readiness/index.ts` § "SHARED-MODULE CONTEXT"). |
| F-03 | ✅ Resolved | Cross-slot dedupe now keyed on `eventId` (loose title fallback) + `jitPhase`, respecting `CATEGORY_MAX_SLOTS` (`generate-mastery-plan/index.ts:3219–3330`). |
| F-04 | ✅ Resolved | The same dedupe pass runs after slot 2/3 fillers, ledger merge, and the per-slot replacement override — phase-dup or cap-exceeded triggers a fresh-alternative pick or strips JIT framing. |
| F-07 | ✅ Resolved | Persona, voice banks, hard constraints, priority order, silent reasoning, four-beat body contract, worked examples, and JSON output schema extracted to `supabase/functions/_shared/brief/copy-vocabulary.ts` and consumed via `buildBriefSystemPrompt()`. The legacy inline system prompt is parked as an unused `_legacyInlineSystemPrompt` for diff-bisection only — drift-protection: all future persona changes land in `copy-vocabulary.ts`. |
| F-08 | ✅ Resolved | Nudges now read their forbidden-copy vocabulary from `supabase/functions/_shared/brief/copy-vocabulary.ts` instead of maintaining a separate local blacklist constant. |
| F-06 | ✅ Resolved | Nudges now short-circuit JIT candidates whose shared category protocol sets `duringNotificationOnly === true`, matching Plan's long-meeting/conference guardrail. |
| F-13 | ✅ Resolved | Plan now validates slot-boost practice mappings against the shared protocol combos before applying boosts, dropping invalid combinations with a warning instead of silently no-oping. |
| F-12 | 🟡 Partial | `=== TIME ===` block renamed to canonical `=== CONTEXT: [MORNING\|AFTERNOON\|EVENING] ===` per §8. Full `buildSignalCoverage` replacement of the 200-line accumulator is deferred to a follow-up to keep this change set low-risk. |
| F-15 | ✅ Resolved | Nudges now prepend the shared behaviour/taxonomy block before nudge-specific framing, so truncation no longer drops the rule layer first. |

The remainder of the findings (F-05, F-09–F-11, F-14, F-16) remain open. The shared prompt + event-coaching boundary now exists; the main Brief follow-up is swapping the remaining inline accumulator for the shared signal-coverage builder.

**Reference docs cross-walked:** `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md`, `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md`, `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md`, `Decision_Readiness_Brief_LLM_Prompt_v2.docx`, `CEO_Self_Regulation_Framework_v1.0` (§2 protocols / §3 categories / §4 phases / §5 behaviour).

**Method:** primary-evidence grep on `supabase/functions/{compute-outer-readiness,generate-mastery-plan,smart-nudges}/index.ts` plus the `_shared/` modules. Every finding carries a `file:line` citation. This audit update is documentation-only; the code changes referenced in the June 3 status block landed before this document refresh.

---

## 0. AT-A-GLANCE FINDINGS SUMMARY

| # | Severity | Feature | Root cause (one line) | Fix at contract level |
|---|----------|---------|------------------------|------------------------|
| F-01 | S1 | Brief | Partial June 3: Brief now appends `=== TODAY EVENT COACHING ===` / `=== TOMORROW EVENT COACHING ===` blocks built from `classifyEvent` + `phaseForEvent`, so lead events are no longer title-only. The remaining gap is replacing the broader inline coverage builder with the shared signal-coverage module. | Keep the shared event-coaching blocks and follow up by migrating the rest of the inline prompt coverage to `_shared/brief-signal-coverage.ts`. |
| F-02 | S1 | Brief | Resolved June 3: `briefBehaviourSnapshot.taxonomyBlock` + `promptBlockBrief` are now appended to the brief `userPrompt` (`compute-outer-readiness/index.ts:3884–3888`). | Shipped. Keep future behaviour-rule changes in the shared snapshot contract, not inline prompt prose. |
| F-03 | S1 | Plan | Resolved June 3: final cross-slot dedupe now preserves the first valid anchor, keys event reuse by resolved `eventId`, respects `CATEGORY_MAX_SLOTS`, and prevents duplicate `jitPhase` reuse (`generate-mastery-plan/index.ts:3219–3330`). | Shipped. Regression risk remains only if future slot assembly bypasses the final dedupe pass. |
| F-04 | S1 | Plan | Resolved June 3: the same dedupe guard now runs after slot fillers, ledger merge, and per-slot replacements, replacing duplicates with a fresh alternative or stripping JIT framing when needed (`generate-mastery-plan/index.ts:3219–3330`). | Shipped. Keep any new slot-override logic behind the same final dedupe contract. |
| F-05 | S1 | Nudges | Partial June 3: pattern-store readers/writers now resolve bucket labels through `classifyPatternBucket()`, which uses canonical subtypes first and only falls back to the historical keyword table when no subtype mapping exists. The remaining gap is retiring the old bucket label contract entirely. | Keep `classifyPatternBucket()` as the compatibility layer for `signal_summary`, then migrate the persisted store off legacy bucket names. |
| F-06 | S1 | Plan | Resolved June 3: Nudges now short-circuit JIT candidates when `EVENT_CATEGORIES[cat].protocol.duringNotificationOnly === true`, matching Plan's conference/long-meeting suppression contract. | Shipped. Preserve the shared category guard for any future JIT entry point. |
| F-07 | S2 | Brief | Resolved June 3: persona, voice banks, hard constraints, worked examples, and JSON schema now live in `_shared/brief/copy-vocabulary.ts` and are consumed via `buildBriefSystemPrompt()` (`compute-outer-readiness/index.ts:3317`). | Shipped. Remove the parked legacy prompt literal after production release confirms prompt parity. |
| F-08 | S2 | Nudges | Resolved June 3: Nudges now source their forbidden-notification vocabulary from `_shared/brief/copy-vocabulary.ts` instead of maintaining a separate local blacklist block. | Shipped. Keep any new banned phrases in the shared vocabulary module. |
| F-09 | S2 | Plan | `phaseForEvent` / `EVENT_PHASE_MAP` is imported (`:46`) but `composeStateLabel` still re-derives phase from raw start-time arithmetic instead of `EVENT_PHASE_MAP[cat][phase].timing`. | Delegate timing labels to `EVENT_PHASE_MAP` and only re-compute when phase-map returns `null`. |
| F-10 | S2 | Plan | `PRACTICE_TYPE_TO_COMBO` mirror exists implicitly in `buildRecommendedAction`; shared version lives at `protocols/protocol-combos.ts`. Two sources can drift. | Re-export from `_shared/protocols/protocol-combos.ts` and delete the local mapping. |
| F-11 | S2 | Nudges | Per-nudge `userPrompt` framing strings (`:1373 / :1394 / :1411 / :1426 / :1441 / :1460 / :1489`) are hand-authored and do not consume the new `actionFrame` / `whyLLM` shared helpers that Plan already uses. | Build framing from `_shared/plan/action-frame.ts` + `_shared/plan/why-llm.ts`, parameterised by `nudgeType`. |
| F-12 | S2 | Brief | Partial June 3: the canonical `=== CONTEXT: [MORNING|AFTERNOON|EVENING] ===` header and `PRE_COMPUTED_USER_NOTICE` landed, but the large inline `userPrompt += …` accumulator is still in place instead of delegating to `buildSignalCoverage` (`compute-outer-readiness/index.ts:3539–3888`). | Follow up by replacing the remaining accumulator with `_shared/brief-signal-coverage.ts` so block ordering and omission rules live in one helper. |
| F-13 | S3 | Plan | Resolved June 3: slot boosts are now validated against shared protocol combos before application, and invalid boost mappings are dropped with a warning instead of silently no-oping. | Shipped. Keep slot-boost validation tied to `PRACTICE_TYPE_TO_COMBO` + `PROTOCOL_COMBOS`. |
| F-14 | S3 | Brief | `selectLeadEvent` is the only event-taxonomy import (`:5`); JIT lead-time logic (`event-subtypes.jitLeadTime`) is never consulted when picking which event to mention. | Pass `jitLeadTime` from subtype into the lead-event scoring weights. |
| F-15 | S3 | Nudges | Resolved June 3: shared behaviour/taxonomy wiring is now prepended before the nudge-specific framing block, so truncation no longer strips the rule layer first. | Shipped. Preserve this ordering for any future nudge prompt variants. |
| F-16 | S3 | Plan | Partial June 3: static `MIN_SLOTS_FALLBACK` filler still does not persist the full shared event object, but anchored slots now persist a shared anchor snapshot (`anchorEventId`, `anchorCategoryId`, `anchorSubtypeId`, `anchorScenarioId`, `anchorLeadTimeMin`) and register that anchor in the same slot-anchor ledger as the main slots. The remaining gap is persisting fuller `enrichEvent` metadata beyond this anchor snapshot. | Keep slot-level anchor snapshots persisted, then run the fallback path through fuller `enrichEvent` metadata before persisting snapshot/context data. |
| F-17 | S3 | All three | `BRIEF_PROMPT_VERSION` is imported by all three consumers but only Brief stamps it on output (`:13` / `:30` / `:14`). Nudges + Plan stamp their own `architecture` field instead → cross-feature version skew. | Stamp `BRIEF_PROMPT_VERSION` on every LLM-produced artefact for cross-feature trace. |

**Top five open risks (read first):**
1. Brief now has event-coaching blocks, but the broader signal-coverage prompt assembly is still inline and order-sensitive until it moves to the shared builder (F-01 / F-12).
2. Pattern-store compatibility still depends on historical bucket labels even though classification now resolves from canonical subtypes first (F-05).
3. Plan still carries local timing/mapping helpers and a legacy bridge, and its filler path is only partially shared-enriched, so the shared-module architecture is not yet fully consolidated there (F-09 / F-10 / F-16).
4. Brief prompt assembly is still large and order-sensitive, so truncation / omission risk remains until signal coverage is delegated to the shared helper (F-12).
5. Nudges still uses hand-authored framing instead of the shared action-frame / why-llm helpers, so copy logic can still drift from Plan (F-11).

**Remediation waves** (dependency-ordered, no implementation here):
- **Wave 1 — Brief event enrichment + signal coverage:** F-01, F-12, F-14. Adds the shared event-coaching and block-assembly helpers still missing from Brief.
- **Wave 2 — Nudges classifier + framing consolidation:** F-05, F-11. Finish the compatibility-layer cleanup and route per-nudge framing through the shared helpers.
- **Wave 3 — Plan bridge cleanup + observability:** F-09, F-10, F-16, F-17. Finishes the remaining shared-plan consolidation and traceability work.

---

## 1. Executive Summary

| Feature | Verdict | One-sentence rationale |
|---------|---------|------------------------|
| Brief (`compute-outer-readiness`) | **Hybrid, moving toward shared-led** | Shared prompt vocabulary, behaviour blocks, canonical context header, window-context, and event-coaching blocks are now wired in, but the brief still assembles signal coverage inline. |
| Plan (`generate-mastery-plan`) | **Shared-led with targeted legacy edges** | Shared snapshot loading, shared ranked-candidate top-event selection, and final event dedupe are now wired correctly, but some timing / mapping helpers are still local and should move behind shared contracts. |
| Nudges (`smart-nudges`) | **Partial** | Consumes shared behaviour/taxonomy wiring ahead of framing, sources its forbidden-copy list from the shared vocabulary module, resolves pattern buckets from canonical subtypes first, and now suppresses notification-only JIT categories, but still uses hand-authored per-nudge framing. |

The "same event appears twice in Plan" bug was the primary reproduction behind F-03 / F-04. As of the June 3 landing, the final cross-slot dedupe pass now resolves duplicates by `eventId` + `jitPhase`, respects `CATEGORY_MAX_SLOTS`, and replaces or strips duplicate anchors after ledger merge / slot replacement.

---

## 2. Delegation Matrix

Cells: ✅ imported and drives output · ⚠️ imported but shadowed by legacy path · ❌ not imported.

| Shared module | Brief | Plan | Nudges |
|---|---|---|---|
| `_shared/auth.ts` | ✅ `:3` | ✅ `:2` | (uses inline service-role; ⚠️) |
| `_shared/anthropic.ts` (`callClaudeText` / `callLovableAIText`) | ✅ `:4` | ⚠️ direct `fetch` to gateway also present | ✅ `:3` |
| `_shared/behaviour-wiring.ts` (`evaluateForScope`) | ✅ `:7` imported, shared behaviour output appended via `briefBehaviourSnapshot.taxonomyBlock` + `promptBlockBrief` (`:3884–3888`) | ✅ `:15` (drives slot boosts) | ✅ `:4` (`wiring.promptBlock` appended `:1586`) |
| `_shared/behaviour-snapshot.ts` | ✅ `:11` | ✅ `:29` | ✅ via `load-brief-behaviour-snapshot.ts` |
| `_shared/load-brief-behaviour-snapshot.ts` | ❌ not imported | ✅ `:26` | ✅ `:13` |
| `_shared/events/event-categories.ts` (`EVENT_CATEGORIES`, `CATEGORY_MAX_SLOTS`) | ❌ | ✅ `:38–44` | ✅ `:16`, `:618–620` |
| `_shared/events/event-classifier.ts` (`classifyEvent`) | ❌ (uses `selectLeadEvent` only) | ✅ `:39` | ⚠️ uses `classifyPatternBucket` compatibility layer for persisted `signal_summary` buckets |
| `_shared/events/event-phase-map.ts` (`EVENT_PHASE_MAP`, `phaseForEvent`) | ❌ | ⚠️ `:46` imported; `composeStateLabel` re-derives | ✅ `:237` |
| `_shared/events/event-subtypes.ts` | ❌ | ✅ `:50` | ❌ |
| `_shared/events/enrich-event.ts` | ❌ | ✅ `:54` | ❌ |
| `_shared/events/jit-candidates.ts` (`rankJitCandidates`) | ❌ | ✅ `:55` | ❌ (re-implements ranking) |
| `_shared/protocols/protocol-combos.ts` (`PROTOCOL_COMBOS`, `PRACTICE_TYPE_TO_COMBO`) | ❌ | ✅ `:51` | ✅ `:238` |
| `_shared/jit/select-jit.ts` (`selectJitCandidates`) | ❌ | ✅ `:64` | ❌ |
| `_shared/jit/relationship-weights.ts` | ❌ | ✅ `:65` | ❌ |
| `_shared/plan/action-frame.ts` | ❌ | ✅ `:58` | ❌ |
| `_shared/plan/why-llm.ts` (`generateWhyStatement`) | ❌ | ✅ `:59` | ❌ |
| `_shared/plan/title-prefixes.ts` | ❌ | ✅ `:57` | ❌ |
| `_shared/brief-signal-coverage.ts` | ❌ (inline accumulator) | ❌ | ❌ |
| `_shared/brief-validators.ts` | (search returned no import) | n/a | n/a |
| `_shared/brief-prompt-version.ts` | ✅ `:13` | ✅ `:30` | ✅ `:14` |
| `_shared/brief/copy-vocabulary.ts` | ✅ `:15–18` (`buildBriefSystemPrompt`, `contextHeaderForSlot`, `PRE_COMPUTED_USER_NOTICE`) | ❌ | ✅ `:15`, `:1131` (`FORBIDDEN_NOTIFICATION_WORDS`) |
| `_shared/executive-state-taxonomy.ts` (transitional shim) | ✅ `:5` | ⚠️ `:12` — should migrate to `events/*` | ⚠️ `:230` |
| `_shared/ceo-behaviour/*` | ❌ (uses behaviour-snapshot only) | ✅ `:52–53` (`travel`, `pto-holiday`) | ✅ `:236` (`travel`) |
| `_shared/signal-engine/*` | ✅ `:12–48` | ⚠️ partial | ❌ |

---

## 3. Per-Feature Audit

### 3.1 Brief — `supabase/functions/compute-outer-readiness/index.ts`

**What the doc prescribes** (`Decision_Readiness_Brief_LLM_Prompt_v2.docx` §2 + `PERFORMANCE_READINESS_BRIEF_LOGIC.md`): a 6-step advisory body whose §3 Signal Coverage Matrix names every event by `(title, category, phase, recommended combo)` so the LLM can ground its phrasing in the §4 pre/during/post contract.

**What the code does** (`:3317` system prompt builder, `:3539–3888` `userPrompt` accumulator):
- The system prompt persona now comes from `buildBriefSystemPrompt()`, so persona / voice / schema changes are centralized in `_shared/brief/copy-vocabulary.ts`.
- The `CALENDAR TODAY` block (`:3553`) lists events as `"HH:mm Title"` only. No category letter, no phase, no combo, no `preventsBuilds`.
- `briefBehaviourSnapshot.taxonomyBlock` and `promptBlockBrief` are now appended (`:3884–3888`), so the shared behaviour wiring does reach the brief prompt.
- `brief-signal-coverage.ts` is not imported at all.
- `selectLeadEvent` (`:5`) is the only taxonomy touchpoint; it returns a single lead event without phase metadata.

**Findings touched:** F-01, F-07, F-12, F-14. F-02 is resolved.

### 3.2 Plan — `supabase/functions/generate-mastery-plan/index.ts`

**Imports (good):** every canonical shared module is imported (`:12–65`). `EVENT_CATEGORIES`, `EVENT_PHASE_MAP`, `PROTOCOL_COMBOS`, `classifyEvent`, `enrichEvent`, `rankJitCandidates`, `selectJitCandidates`, `applySlotBoostsToMapping`, `buildActionFrame`, `generateWhyStatement`, `buildPlanTitle` are all in scope.

**Shared-led now:** `rankJitCandidates` now drives `topEvent` selection first, and the previous `filteredEvents` winner loop is retained only as a defensive fallback while the rest of the bridge is cleaned up.

**Shadow paths (bad):**
- **`composeStateLabel`** still re-derives phase windows from raw start times rather than reading `EVENT_PHASE_MAP[cat][phase].timing`. → F-09.
- **`duringNotificationOnly`** is honoured at `:4260` but not re-asserted when slot 2/3 backfill kicks in (the check happens earlier in candidate generation only).

**Findings touched:** F-09, F-10, F-16. F-03 / F-04 / F-06 / F-13 are resolved.

### 3.3 Nudges — `supabase/functions/smart-nudges/index.ts`

**Wired well:** `briefBehaviour.taxonomyBlock` and `briefBehaviour.promptBlockBrief` are appended to the user prompt at `:1531–1534`, and `wiring.promptBlock` for the active nudge scope is appended at `:1586`. `EVENT_PHASE_MAP` and `PROTOCOL_COMBOS` are imported and consulted.

**Shadowed:**
- `classifyPatternBucket` now resolves from canonical subtype first, but still preserves the historical `signal_summary` bucket labels for compatibility.
- Per-nudge `userPrompt` framing (`:1373 / :1394 / :1411 / :1426 / :1441 / :1460 / :1489`) is hand-authored. The shared `buildActionFrame` + `generateWhyStatement` Plan uses are never called.
- `FORBIDDEN_WORDS_V6` now resolves from the shared `FORBIDDEN_NOTIFICATION_WORDS` import, but the validator layer is still local to Nudges.
- Shared behaviour/taxonomy wiring is now prepended before the per-nudge framing block, so truncation no longer drops the rule layer first.
- `duringNotificationOnly` is now consulted before JIT emission, so notification-only conference/long-meeting categories are suppressed in Nudges too.

**Findings touched:** F-05, F-11, F-17. F-06 / F-08 / F-15 are resolved.

---

## 4. LLM Prompt Cross-Walk

### 4.1 Brief

| Doc-prescribed block (Brief LLM Prompt v2) | Actual code | Shared module that should populate it | Finding |
|---|---|---|---|
| §2.1 Persona + Strategic Register | `buildBriefSystemPrompt()` (`:3317`) | `copy-vocabulary.ts` (persona constants) | F-07 resolved |
| §2.18 Phrase Contract / forbidden words | Shared system prompt builder (`:3317`) | `copy-vocabulary.ts` `forbiddenWords` | F-07 resolved |
| §3 Signal Coverage Matrix (per event row) | `:3553–3573` `"HH:mm Title"` only | `brief-signal-coverage.buildSignalCoverage` | F-12 |
| §4 Pre/During/Post event-coaching block | Appended via `=== TODAY EVENT COACHING ===` / `=== TOMORROW EVENT COACHING ===` | `EVENT_PHASE_MAP` + `classifyEvent` | F-01 partial |
| §5 Behaviour rules (CEO state evaluator) | Appended via `briefBehaviourSnapshot.taxonomyBlock` + `promptBlockBrief` (`:3884–3888`) | `behaviour-wiring.evaluateForScope("brief").promptBlock` | F-02 resolved |

### 4.2 Plan

Plan is deterministic — no LLM prompt to cross-walk. The "prompt" here is the slot composition. The doc-prescribed contract from `PROACTIVE_MASTERY_PLAN_LOGIC.md` is checked in §3.2 above.

### 4.3 Nudges

| Doc-prescribed block (SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md) | Actual code | Shared module | Finding |
|---|---|---|---|
| Per-nudge framing derived from action-frame + why-llm | Hand-authored per `nudgeType` (`:1373+`) | `_shared/plan/action-frame.ts` + `_shared/plan/why-llm.ts` | F-11 |
| Taxonomy block at top of user prompt | Prepended ahead of nudge framing via shared behaviour block | `briefBehaviour.taxonomyBlock` | F-15 resolved |
| Canonical event classifier | `classifyPatternBucket` compatibility layer (canonical subtype first, legacy bucket fallback) | `classifyEvent` | F-05 partial |
| Forbidden-word vocabulary | Shared `FORBIDDEN_NOTIFICATION_WORDS` import | `brief/copy-vocabulary.ts` | F-08 resolved |

---

## 5. Event Taxonomy & §4 Wiring Check

Per `_shared/events/event-categories.ts` + `_shared/events/event-phase-map.ts` (verified by `cross-layer.test.ts`):

| Cat | Name | In categories | In phase-map | Combo set | Doc says `duringNotificationOnly`? | Code honours? |
|-----|------|---------------|---------------|-----------|------------------------------------|----------------|
| A | High-stakes prep | ✅ | ✅ pre/during/post | ✅ | no | n/a |
| B | Decision density | ✅ | ✅ | ✅ | no | n/a |
| C | Visibility / comms | ✅ | ✅ | ✅ | no | n/a |
| D | Influence / persuasion | ✅ | ✅ | ✅ | no | n/a |
| E | Interpersonal / conflict | ✅ | ✅ | ✅ | no | n/a |
| F | Long meetings / multi-day | ✅ | ✅ (during low severity) | ✅ | **yes** | Plan ✅ `:4260` / Nudges ❌ (F-06) |
| G | Travel / circadian | ✅ | ✅ | ✅ | no | n/a |
| H | Deep work | ✅ | ✅ | ✅ | no | n/a |

No categories are missing from `event-phase-map.ts`. The taxonomy itself is sound — the gaps are at the consumer wiring layer.

---

## 6. Root-Cause: "Same Event Appears Twice in Plan"

**Reproduction trace** (line numbers in `generate-mastery-plan/index.ts`):

1. `slotAnchors` is declared as `{ eventId, phase }[]` (`:4337`) — phase tracked.
2. JIT candidate loop respects `phaseAlreadyAnchored(eventId, phase)` (`:4456–4469`).
3. Final cross-slot dedupe now inspects resolved event ids, category caps, and repeated `jitPhase` values after fillers / ledger merge / replacement overrides (`:3219–3330`).
4. When a duplicate survives into final assembly, the slot is either replaced with a fresh alternative or has its JIT framing stripped instead of reusing the same event anchor.

**Why §4 enforcement also matters:** when `EVENT_PHASE_MAP[cat].post` is missing, the slot 3 filler that *would* have produced a unique `(eventId, 'post')` card silently falls through and re-anchors on `(eventId, 'pre')` instead, compounding the duplicate.

**Current contract status:** resolved in the June 3 landing.
- Final dedupe keys event reuse by resolved event identity plus `jitPhase`.
- Over-cap or repeated-phase anchors are replaced with a fresh alternative or stripped of JIT framing.
- Remaining follow-up is to keep any future slot-assembly helpers behind this same final dedupe contract.

---

## 7. Plan-Only Logic That Should Move to `_shared/`

| Function (current line range) | Why it's general | Proposed destination |
|---|---|---|
| `composeStateLabel` (~`:4200–4290`) — time-window labels for "Morning prep", "Pre-meeting", "Post-meeting" | Nudges and Brief both need consistent slot labels | `_shared/events/slot-labels.ts` |
| `phaseAlreadyAnchored` (`:4343`) | Generic dedupe helper for any (event, phase) tuple consumer | `_shared/events/phase-anchor.ts` |
| `buildRecommendedAction` (uses local mapping) | Mirrors `PRACTICE_TYPE_TO_COMBO` | re-export from `_shared/protocols/protocol-combos.ts` |
| `isHighStakesTitle` re-checks (Plan-local re-derivation around `:3429`) | Already canonical in `events/event-classifier.ts` | delete local re-derivation |

## 8. Plan-Only Logic That Should Stay

| Function | Why it must stay in Plan |
|---|---|
| Slot-3-of-3 filler logic (`:4825–4929`) | Plan-specific composition contract; Nudges/Brief have no concept of "minimum slots". |
| JIT exclusion to prevent double-booking (`slotAnchors` mutation between slots) | Sequencing rule for the 3-slot plan; not reusable. |
| Foundational/maturity tier mix (~`:4846`) | Driven by `plan_ledger`; Plan-domain only. |
| Habit-building minimum-slot rule (CEO doc — weekday/PTO/Saturday/Sunday matrix, comments at `:4815+`) | Plan-domain composition policy. |
| Mastery completion ledger merge (`mergeWithLedger`) | Plan-domain state evolution. |

---

## 9. Shared Edge Utilities Check

| Utility | Single path? | Notes |
|---|---|---|
| `_shared/auth.ts` | ⚠️ no | Brief + Plan use it; Nudges has inline service-role client. |
| `_shared/anthropic.ts` | ⚠️ no | Brief + Nudges use `callClaudeText`; Plan also has direct `fetch` paths. |
| `_shared/brief-prompt-version.ts` | ✅ imported by all three | But only Brief stamps it on the output payload (F-17). |
| `_shared/brief-validators.ts` | ❌ | No consumer imports it currently — validation logic is inline in `compute-outer-readiness`. |

---

## 10. Findings Register (consolidated)

See §0 for the full numbered list (F-01 … F-17) with severity, file:line, root cause, and contract-level fix. Severity legend: S1 = user-visible bug or coaching-quality regression today; S2 = drift/duplication that will cause regression on next change; S3 = architectural debt.

| ID | Severity | Feature | Cite |
|----|----------|---------|------|
| F-01 | S1 | Brief | Partial, `compute-outer-readiness/index.ts:3938–3951` |
| F-02 | S1 | Brief | Resolved June 3, `compute-outer-readiness/index.ts:3884–3888` |
| F-03 | S1 | Plan | Resolved June 3, `generate-mastery-plan/index.ts:3219–3330` |
| F-04 | S1 | Plan | Resolved June 3, `generate-mastery-plan/index.ts:3219–3330` |
| F-05 | S1 | Nudges | Partial, `smart-nudges/index.ts:569`, `event-classifier.ts:243–258` |
| F-06 | S1 | Nudges/Plan | Resolved June 3, `smart-nudges/index.ts:2170–2176`, `smart-nudges/index.ts:2349–2355` |
| F-07 | S2 | Brief | Resolved June 3, `compute-outer-readiness/index.ts:3317` |
| F-08 | S2 | Nudges | Resolved June 3, `smart-nudges/index.ts:15`, `smart-nudges/index.ts:1120` |
| F-09 | S2 | Plan | `composeStateLabel` re-derives phase |
| F-10 | S2 | Plan | local `PRACTICE_TYPE_TO_COMBO` mirror in `buildRecommendedAction` |
| F-11 | S2 | Nudges | `:1373+` hand-authored framing |
| F-12 | S2 | Brief | Partial, `compute-outer-readiness/index.ts:3539–3888` |
| F-13 | S3 | Plan | Resolved June 3, `generate-mastery-plan/index.ts:3039–3057` |
| F-14 | S3 | Brief | `selectLeadEvent` ignores `jitLeadTime` |
| F-15 | S3 | Nudges | Resolved June 3, `smart-nudges/index.ts:1511–1578` |
| F-16 | S3 | Plan | `:4825+` filler skips `enrichEvent` |
| F-17 | S3 | All | only Brief stamps `BRIEF_PROMPT_VERSION` |

---

## 11. Recommended Remediation Roadmap

- **Wave 1 — Brief event enrichment + signal coverage** (F-01, F-12, F-14). Coordinate with `BRIEF_PROMPT_VERSION` bump and snapshot in `mem/features/performance-readiness/prompt-snapshot-brief.md`.
- **Wave 2 — Nudges classifier + copy delegation** (F-05, F-11). Retire the compatibility-layer dependency over time and route per-nudge framing through `action-frame` + `why-llm`.
- **Wave 3 — Plan bridge cleanup + observability** (F-10, F-16, F-17). Finish shared plan consolidation; stamp `BRIEF_PROMPT_VERSION` cross-feature.

---

## Appendix A — Grep Evidence

```text
# Brief imports
rg -n "from ['\"]\\.\\./_shared" supabase/functions/compute-outer-readiness/index.ts
 3:  ../_shared/auth.ts
 4:  ../_shared/anthropic.ts
 5:  ../_shared/executive-state-taxonomy.ts (selectLeadEvent)
 7:  ../_shared/behaviour-wiring.ts (evaluateForScope)
11:  ../_shared/behaviour-snapshot.ts
13:  ../_shared/brief-prompt-version.ts
15:  ../_shared/brief/copy-vocabulary.ts (buildBriefSystemPrompt, contextHeaderForSlot, PRE_COMPUTED_USER_NOTICE)
18+: ../_shared/signal-engine/* (window-context, build-daily-context, demand-scorer, strategic-context, divergence-flag, pattern-engine, db-queries, day-kind-detector, context-builder, checkin-pattern-aggregator)

# Plan imports
rg -n "from ['\"]\\.\\./_shared" supabase/functions/generate-mastery-plan/index.ts
12:  executive-state-taxonomy
13:  events/event-classifier (isHighStakesTitle)
15:  behaviour-wiring (applySlotBoostsToMapping, evaluateForScope)
38:  events/event-categories (EVENT_CATEGORIES, CATEGORY_MAX_SLOTS)
39:  events/event-classifier (classifyEvent)
46:  events/event-phase-map (EVENT_PHASE_MAP, phaseForEvent)
50:  events/event-subtypes
51:  protocols/protocol-combos
54:  events/enrich-event
55:  events/jit-candidates (rankJitCandidates)
57:  plan/title-prefixes
58:  plan/action-frame
59:  plan/why-llm
64:  jit/select-jit

# Nudges imports
rg -n "from ['\"]\\.\\./_shared" supabase/functions/smart-nudges/index.ts
  4:  behaviour-wiring (evaluateForScope)
 13:  load-brief-behaviour-snapshot
 14:  brief-prompt-version
230:  executive-state-taxonomy
236:  ceo-behaviour/travel
237:  events/event-phase-map (EVENT_PHASE_MAP)
238:  protocols/protocol-combos
566:  events/event-classifier (classifyPatternBucket + classifyEvent)

# Brief shared prompt + behaviour wiring
rg -n "buildBriefSystemPrompt|PRE_COMPUTED_USER_NOTICE|contextHeaderForSlot|taxonomyBlock|promptBlockBrief" supabase/functions/compute-outer-readiness/index.ts
15:  buildBriefSystemPrompt
16:  contextHeaderForSlot
17:  PRE_COMPUTED_USER_NOTICE
3317: const systemPrompt = buildBriefSystemPrompt();
3540: let userPrompt = `${PRE_COMPUTED_USER_NOTICE}...`
3885: if (briefBehaviourSnapshot.taxonomyBlock) {
3888: if (briefBehaviourSnapshot.promptBlockBrief) {

# Brief shared window-context delegation
rg -n "buildWindowContext\\(|=== WINDOW CONTEXT" supabase/functions/compute-outer-readiness/index.ts
3907: briefWindowContext = buildWindowContext({
3924: userPrompt += `\\n\\n=== WINDOW CONTEXT (${w.window}) ===`;

# Plan final event dedupe (resolved F-03 / F-04)
sed -n '3219,3330p' supabase/functions/generate-mastery-plan/index.ts
// final cross-slot dedupe keyed by resolved eventId + jitPhase
// preserves first valid slot, replaces later duplicates, or strips JIT framing

# Nudges shared blacklist import + hand-authored framing
rg -n "FORBIDDEN_NOTIFICATION_WORDS|FORBIDDEN_WORDS_V6|userPrompt = " supabase/functions/smart-nudges/index.ts
15:   FORBIDDEN_NOTIFICATION_WORDS
1131: const FORBIDDEN_WORDS_V6 = [...FORBIDDEN_NOTIFICATION_WORDS];
1373: let userPrompt = '';
1373/1394/1411/1426/1441/1460/1489: per-nudge framing strings

# duringNotificationOnly honoured in both Plan and Nudges
rg -n "duringNotificationOnly|suppressJitForNotificationOnlyCategory" supabase/functions
_shared/events/event-phase-map.ts:54  (definition)
generate-mastery-plan/index.ts:4260   (Plan honours)
smart-nudges/index.ts:614  (shared category guard helper)
smart-nudges/index.ts:2178 (morning JIT suppression)
smart-nudges/index.ts:2359 (mid-day JIT suppression)
```

## Appendix B — Files touched by this audit

| File | Role |
|------|------|
| `supabase/functions/compute-outer-readiness/index.ts` | Brief edge function — LLM prompt + signal coverage |
| `supabase/functions/generate-mastery-plan/index.ts` | Plan edge function — deterministic slot composer |
| `supabase/functions/smart-nudges/index.ts` | Nudges edge function — push notification LLM |
| `supabase/functions/_shared/events/event-categories.ts` | A–H pillars (§3) |
| `supabase/functions/_shared/events/event-classifier.ts` | Canonical `classifyEvent` |
| `supabase/functions/_shared/events/event-phase-map.ts` | Pre/During/Post (§4) |
| `supabase/functions/_shared/events/event-subtypes.ts` | 30-row subtype matrix |
| `supabase/functions/_shared/events/enrich-event.ts` | Adds category + subtype to raw events |
| `supabase/functions/_shared/events/jit-candidates.ts` | `rankJitCandidates` |
| `supabase/functions/_shared/protocols/protocol-combos.ts` | §2 combos + `PRACTICE_TYPE_TO_COMBO` |
| `supabase/functions/_shared/jit/select-jit.ts` | JIT v2 selector |
| `supabase/functions/_shared/behaviour-wiring.ts` | `evaluateForScope`, `applySlotBoostsToMapping` |
| `supabase/functions/_shared/behaviour-snapshot.ts` | Snapshot builder consumed by Nudges + Plan |
| `supabase/functions/_shared/load-brief-behaviour-snapshot.ts` | Snapshot loader |
| `supabase/functions/_shared/plan/action-frame.ts` | Plan-domain action framing |
| `supabase/functions/_shared/plan/why-llm.ts` | `generateWhyStatement` |
| `supabase/functions/_shared/brief/copy-vocabulary.ts` | Single-source persona, voice banks, prompt schema, and forbidden-word contract for Brief |
| `supabase/functions/_shared/brief-signal-coverage.ts` | Builder for §3 matrix (unused by Brief today) |
| `supabase/functions/_shared/brief-prompt-version.ts` | Cross-feature version stamp |

---

*End of audit. This document update is documentation-only; referenced code changes landed separately.*
