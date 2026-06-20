
# Phase 3 — Ship All D1–D4 Now

User override: ship all four prompt + timeout refinements immediately, ahead of Phase 2 data. Bump `BRIEF_PROMPT_VERSION` once to invalidate all cached briefs.

## D1 — Body word ceiling 40 → 55–60, beat-weighted

**File:** `supabase/functions/_shared/brief/copy-vocabulary.ts` (BODY contract section of `buildBriefSystemPrompt`)

- Replace the 40-word ceiling with a 55–60 word ceiling (target 45–55).
- Keep all four beats; add explicit per-beat word budgets:
  - (a) EVIDENCE — 2–3 inputs across sources, ~15–18 words
  - (b) THE READ — one judgement, no hedge, ~12–15 words
  - (c) WORK DIRECTIVE — shape of engagement, ~15–18 words (most load-bearing)
  - (d) SELF-REGULATION DIRECTIVE — 3–6 word closing clause, reads as exhale to (c)
- Update `validateBody` in `supabase/functions/_shared/brief-validators.ts`: bump hard word ceiling to 60; soft-warn 55–60.

## D2 — Word-ban replacement vocabulary

**File:** `supabase/functions/_shared/brief/copy-vocabulary.ts` (and `_shared/copy-vocabulary.ts` where forbidden list lives)

- In the system prompt, append a paired block:
  ```
  NEVER: recharge, self-care, mindful, breathe, nourish, restore,
         wellness, calm, relax
  INSTEAD SAY: "settle", "steady", "hold your line", "keep your edge",
               "stay sharp", "pace yourself", "protect the next hour"
  ```
- Place inside the BODY → self-regulation beat guidance, where wellness leaks happen most.
- No change to `forbiddenWords` enforcement (those still hard-reject).

## D3 — Corrective retry (replace generic STRICT_PHRASE_RETRY)

**File:** `supabase/functions/compute-outer-readiness/index.ts` (LLM attempt loop ~lines 4527–4644)

- Today: on soft-reject, append generic `STRICT_PHRASE_RETRY` text.
- Change: build a targeted retry instruction from the attempt-1 `validatorRule` already captured by Phase 1A. Pattern:
  ```
  Your previous attempt failed validation for: <specific reason>.
  Fix only that issue. Do not start over or add more analysis —
  just correct the specific problem named above.
  ```
- Map `validatorRule` → human-readable cause:
  - `word_ban:<token>` → "you used the banned word \"<token>\""
  - `band_gate_violation` → "tone violated the band-gate (protective on low day / permissive on high day)"
  - `score_echoed` → "you echoed the numeric score"
  - `word_count_exceeded:<n>` → "body exceeded 60 words (<n> words)"
  - `phrase_duplicate_of_body` → "phrase duplicated content from the body"
  - `duplicate_of_yesterday` → "brief duplicated yesterday's content"
  - else: fall back to the raw reason string.
- Apply on attempt-2 (Claude) and on the soft-reject same-model retry.

## D4 — Timeouts

**File:** `supabase/functions/compute-outer-readiness/index.ts` (line ~4528 `llmAttempts` config)

- Flash attempt 1: `timeoutMs: 4000` → `7000`
- Claude attempt 2: `timeoutMs: 6000` → `9000`
- Same `timeoutMs` reused by soft-reject same-model retry path (no separate change needed).

## BRIEF_PROMPT_VERSION bump

**File:** `supabase/functions/_shared/brief-prompt-version.ts`

- Bump `'v6.3-baseline-source-of-truth'` → `'v6.4-beat-weighted-vocab-paired'`.
- Single bump covers D1+D2+D3 contract surface; invalidates all stale cached briefs so the next request regenerates against the new contract.

## Deploy + verify

- Deploy `compute-outer-readiness`.
- 24h check:
  - `brief_source = 'llm'` rate is the majority (target >80%).
  - `rg "Close strong\.|Steady the system|protecting the edge"` against rendered output returns nothing on a normal weekday.
  - Spot-check 10 rendered briefs: four beats present, body ≤ 60 words, no wellness/clinical/tier words, no score-echo.
- `llm_attempts` (from Phase 1A) confirms whether timeout/word-count/word-ban reject rates dropped — i.e. D4/D1/D2 actually paid off, or were wasted prompt budget.

## Explicit non-changes
- Plan engine, 24h horizon, scoring, slot allocator, practice selector, why-line — untouched.
- `READINESS_AWAITING_MESSAGE` frontend silent-fallback remains the safety net.
- No changes to `validatePhrase`, band-gating logic, or the JSON output schema.
