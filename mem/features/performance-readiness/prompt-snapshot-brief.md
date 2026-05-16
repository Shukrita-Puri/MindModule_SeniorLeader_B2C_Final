---
name: Brief LLM prompt snapshot (pre-refactor ground truth)
description: Verbatim capture of the v6.1 brief system prompt in compute-outer-readiness/index.ts as of the shared-modules refactor. Rollback reference for Phase 2.
type: reference
---
# Brief LLM prompt snapshot — pre Phase 2 refactor

Source: `supabase/functions/compute-outer-readiness/index.ts`, `systemPrompt` constant at ~line 3360 and `userPrompt` accumulator starting ~line 3573 (inside `if (cachedSnapshot === null)` branch).

This file is the rollback reference. If Phase 2 regresses, revert `compute-outer-readiness/index.ts` to match what this file captures.

## What lives in the prompt today

The system prompt currently embeds the following sections from `Decision_Readiness_Brief_LLM_Prompt_v2.docx` v6.1 verbatim as prose:

- §2.1–§2.2 Persona + Strategic Register (DO/DON'T) — **keeps in prompt after Phase 2**
- §2.11–§2.17 CEO Reality Logic Engines (Veto Risk, Second Wind, Circadian Priority, Decision Leakage Guard, Post-Peak Hangover, Personal Friction Inference, Board-Level Outcome) — **moves to `_shared/ceo-behaviour-rules.ts`**
- §2.18 / §2.18.5 Phrase + Four-Role Contract — **keeps in prompt** (this is craft)
- §2.19 / §2.19.1 / §2.19.2 / §2.19.5 / §2.19.6 3-Part Impact Mandate, Pattern-Aware Body, Pillar-Vocabulary Map, Assessment Contract, Data-Honesty Ledger — **keeps the synthesis rules in prompt; pillar vocabulary moves to `_shared/copy-vocabulary.ts` as the source of truth**
- §2.20 Elastic Lexicon (Cognition / Physiology / Resilience clusters) — **moves to `_shared/copy-vocabulary.ts`**
- §2.22 Anti-Fallback / Data-First Mandate — **keeps in prompt**
- §5.1 / §5.2 validator rules (re-stated to the LLM as constraints) — **enforced in code via `_shared/brief-validators.ts`; restated to LLM only as compact constraints**
- Hard constraints (WELLNESS BLACKLIST, SCORE TIER BLACKLIST, READINESS BLACKLIST, DAY NAMING, JIT OVERRIDE) — **forbidden-words move to `_shared/copy-vocabulary.ts`**
- §3 Signal Coverage Matrix lines built by `userPrompt += …` — **assembled by `_shared/brief-signal-coverage.ts`**, the prompt receives the resulting `BriefContext` JSON

## Spec gaps found (vs v6.1 doc)

- §2.11 Veto Risk — present as instruction prose, NOT as deterministic detection; the LLM is asked to detect MASKED_HIGH on its own. Phase 1 ships a deterministic detector.
- §2.12 Second Wind — not implemented at all in code.
- §2.13 Circadian Priority — `preFlight` / `inFlight` / `postArrival` flags exist; no explicit timezone-drift ≥3h override. Phase 1 wires it through `globalLoad.timezoneShift48h`.
- §2.14 Decision Leakage Guard — present as instruction prose; LLM evaluates the boolean. Phase 1 ships a deterministic dual-source detector.
- §2.15 Post-Peak Hangover — present as prose; `postPeakWindow` is computed but no copy-direction flag. Phase 1 ships the detector + `copyHint`.
- §2.16 Personal Friction Inference — present as prose; deferred (needs ≥3 weeks of data). Phase 1 ships a stub returning `null`.
- §2.17 Board-Level Outcome — present as prose; `isHighVisibilityToday` flag implied but not enforced as a copy contract. Phase 1 ships the detector.
- Forbidden-word lists are duplicated between brief (inline blacklists) and smart-nudges (`FORBIDDEN_WORDS_V6`). Phase 1 introduces single source in `_shared/copy-vocabulary.ts`; nudges migration in Phase 3.

## Rollback procedure

1. Set env `SHARED_MODULES_ENABLED=false`. Phase 2 path is gated on this flag — disabling it returns the brief to the exact code paths captured in this snapshot, with zero code revert.
2. If the flag-off path itself is broken, revert `supabase/functions/compute-outer-readiness/index.ts` to the commit immediately preceding the Phase 2 change.

## Verbatim capture

Full prompt text (systemPrompt + userPrompt accumulator) is preserved in git history at the pre-Phase-2 commit. Do not duplicate the full ~226 lines here — git is the canonical store. This file documents *what* moved and *where*, not *what the text was*.