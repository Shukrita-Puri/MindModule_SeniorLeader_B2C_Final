
# Audit deliverable plan

Goal: produce a single Markdown audit (`docs/SHARED_MODULES_DELEGATION_AUDIT.md`, ~600–900 lines) that answers: do the three user-facing features (Brief, Plan, Nudges) — including their edge functions, LLM prompts, and copy — actually delegate to the shared CEO modules? Where do they still use legacy in-file logic? What logic lives in `generate-mastery-plan` that should be Plan-only vs. shared?

This is an audit document only — no code changes, no shared modules edited.

## Scope of code under audit

Features (consumers):
- Brief — `supabase/functions/compute-outer-readiness/index.ts` (and `compute-inner-readiness`)
- Plan — `supabase/functions/generate-mastery-plan/index.ts`
- Nudges — `supabase/functions/smart-nudges/index.ts`

Shared modules (sources of truth) reviewed against the four reference docs:
- CEO behaviour rules: `_shared/ceo-behaviour/*`, `_shared/ceo-behaviour-rules.ts`, `_shared/behaviour-evaluator.ts`, `_shared/behaviour-wiring.ts`, `_shared/behaviour-snapshot.ts`, `_shared/load-brief-behaviour-snapshot.ts`
- Event taxonomy + classification: `_shared/events/event-categories.ts`, `event-classifier.ts`, `event-phase-map.ts`, `event-subtypes.ts`, `enrich-event.ts`, `format-taxonomy.ts`, `jit-candidates.ts`, `jit-phase-label.ts`
- Protocol combos: `_shared/protocols/protocol-combos.ts` (the §2 / §3 / §4 source from the attached *CEO Self-Regulation Framework v1.0*)
- JIT v2 selector: `_shared/jit/select-jit.ts`, `maturity-tier.ts`, `tactical-signals.ts`, `noise-filters.ts`, `goal-alignment.ts`, `relationship-weights.ts`
- Plan helpers: `_shared/plan/action-frame.ts`, `_shared/plan/why-llm.ts`, `_shared/plan/title-prefixes.ts`
- Shared edge utilities: `_shared/auth.ts`, `anthropic.ts`, `brief-context.ts`, `brief-prompt-version.ts`, `brief-validators.ts`, `brief-signal-coverage.ts`, `executive-state-taxonomy.ts`, `copy-vocabulary.ts`, `signal-engine/*`

Reference inputs cross-walked against the code:
- `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md`
- `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md`
- `docs/SMART_NUDGES_COMPREHENSIVE_ARCHITECTURE.md`
- `Decision_Readiness_Brief_LLM_Prompt_v2.docx`
- Uploaded `CEO_Self_Regulation_Framework_1-3.pages` (§2 protocol combos, §3 event categories A–H, §4 pre/during/post, §5 behaviour logic)

## Audit document structure

1. **Executive summary** — one page. The single sentence verdict per feature (uses shared / partial / legacy), the top five risks, and the "duplicate event in Plan" root cause in one paragraph.
2. **Delegation matrix** — a single table, one row per shared module × column per consumer (Brief / Plan / Nudges). Cells: `✅ imported & used`, `⚠️ imported but bypassed in path X`, `❌ not used (legacy duplicate)`, with file:line citations. Built from a fresh grep pass (we already have draft data; we'll re-verify per claim).
3. **Per-feature audit**
   - **3.1 Brief** — does the system prompt and the `userPrompt` builder in `compute-outer-readiness` actually consume `behaviour-wiring.evaluateForScope("brief").promptBlock` and the §3 event-coaching block? Compare against `Decision_Readiness_Brief_LLM_Prompt_v2.docx` (what the doc says the prompt should contain) and against `PERFORMANCE_READINESS_BRIEF_LOGIC.md`. Note where Brief still embeds its own state classification, its own event title heuristics, or its own copy vocabulary rather than calling `executive-state-taxonomy` / `copy-vocabulary` / `event-classifier`.
   - **3.2 Plan** — confirm imports of `EVENT_CATEGORIES`, `EVENT_PHASE_MAP`, `PROTOCOL_COMBOS`, `classifyEvent`, `selectJitCandidates`, `applySlotBoostsToMapping`, `buildActionFrame`, `generateWhyStatement`. For each, classify as wired vs. shadowed-by-legacy by tracing the actual call path that produces a slot's `practices[]`, `whyText`, `title`, and `phase`. Document where Plan's own legacy code (slot 4220–4930 region) still computes phase/combo without going through `phaseForEvent` / `PRACTICE_TYPE_TO_COMBO`.
   - **3.3 Nudges** — confirm `smart-nudges` consumes `briefBehaviour.promptBlockBrief`, `taxonomyBlock`, `EVENT_PHASE_MAP`, `PROTOCOL_COMBOS`, and which nudge types still hand-author copy (lines 1273–1597) instead of letting the shared behaviour block drive variety.
4. **LLM prompt cross-walk** — three side-by-side mini-tables (Brief / Plan / Nudges) of "doc-prescribed block" → "actual prompt string in code (file:line)" → "shared module that should populate it" → finding. This is where the *Decision_Readiness_Brief_LLM_Prompt_v2.docx* gets line-mapped against the 200-line `userPrompt` builder in `compute-outer-readiness` (≈ lines 3306–3700).
5. **Event taxonomy & §4 pre/during/post wiring** — verify every category A–H from the attached `.pages` doc has: (a) a triggers list in `event-categories.ts`, (b) a phase row in `event-phase-map.ts`, (c) a combo in `protocol-combos.ts`. Flag mismatches versus the document (e.g. categories that exist in the doc but render as `null` from `classifyEvent`).
6. **"Same event appears twice in Plan" root-cause section** — the user's stated bug. Trace `slotAnchors`, `phaseAlreadyAnchored`, `CATEGORY_MAX_SLOTS`, `deduped` (index.ts ~4337 / ~4775 / ~4795). Show why the current dedupe collapses on `contentId` but not on `(eventId, phase)`, so an event can occupy slot 2 (pre) and slot 3 (pre again) when its post phase is missing for that category. Recommend the §4-driven fix without writing it.
7. **Plan-only logic that should move** — list functions inside `generate-mastery-plan/index.ts` that are pure plan logic (slot ordering, max-slot caps, anchor selection) versus functions that are general taxonomy/protocol logic currently inlined in Plan but used implicitly by Nudges/Brief through the snapshot (good candidates to lift into `_shared/plan/` or `_shared/events/`). Each item gets: current line range, current consumers, proposed destination, why.
8. **Plan-only logic that should stay** — explicitly carve out: slot-3-of-3 filler logic, JIT exclusion to prevent double-booking, foundational/maturity tier mix, "minimum slots" backfill, mastery completion ledger. Confirm these belong in Plan.
9. **Shared edge utilities check** — `auth.ts`, `anthropic.ts` (LLM provider resilience), `brief-prompt-version.ts`, `brief-validators.ts` — verify each is the only path used by all three features for that concern. Flag any feature still using a private `callClaude` / `verifyJwt` clone.
10. **Findings register (numbered, severity-rated)** — each finding: ID, severity (S1/S2/S3), feature(s), file:line, what's wrong, what the relevant doc/shared module says, recommended fix at the contract level (no code). Estimated 25–40 findings.
11. **Recommended remediation roadmap** — three waves (Brief prompt wiring, Plan dedupe + §4 phase enforcement, Nudges copy delegation) with dependencies, not an implementation.
12. **Appendix A** — grep-evidence appendix: the raw `rg -n` lines that back every cell in the delegation matrix, so reviewers can re-verify.
13. **Appendix B** — index of every file touched, with a one-line role description.

## Method

- Re-run `rg` for each shared symbol against every consumer to populate the matrix from primary evidence, not memory. We already have a draft pass for `PROTOCOL_COMBOS`, `EVENT_CATEGORIES`, `EVENT_PHASE_MAP`, `evaluateForScope`, `selectJitCandidates`, `classifyEvent`, `buildActionFrame`, `generateWhyStatement` showing Plan imports them all, Brief imports only `evaluateForScope` + `selectLeadEvent`, Nudges imports `EVENT_PHASE_MAP` + `PROTOCOL_COMBOS` + `classifyByLegacyTable` + `evaluateForScope`.
- For each "imported" symbol, follow the call site to confirm it actually drives the output the user sees — not just imported and shadowed.
- Cross-walk every numbered claim in the four reference docs (CEO framework §2/§3/§4/§5, Brief logic doc, Plan logic doc, Nudges architecture doc, Brief LLM prompt v2) into the matrix.
- No file edits, no shared module changes, no migrations. Document only.

## Out of scope

- Implementing the shared-module migrations the audit recommends.
- Editing `executive-state-taxonomy.ts`, `event-categories.ts`, `event-phase-map.ts`, `protocol-combos.ts`, or any consumer.
- Changing prompts or LLM providers.
- Touching `typescript_audit.md` (the file the user is previewing is empty/missing; if they want the audit landed there instead of `docs/SHARED_MODULES_DELEGATION_AUDIT.md` I'll confirm before writing).

## Deliverable

One new file: `docs/SHARED_MODULES_DELEGATION_AUDIT.md`. Markdown only. ~600–900 lines. No code edits anywhere else.
