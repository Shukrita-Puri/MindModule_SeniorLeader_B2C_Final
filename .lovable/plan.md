# Brief Copy Prompt — Audit Report + Scoped Implementation Plan

## Step 1 — Audit (complete, no code written)

**A1 — `llmAttempts`:** Exactly 2 entries (index.ts:8453).
1. `google/gemini-2.5-flash`, 15000 ms, via gateway
2. `CLAUDE_MODELS.SONNET`, 10000 ms, direct
A third Sonnet pass was already removed (comment dated 2026-08-07). No flag.

**A2 — `SIGNAL PILL TIERS` in userPrompt:** **Yes — already exists** (index.ts:6804-6828). `preLLMDecisionTier` / `preLLMPhysicalTier` are already declared in outer prompt scope (6453 / 6469) with exactly the tier thresholds the spec asks for, and the pill-consistency rule lines are already emitted. The MRS score/tier line is also already injected (6820-6828) plus `=== READINESS ===` Score/Tier at 6768. So spec Change 2a and both "NEW injections" are already in place.

**A3 — `[A]` category suffix on high-stakes titles:** **Yes** (index.ts:6915-6960). This is backend-only — the suffix exists solely inside the LLM `userPrompt` string and is never rendered to users. Titles print as `HH:mm Title [A]`, next high-stakes carries a suffix too, and an A–H importance guide is appended. No UI surfaces the category suffix and none will.

**A4 — Deterministic brief path:** Confirmed `supabase/functions/_shared/brief/deterministic-brief.ts` (374 lines).

**A5 — `closeFor()`:** `sharp` band reads exactly `"and don't let the smaller calls chip at what's there."` (line ~330) — a workday close. "Calls" has no place on a non-workday. And **yes**, `closeFor()` already branches on `opts.isWeekend` first (line 311) and returns before any weekday map lookup, so that line can never reach a weekend brief. The three existing weekend closes are, however, softer than the Chief-of-Staff register the spec sets: stated conclusion, short sentence, hard stop, no explanation. `closeFor()` is on the spec's untouchable list, so the plan leaves it byte-identical and instead carries the register in the Step 4 weekend directive strings and the Step 2 prompt text. If you want the three weekend closes retightened to that register too, say so and I will add it to Step 4 as an explicit, named exception to the untouchable list — I will not touch them otherwise.

**A6 — beat-(d) closing-clause rule in `brief-validators.ts`:** **Yes — already exists** (lines ~485-527): it splits sentences, matches `CLOSING_CONNECTOR_RE`, allows a directive-led final sentence, rejects with "body missing SELF-REGULATION closing clause", and caps the close length. Spec Change 4 is therefore already satisfied by an equivalent rule.

**A7 — window context / causality:**
- Window context is computed as `briefWindowContext` and appended **mid-assembly** (index.ts ~7700-7775), i.e. after the userPrompt string is opened at 6753 but before the LLM call. It is *not* fully computed before assembly begins.
- The prompt **does** already reference `vetoRisk`, `recoveryNote`, and the other window fields (7734, 7763).
- `causality_findings` / `signal_summary` are **not** queried anywhere in `compute-outer-readiness`. This is the one genuinely missing input.

**Observations logged, not acted on:** `brief-validators.ts` is imported and `validateBrief` is called at 8776/9083, alongside the inline `validateV61Output`; `mem://architecture/brief/validator-ownership` says the shared file is not wired — memory is stale.

## What the audit changes about the spec

Three of the five changes are already implemented in production code. Re-applying them verbatim would be a rewrite of working code for no behavioural gain, which the safety prompt forbids. Proposed scope:

| Spec change | Status | Action |
| --- | --- | --- |
| 1 — copy-vocabulary strings | Not applied | Apply in full |
| 2a pill tiers, 2c MRS injection | Already present | Skip |
| 2b causality `signal_summary` read | Missing | Apply |
| 2c three-bucket restructure | Not applied | Apply (reorganise existing lines only) |
| 3 — weekend directive strings | Not applied | Apply |
| 4 — beat (d) validator rule | Equivalent rule already present | Skip |
| 5 — version bump | Needed | Apply |

## Implementation steps (one deploy at a time)

**Step 2 — `_shared/brief/copy-vocabulary.ts` (strings only, no deploy)**
Replace the bodies of `SILENT_REASONING`, `BODY_FOUR_BEAT_CONTRACT`, `WORKED_EXAMPLES`, `OUTPUT_CONTRACT`, `WEEKEND_DIRECTIVE`, `NON_WORKDAY_DIRECTIVE`, `PERSONAL_TRAVEL_DIRECTIVE`, and the body of `workTravelDirective()` with the spec text verbatim. Signatures unchanged. All other exports untouched. Run `tsgo`.

**Step 3 — `compute-outer-readiness/index.ts` (userPrompt only), deploy alone**
- Add the non-blocking `causality_findings.signal_summary` read before assembly, using the in-scope admin client / user id / local-date variable names (verified at write time, no new client).
- Re-label and regroup the existing prompt sections into `=== BUCKET 1: PHYSIOLOGICAL STATE ===`, `=== BUCKET 2: CALENDAR & DAY SHAPE ===`, `=== BUCKET 3: PATTERNS & HISTORY ===`. Existing pill-tier, MRS, wearable, check-in, calendar, window-context and pattern lines move under the right header unchanged; nothing is dropped.
- Append the causality pattern rendering (HR × event primary, RHR next-morning, HRV overnight, cognition × event, sleep → PRS, consecutive load, performance lift) inside Bucket 3, gated on the summary being present.
- No change to `input_signature`, response shape, scoring, or gating.
- `tsgo`, deploy `compute-outer-readiness`, verify in logs: three bucket headers, existing pill/MRS lines still present, causality query runs (null is fine).
- **Latency gate before the production deploy:** the causality read is the only net-new DB call. Index check already done — `causality_findings` has a primary key on `(user_id, pattern_kind, computed_for_date)` plus `idx_causality_findings_user_kind_recent` on the same triple, so the `maybeSingle()` lookup is an index hit, not a scan. Still measured: if the query adds more than ~50 ms to the `compute-outer-readiness` response time in logs, pause and flag — do not ship a latency regression.

**Step 4 — `_shared/brief/deterministic-brief.ts`, deploy + smoke test**
Replace only the three return strings inside the existing `if (opts.isWeekend)` block of `buildDirective()`. Branching, `closeFor()`, and every other builder untouched. Smoke test Saturday depleted and Saturday all-green.

The deterministic path is treated as a first-class output, not a degraded fallback: if Gemini and Claude are both unavailable or out of credit, the brief the user reads must still hold quality on its own. So the three replacement strings are taken **verbatim from the shared spec file** — its directive wording, Chief-of-Staff register (stated conclusion, short sentences, hard stops, no explanation), sentence structure, and worked examples — not paraphrased. Each string is checked against the spec's banned-vocabulary list before it lands: no "meetings", "calls", "the room", "deliverables", "the team", "stakeholder", "presence", "runway", and no wellness vocabulary; direction only, never a practice, protocol, or duration.

`closeFor()` stays byte-identical. Logged as a named post-launch item: **"Retighten the three weekend closes in `closeFor()` to the Chief-of-Staff register"** — not wrong today, just softer than the spec, and out of scope here.

**Step 5 — validator**
Skipped: the beat-(d) rule already exists. Full `vitest` run here as the regression gate for Steps 2-4.

**Step 6 — version bump**
`BRIEF_PROMPT_VERSION` is a matched pair and both halves move together in one atomic commit:
- `supabase/functions/_shared/brief-prompt-version.ts` — `v6.9-weekend-work-directive` → `v7.0-brief-copy-buckets`
- `src/constants/briefPromptVersion.ts` (required frontend mirror read by `useCurrentBriefSnapshot`) → same value

Updating one without the other blanks the Brief card. Two files, one commit, one deploy of `compute-outer-readiness`. If anything beyond these two files would be touched in Step 6, stop.

## Rollback
Any regression (blank brief card, pill change, MRS change, other card change) → revert that single step's file and stop before the next step.
