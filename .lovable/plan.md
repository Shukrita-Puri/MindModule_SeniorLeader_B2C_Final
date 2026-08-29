# Audit — Deterministic Brief quality + doc/version drift (read-only, no code)

Scope: does the deterministic brief work still hold if the LLM fails or we switch to deterministic-only. No changes proposed to MRS, Plan, Insights or the three exec-card gating fixes.

## 1. What is genuinely implemented (verified in code and tests)

| Claim | State | Evidence |
|---|---|---|
| `_shared/brief/family-copy.ts` deleted, copy folded into the CEO pack | TRUE | file absent; `NARRATIVE_COPY` + `renderNarrativeBeats` / `assembleNarrativeBody` live in `_shared/personas/ceo/behaviour-copy.ts` (1327 lines); `deterministic-brief.ts` imports from there and nowhere else |
| Window awareness (sleep morning-only, tense-correct day bucket, evening directives) | TRUE for the narrative path | `behaviour-copy.ts` `NarrativeWindow`, `bodySignal()` returns null when `window !== "morning"`, `nEveningDirective` |
| Timing clause spent once; no `"{event} ahead"`; seeded evidence openers | TRUE for the narrative path | contract tests cover all 11 families × 3 windows |
| `lead_narrative` persisted on `daily_context_snapshot` | TRUE | `signal-engine/build-daily-context.ts:167` + migration `20260826225051…` |
| Deterministic brief is a real last-resort path | TRUE | `compute-outer-readiness/index.ts` ~9387: LLM miss → deterministic attempt → must pass `validateBrief()` → else awaiting |
| Prompt version in sync backend/frontend | TRUE | both `supabase/functions/_shared/brief-prompt-version.ts` and `src/constants/briefPromptVersion.ts` = `v7.7-calendar-load-honesty` |
| Intent layer for educational content | TRUE (contradicts the plan text, which says "no intent layer exists") | `_shared/events/event-intent.ts`, consumed by `classify-event-v2.ts` |
| `stampCalendarEventCategory` merged-id bug | REPAIRED in code | `learning-store.ts:314` resolves real `calendar_events` row ids by normalised title + time window before `.in("id", ids)` |
| Learning context reach | Wider than the plan states | `learning-store` is imported by `compute-outer-readiness`, `smart-nudges`, `cause-effect-engine`, `generate-jit-events`, `generate-mastery-plan`, `list-week-ahead-priorities`, `record-event-priority-signal` — the plan's "Brief / Nudges / Insights not loading today" is stale |

Test state now: `_shared/brief` + `_shared/personas` = 53 passed / 0 failed; golden set = 174 narrative fixtures + 3 contract tests, all pass.

## 2. Copy drift — where the deterministic output still misses the stated rules

These are real, and they sit in the **generic (non-narrative) branch** of `_shared/brief/deterministic-brief.ts`, which is the branch that runs when no scenario family fires — i.e. the most common LLM-failure path.

1. **`"{event} ahead"` survives.** `deterministic-brief.ts:355` — `"…with ${ref} ahead this ${window} — the transit is the demand…"`. The polish fix and its contract test only cover `NARRATIVE_COPY`; the generic branch was never included, so the defect is both present and untested.
2. **Window gating is narrative-only.** The generic branch selects directives from `opts.sleepScore` (`lowSleepIntoHighStakes`, ~line 697) with no window guard, so an afternoon/evening generic brief can still be driven by an overnight signal — exactly what §2 of the consolidation plan forbids. `bodySignal()`'s morning gate does not protect this path.
3. **Forward-looking language in later windows.** Generic lines at `:447` ("open working day ahead") and `:677` ("The week ahead will ask…") are not window-gated; `:677` is inside the weekend branch so it is defensible, `:447` is not.
4. **`variantSeed` fallback.** `deterministic-brief.ts:889` falls back to `${window}|${family}` when the caller omits the seed — no per-day variance. Production passes the correct seed (`compute-outer-readiness:9522`), so this is latent, not live.

Nothing above touches gating, scoring or the LLM path.

## 3. Version / document drift — what was written where, and what never got bumped

**Nothing in `docs/` or `mem/` carries a `v7.x` brief version.** The last three prompt bumps (v7.5 four-beat, v7.6, v7.7 calendar-load honesty) are code-only.

| File | Says | Reality | Verdict |
|---|---|---|---|
| `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md` | header "Version v6.3"; §3.3 "`prompt_version` currently `v6.1`"; §"input_signature" v6.3 | v7.7 | stale by 4 versions — the main "as-built" brief doc |
| `docs/PERFORMANCE_READINESS_BRIEF_LLM_PROMPT.md` | "canonical prompt source of truth", model `claude-sonnet-4`, temp 0, max 380, cache key `user_id+date+slot+last_checkin_id` | Gemini Flash → Claude Haiku ladder, 3-sentence contract, cache key is `input_signature`+`prompt_version` | wrong on model, contract and cache key, and wrongly claims SSOT status |
| `docs/EXECUTIVE_HOME_CARDS_REGENERATED_SSOT.md`, `…_WIRING_GUIDE.md`, `EXECUTIVE_HOME_DOCUMENT_DRIFT_REPORT.md` | `v6.6-replacement-vocabulary` / `v6.5-no-deterministic-fallback` | v7.7, and the deterministic fallback was reinstated at v6.6 | stale |
| `docs/BRIEF_ENGINE_ARCHITECTURE_AUDIT.md` | dated 2026-08-27; correctly records the family-copy deletion, `NARRATIVE_COPY`, the two-producer contract | missing v7.7 calendar-load honesty, `two-party-title.ts`, remaining-meetings copy, manual-refresh behaviour | partially stale (the least-drifted doc) |
| `docs/EVENT_TAXONOMY_A_H_SSOT.md` (Phase 5 deliverable) | — | does not exist | not delivered |
| `mem/architecture/brief/narrative-copy-ownership.md` | consolidation + window rules + copy invariants | matches code | accurate |
| `mem/` overall | no entry for calendar-load honesty, two-party title inference, or the deterministic-fallback contract | — | missing memories, so future sessions can re-break these |

Also worth naming: the earlier round's write-up landed in `docs/BRIEF_VALIDATOR_SSOT.md` rather than in `docs/BRIEF_ENGINE_ARCHITECTURE_AUDIT.md`, which is where the plan asked for it — that is the "wrongly written to which doc" case.

## 4. Frontend / user-visible angle

- `DecisionReadinessBrief.tsx` never surfaces `brief_source`, so a deterministic brief is indistinguishable from an LLM one in the UI — good for a deterministic-only fallback, but it also means a weak deterministic line ships silently with no signal to us.
- The card guarantees phrase and body come from one source and never mix (`:2282`), and refuses to restore an older brief while signals are missing (`:2145`). That holds.
- No user-facing doc (`public/llms.txt`, README) references the brief engine, so the doc drift above is internal/GitHub-visible only.

## 5. Verdict on the launch question

If the LLM path were disabled today, the narrative families (11 × 3 windows, 174 fixtures) would ship at the intended quality. The residual risk is concentrated in the **generic fallback branch**: `"{event} ahead"` at line 355 and unguarded sleep-driven directives after the morning. Those are the only two copy defects I would treat as pre-launch candidates; both are single-line, additive fixes with no gating, scoring or schema implication. Everything else in section 3 is documentation, safe to do after launch.

No code, docs or memories were changed by this audit.
