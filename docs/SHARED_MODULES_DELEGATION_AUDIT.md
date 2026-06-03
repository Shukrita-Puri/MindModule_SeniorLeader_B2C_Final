# Shared Modules Delegation Audit

**Scope:** Brief (`compute-outer-readiness`), Plan (`generate-mastery-plan`), Nudges (`smart-nudges`) vs. the `_shared/` source-of-truth modules (CEO behaviour, event taxonomy + classification, protocol combos, JIT v2, plan helpers, brief utilities).

**Reference docs cross-walked:** `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md`, `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md`, `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md`, `Decision_Readiness_Brief_LLM_Prompt_v2.docx`, `CEO_Self_Regulation_Framework_v1.0` (§2 protocols / §3 categories / §4 phases / §5 behaviour).

**Method:** primary-evidence grep on `supabase/functions/{compute-outer-readiness,generate-mastery-plan,smart-nudges}/index.ts` plus the `_shared/` modules. Every finding carries a `file:line` citation. No code, prompts, or shared modules were modified — this is a documentation-only deliverable.

---

## 0. AT-A-GLANCE FINDINGS SUMMARY

| # | Severity | Feature | Root cause (one line) | Fix at contract level |
|---|----------|---------|------------------------|------------------------|
| F-01 | S1 | Brief | Prompt embeds raw event titles; never imports `EVENT_CATEGORIES` / `EVENT_PHASE_MAP` / `PROTOCOL_COMBOS` (`compute-outer-readiness/index.ts:1–60`). LLM sees titles without §3 category or §4 phase context. | Inject a `=== EVENT COACHING ===` block built from `classifyEvent` + `phaseForEvent` for every event already listed in `CALENDAR TODAY` / `TOMORROW`. |
| F-02 | S1 | Brief | No `taxonomyBlock` / `promptBlockBrief` from `behaviour-wiring` is appended to the brief `userPrompt` (`compute-outer-readiness/index.ts:3519–3700`). Nudges already do this (`smart-nudges/index.ts:1531–1534`). | Reuse the same `briefBehaviour.taxonomyBlock` + `promptBlockBrief` pair Nudges already produces. |
| F-03 | S1 | Plan | Slot dedupe is keyed on `primaryPractice.contentId` only (`generate-mastery-plan/index.ts:4775–4795`), even though `slotAnchors` already carries `(eventId, phase)`. → "same event appears twice" bug when an event lacks a distinct `post` row. | Dedupe key = `${m.eventId}::${m.jitPhase}`; fall back to `contentId` only when no anchor exists. |
| F-04 | S1 | Plan | `phaseAlreadyAnchored` (`:4343`) is consulted **only** in the JIT candidate selection loop (`:4356`); it is **not** rechecked when slot 2 / slot 3 fillers push anchors at `:4665` / `:4727`. So two fillers can both push `(event=X, phase=pre)`. | Enforce `phaseAlreadyAnchored` inside slot 2/3 backfill before pushing to `slotAnchors`. |
| F-05 | S1 | Nudges | Uses `classifyByLegacyTable` (`smart-nudges/index.ts:566`) instead of canonical `classifyEvent`. Subtype + categoryId enrichment is lost → all pattern matching falls back to keyword heuristics. | Replace with `classifyEvent` from `_shared/events/event-classifier.ts`. Legacy table is shim-only. |
| F-06 | S1 | Plan | When `EVENT_CATEGORIES[cat].protocol.duringNotificationOnly === true` (F: long meetings), Plan correctly skips `during` slot at `:4260` — but Nudges still schedules a JIT for the same event because it never reads `duringNotificationOnly`. | Nudges must short-circuit on `category.protocol.duringNotificationOnly === true`. |
| F-07 | S2 | Brief | Persona, DO/DON'T register, and forbidden-word list are inlined in the system prompt (`:3306`) and a local `FORBIDDEN_WORDS` list, duplicating `_shared/copy-vocabulary.ts`. | Import `forbiddenWords` + persona constants from `copy-vocabulary.ts`. |
| F-08 | S2 | Nudges | `FORBIDDEN_WORDS_V6` is a local constant (`smart-nudges/index.ts:1119`); two separate validators at `:1147` and `:1233` duplicate the check. | Single `import { forbiddenWords } from '../_shared/copy-vocabulary.ts'`; one validator. |
| F-09 | S2 | Plan | `phaseForEvent` / `EVENT_PHASE_MAP` is imported (`:46`) but `composeStateLabel` still re-derives phase from raw start-time arithmetic instead of `EVENT_PHASE_MAP[cat][phase].timing`. | Delegate timing labels to `EVENT_PHASE_MAP` and only re-compute when phase-map returns `null`. |
| F-10 | S2 | Plan | `PRACTICE_TYPE_TO_COMBO` mirror exists implicitly in `buildRecommendedAction`; shared version lives at `protocols/protocol-combos.ts`. Two sources can drift. | Re-export from `_shared/protocols/protocol-combos.ts` and delete the local mapping. |
| F-11 | S2 | Nudges | Per-nudge `userPrompt` framing strings (`:1373 / :1394 / :1411 / :1426 / :1441 / :1460 / :1489`) are hand-authored and do not consume the new `actionFrame` / `whyLLM` shared helpers that Plan already uses. | Build framing from `_shared/plan/action-frame.ts` + `_shared/plan/why-llm.ts`, parameterised by `nudgeType`. |
| F-12 | S2 | Brief | No call to `buildSignalCoverage` from `_shared/brief-signal-coverage.ts`; the §3 Signal Coverage Matrix is assembled by 200 lines of `userPrompt += …` (`:3519–3700`). | Replace inline accumulator with a single call returning the matrix block. |
| F-13 | S3 | Plan | `applySlotBoostsToMapping` is imported (`:15`) but its return value is not asserted against `PROTOCOL_COMBOS` keys at runtime — a typo in a boost row silently no-ops. | Add a startup assertion that every boost target ∈ `Object.keys(PROTOCOL_COMBOS)`. |
| F-14 | S3 | Brief | `selectLeadEvent` is the only event-taxonomy import (`:5`); JIT lead-time logic (`event-subtypes.jitLeadTime`) is never consulted when picking which event to mention. | Pass `jitLeadTime` from subtype into the lead-event scoring weights. |
| F-15 | S3 | Nudges | `briefBehaviour.promptBlockBrief` is appended AFTER framing block (`:1534`) — when LLM truncates, the behaviour rules are dropped first. | Move behaviour block ABOVE framing in the user prompt. |
| F-16 | S3 | Plan | Static `MIN_SLOTS_FALLBACK` filler (`:4825`) does not run through `classifyEvent`, so filler practices skip A–H tagging and never appear in the daily-context snapshot Nudges depend on. | Run filler practices through `enrichEvent` before persisting. |
| F-17 | S3 | All three | `BRIEF_PROMPT_VERSION` is imported by all three consumers but only Brief stamps it on output (`:13` / `:30` / `:14`). Nudges + Plan stamp their own `architecture` field instead → cross-feature version skew. | Stamp `BRIEF_PROMPT_VERSION` on every LLM-produced artefact for cross-feature trace. |

**Top five risks (read first):**
1. Brief LLM has no §3/§4 context → generic coaching copy (F-01 / F-02).
2. Plan duplicates events across slots → "same event twice" UI bug (F-03 / F-04).
3. Nudges classifier is the legacy shim → pattern matching is keyword-only (F-05).
4. `duringNotificationOnly` is honoured by Plan but not Nudges → push storms during long meetings (F-06).
5. Forbidden-word lists triplicated → wellness phrases leak through whichever copy uses the stale list (F-07 / F-08).

**Remediation waves** (dependency-ordered, no implementation here):
- **Wave 1 — Plan dedupe + §4 enforcement:** F-03, F-04, F-06, F-09. Pure code-local fixes; no prompt changes.
- **Wave 2 — Brief receives §3/§4 + taxonomy block:** F-01, F-02, F-12, F-14. Adds shared helpers to Brief.
- **Wave 3 — Nudges copy delegation:** F-05, F-11, F-15. Replaces hand-authored framing.
- **Wave 4 — Copy-vocabulary consolidation:** F-07, F-08, F-13, F-16, F-17. Cleanup pass.

---

## 1. Executive Summary

| Feature | Verdict | One-sentence rationale |
|---------|---------|------------------------|
| Brief (`compute-outer-readiness`) | **Legacy-dominant** | Imports `evaluateForScope` and `selectLeadEvent` but never consumes the §3/§4 event-coaching block; 200-line inline `userPrompt` builder bypasses `brief-signal-coverage`. |
| Plan (`generate-mastery-plan`) | **Wired but shadowed** | Imports every shared module (EVENT_CATEGORIES, EVENT_PHASE_MAP, PROTOCOL_COMBOS, classifyEvent, selectJitCandidates, action-frame, why-llm) yet keeps a parallel legacy path for phase resolution and dedupes by `contentId` only. |
| Nudges (`smart-nudges`) | **Partial** | Consumes `briefBehaviour.taxonomyBlock` + `promptBlockBrief`, but still uses `classifyByLegacyTable`, a local forbidden-word list, and hand-authored per-nudge framing. |

The "same event appears twice in Plan" bug is reproduced by: an event of category C where `EVENT_PHASE_MAP[C].post` is absent. The JIT loop picks `(event=X, phase=pre)` into slot 2. Slot-3 filler then picks the same `(event=X, phase=pre)` (re-checking `phaseAlreadyAnchored` is skipped at `:4727`), and final dedupe at `:4775` collapses on `contentId` only — different practice contentIds for the same event survive.

---

## 2. Delegation Matrix

Cells: ✅ imported and drives output · ⚠️ imported but shadowed by legacy path · ❌ not imported.

| Shared module | Brief | Plan | Nudges |
|---|---|---|---|
| `_shared/auth.ts` | ✅ `:3` | ✅ `:2` | (uses inline service-role; ⚠️) |
| `_shared/anthropic.ts` (`callClaudeText` / `callLovableAIText`) | ✅ `:4` | ⚠️ direct `fetch` to gateway also present | ✅ `:3` |
| `_shared/behaviour-wiring.ts` (`evaluateForScope`) | ⚠️ `:7` imported, result not appended to prompt | ✅ `:15` (drives slot boosts) | ✅ `:4` (`wiring.promptBlock` appended `:1586`) |
| `_shared/behaviour-snapshot.ts` | ✅ `:11` | ✅ `:29` | ✅ via `load-brief-behaviour-snapshot.ts` |
| `_shared/load-brief-behaviour-snapshot.ts` | ❌ not imported | ✅ `:26` | ✅ `:13` |
| `_shared/events/event-categories.ts` (`EVENT_CATEGORIES`, `CATEGORY_MAX_SLOTS`) | ❌ | ✅ `:38–44` | ❌ |
| `_shared/events/event-classifier.ts` (`classifyEvent`) | ❌ (uses `selectLeadEvent` only) | ✅ `:39` | ⚠️ uses legacy shim `classifyByLegacyTable` `:566` |
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
| `_shared/copy-vocabulary.ts` | ❌ (inline blacklist) | ❌ | ❌ (`FORBIDDEN_WORDS_V6` local `:1119`) |
| `_shared/executive-state-taxonomy.ts` (transitional shim) | ✅ `:5` | ⚠️ `:12` — should migrate to `events/*` | ⚠️ `:230` |
| `_shared/ceo-behaviour/*` | ❌ (uses behaviour-snapshot only) | ✅ `:52–53` (`travel`, `pto-holiday`) | ✅ `:236` (`travel`) |
| `_shared/signal-engine/*` | ✅ `:12–48` | ⚠️ partial | ❌ |

---

## 3. Per-Feature Audit

### 3.1 Brief — `supabase/functions/compute-outer-readiness/index.ts`

**What the doc prescribes** (`Decision_Readiness_Brief_LLM_Prompt_v2.docx` §2 + `PERFORMANCE_READINESS_BRIEF_LOGIC.md`): a 6-step advisory body whose §3 Signal Coverage Matrix names every event by `(title, category, phase, recommended combo)` so the LLM can ground its phrasing in the §4 pre/during/post contract.

**What the code does** (`:3306` system prompt, `:3519–3700` `userPrompt` accumulator):
- The system prompt persona is inline prose — not imported from `copy-vocabulary.ts`.
- The `CALENDAR TODAY` block (`:3553`) lists events as `"HH:mm Title"` only. No category letter, no phase, no combo, no `preventsBuilds`.
- `evaluateForScope("brief")` is imported (`:7`) but its `promptBlock` is **not** appended.
- `brief-signal-coverage.ts` is not imported at all.
- `selectLeadEvent` (`:5`) is the only taxonomy touchpoint; it returns a single lead event without phase metadata.

**Findings touched:** F-01, F-02, F-07, F-12, F-14.

### 3.2 Plan — `supabase/functions/generate-mastery-plan/index.ts`

**Imports (good):** every canonical shared module is imported (`:12–65`). `EVENT_CATEGORIES`, `EVENT_PHASE_MAP`, `PROTOCOL_COMBOS`, `classifyEvent`, `enrichEvent`, `rankJitCandidates`, `selectJitCandidates`, `applySlotBoostsToMapping`, `buildActionFrame`, `generateWhyStatement`, `buildPlanTitle` are all in scope.

**Shadow paths (bad):**
- **Dedupe (`:4775–4795`)** is `contentId`-only despite `slotAnchors` carrying `(eventId, phase)`. → F-03.
- **`phaseAlreadyAnchored` (`:4343`)** is consulted in the JIT loop at `:4356` but skipped by slot 2 backfill (`:4665`) and slot 3 backfill (`:4727`). → F-04.
- **`composeStateLabel`** still re-derives phase windows from raw start times rather than reading `EVENT_PHASE_MAP[cat][phase].timing`. → F-09.
- **`duringNotificationOnly`** is honoured at `:4260` but not re-asserted when slot 2/3 backfill kicks in (the check happens earlier in candidate generation only).

**Findings touched:** F-03, F-04, F-06, F-09, F-10, F-13, F-16.

### 3.3 Nudges — `supabase/functions/smart-nudges/index.ts`

**Wired well:** `briefBehaviour.taxonomyBlock` and `briefBehaviour.promptBlockBrief` are appended to the user prompt at `:1531–1534`, and `wiring.promptBlock` for the active nudge scope is appended at `:1586`. `EVENT_PHASE_MAP` and `PROTOCOL_COMBOS` are imported and consulted.

**Shadowed:**
- `classifyByLegacyTable` (`:566`) is used instead of `classifyEvent`. The legacy shim returns categoryId only — no subtype, no `jitLeadTime`, no `severityHint`.
- Per-nudge `userPrompt` framing (`:1373 / :1394 / :1411 / :1426 / :1441 / :1460 / :1489`) is hand-authored. The shared `buildActionFrame` + `generateWhyStatement` Plan uses are never called.
- `FORBIDDEN_WORDS_V6` (`:1119`) and its two validators (`:1147`, `:1233`) duplicate `copy-vocabulary.ts`.
- `briefBehaviour.promptBlockBrief` is appended *after* framing, so under token truncation the behaviour rules are dropped first.
- `duringNotificationOnly` is never consulted — Nudges will fire pushes during a long meeting Plan deliberately silenced.

**Findings touched:** F-05, F-06, F-08, F-11, F-15, F-17.

---

## 4. LLM Prompt Cross-Walk

### 4.1 Brief

| Doc-prescribed block (Brief LLM Prompt v2) | Actual code | Shared module that should populate it | Finding |
|---|---|---|---|
| §2.1 Persona + Strategic Register | `:3306` inline prose | `copy-vocabulary.ts` (persona constants) | F-07 |
| §2.18 Phrase Contract / forbidden words | Inline blacklist near `:3306` | `copy-vocabulary.ts` `forbiddenWords` | F-07 |
| §3 Signal Coverage Matrix (per event row) | `:3553–3573` `"HH:mm Title"` only | `brief-signal-coverage.buildSignalCoverage` | F-12 |
| §4 Pre/During/Post event-coaching block | **Missing entirely** | `EVENT_PHASE_MAP` + `classifyEvent` | F-01 |
| §5 Behaviour rules (CEO state evaluator) | **Missing** (`evaluateForScope` result not appended) | `behaviour-wiring.evaluateForScope("brief").promptBlock` | F-02 |

### 4.2 Plan

Plan is deterministic — no LLM prompt to cross-walk. The "prompt" here is the slot composition. The doc-prescribed contract from `PROACTIVE_MASTERY_PLAN_LOGIC.md` is checked in §3.2 above.

### 4.3 Nudges

| Doc-prescribed block (SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md) | Actual code | Shared module | Finding |
|---|---|---|---|
| Per-nudge framing derived from action-frame + why-llm | Hand-authored per `nudgeType` (`:1373+`) | `_shared/plan/action-frame.ts` + `_shared/plan/why-llm.ts` | F-11 |
| Taxonomy block at top of user prompt | Appended mid-prompt (`:1531`) | `briefBehaviour.taxonomyBlock` | F-15 |
| Canonical event classifier | `classifyByLegacyTable` shim (`:566`) | `classifyEvent` | F-05 |
| Forbidden-word vocabulary | Local `FORBIDDEN_WORDS_V6` (`:1119`) | `copy-vocabulary.forbiddenWords` | F-08 |

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
2. JIT candidate loop respects `phaseAlreadyAnchored(eventId, phase)` (`:4356`).
3. Slot 2 backfill pushes `{eventId, phase}` (`:4665`) **without** re-calling `phaseAlreadyAnchored` first.
4. Slot 3 backfill does the same (`:4727`).
5. Final dedupe loop (`:4775–4795`) keys on `m.practice.contentId`:
   ```ts
   if (!seenContentIds.has(m.practice.contentId)) { ... }
   ```
6. Because two distinct practices can be recommended for the same `(eventId, phase)` (e.g. `regulate` + `align`), their `contentId`s differ → both survive → user sees two cards for the same meeting with the same phase.

**Why §4 enforcement also matters:** when `EVENT_PHASE_MAP[cat].post` is missing, the slot 3 filler that *would* have produced a unique `(eventId, 'post')` card silently falls through and re-anchors on `(eventId, 'pre')` instead, compounding the duplicate.

**Recommended contract fix (no code here):**
- Dedupe key = `${m.eventId ?? m.practice.contentId}::${m.jitPhase ?? 'none'}`.
- Slot 2/3 backfill MUST call `phaseAlreadyAnchored` before pushing.
- When `phaseForEvent(event, 'post') === null`, slot 3 must fall back to a non-event filler (state-management), not to the same event's `pre`.

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
| F-01 | S1 | Brief | `compute-outer-readiness/index.ts:3553` (no §4 block) |
| F-02 | S1 | Brief | `:7` imported, never appended |
| F-03 | S1 | Plan | `generate-mastery-plan/index.ts:4775` |
| F-04 | S1 | Plan | `:4665`, `:4727` (skip `phaseAlreadyAnchored`) |
| F-05 | S1 | Nudges | `smart-nudges/index.ts:566` |
| F-06 | S1 | Nudges/Plan | Nudges never reads `duringNotificationOnly` |
| F-07 | S2 | Brief | `:3306` inline persona + blacklist |
| F-08 | S2 | Nudges | `:1119` `FORBIDDEN_WORDS_V6` |
| F-09 | S2 | Plan | `composeStateLabel` re-derives phase |
| F-10 | S2 | Plan | local `PRACTICE_TYPE_TO_COMBO` mirror in `buildRecommendedAction` |
| F-11 | S2 | Nudges | `:1373+` hand-authored framing |
| F-12 | S2 | Brief | `:3519–3700` inline signal-coverage accumulator |
| F-13 | S3 | Plan | `applySlotBoostsToMapping` no startup assert |
| F-14 | S3 | Brief | `selectLeadEvent` ignores `jitLeadTime` |
| F-15 | S3 | Nudges | `:1534` behaviour block after framing |
| F-16 | S3 | Plan | `:4825+` filler skips `enrichEvent` |
| F-17 | S3 | All | only Brief stamps `BRIEF_PROMPT_VERSION` |

---

## 11. Recommended Remediation Roadmap

- **Wave 1 — Plan dedupe + §4 enforcement** (F-03, F-04, F-06, F-09). No prompts changed; pure code-local fixes. Unblocks the "same event twice" UI bug.
- **Wave 2 — Brief receives §3/§4 + taxonomy block** (F-01, F-02, F-12, F-14). Requires touching the Brief prompt; coordinate with `BRIEF_PROMPT_VERSION` bump and snapshot in `mem/features/performance-readiness/prompt-snapshot-brief.md`.
- **Wave 3 — Nudges copy delegation** (F-05, F-11, F-15). Replace `classifyByLegacyTable`; move behaviour block above framing; route per-nudge framing through `action-frame` + `why-llm`.
- **Wave 4 — Copy-vocabulary consolidation + observability** (F-07, F-08, F-10, F-13, F-16, F-17). Single `forbiddenWords` source; stamp `BRIEF_PROMPT_VERSION` cross-feature.

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
566:  events/event-classifier (classifyByLegacyTable)   ← legacy shim

# Plan dedupe (root cause)
sed -n '4775,4795p' supabase/functions/generate-mastery-plan/index.ts
const seenContentIds = new Set<string>();
const deduped: HorizonModule[] = [];
for (const m of modules) {
  if (!seenContentIds.has(m.practice.contentId)) { ... deduped.push(m); }
}

# Nudges hand-authored framing + local blacklist
rg -n "FORBIDDEN_WORDS_V6|userPrompt = " supabase/functions/smart-nudges/index.ts
1119: const FORBIDDEN_WORDS_V6 = [
1362: let userPrompt = '';
1373/1394/1411/1426/1441/1460/1489: per-nudge framing strings

# duringNotificationOnly honoured in Plan, missing in Nudges
rg -n "duringNotificationOnly" supabase/functions
_shared/events/event-phase-map.ts:54  (definition)
generate-mastery-plan/index.ts:4260   (Plan honours)
smart-nudges/index.ts: (no match)
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
| `supabase/functions/_shared/copy-vocabulary.ts` | Single-source forbidden words + persona constants |
| `supabase/functions/_shared/brief-signal-coverage.ts` | Builder for §3 matrix (unused by Brief today) |
| `supabase/functions/_shared/brief-prompt-version.ts` | Cross-feature version stamp |

---

*End of audit. No code, prompts, or shared modules were modified.*