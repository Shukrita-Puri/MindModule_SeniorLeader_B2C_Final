
# Brief LLM Reliability Fix — Staged Plan

Scope: `compute-outer-readiness` + shared Anthropic helper only. No Plan, scoring, or prompt-contract changes in Phase 1.

## Phase 1 — P0 Infra Fixes (ship together, in isolation)

### A. Persist `llm_attempts` (stop discarding observability)

**File:** `supabase/functions/compute-outer-readiness/index.ts` (~line 5490)

- Remove the hard-coded `llm_attempts: null` on the `brief_snapshots` upsert.
- Build and persist a structured array across both attempts:
  ```
  llm_attempts: [
    { model, attempt, durationMs, outcome,
      rawReason, httpStatus, errorMessageHead }
  ]
  ```
  where `outcome ∈ {success, timeout, parse_error, validator_reject, http_error, error}`.
- On validator rejects, record the specific rule that fired (not just "rejected"):
  `word_ban:{token}` / `band_gate_violation` / `score_echoed` /
  `word_count_exceeded:{n}` / `phrase_duplicate_of_body` / `duplicate_of_yesterday`.
- Capture first ~200 chars of any thrown error as `errorMessageHead`.
- Stop overwriting `llm_fallback_reason` between attempts — preserve attempt-1's reason alongside attempt-2's.
- Confirm `brief_snapshots.llm_attempts` is `jsonb` (expected); no migration anticipated.

### B. Fix Claude fallback model id + add deploy smoke test

**File:** `supabase/functions/_shared/anthropic.ts` (line 13)

- Replace `CLAUDE_MODELS.SONNET = 'claude-sonnet-4-20250514'` with a current Anthropic model id verified against the live catalog at deploy time (do not guess from memory — verify the exact string that this workspace's `ANTHROPIC_API_KEY` can call).
- Add a one-time smoke test executed at function boot or in a small `_shared/anthropic-smoke.ts`:
  minimal `POST /v1/messages` with `max_tokens: 8`, log `[anthropic-smoke] model=<id> status=<n> ok=<bool>`. Non-fatal — log only, so a future stale id surfaces immediately in logs.

### Phase 1 Acceptance (verify within 24h of deploy)

- `brief_snapshots.llm_attempts` is a populated array on every new row.
- Deploy logs show `[anthropic-smoke] ok=true`.
- `select count(*) filter (where brief_source = 'llm') from brief_snapshots where created_at > now() - interval '24h'` > 0 (currently 0%).

---

## Phase 2 — Data Review (gate, no code)

After Phase 1 has been live 24h, pull `llm_attempts` and produce a written split:
- % timeout / parse_error / validator_reject (by rule) / http_error / success
- Broken down by Flash (attempt 1) vs Claude (attempt 2)

This output decides which of D1–D4 ship. Do not ship any D item the data doesn't support.

---

## Phase 3 — Prompt + Timeout Refinements (gated on Phase 2)

Bump `BRIEF_PROMPT_VERSION` in `_shared/brief-prompt-version.ts` only if any D item below ships, to invalidate cached snapshots.

- **D1 — Body ceiling 40 → 55–60 words** with explicit beat weighting (keep all four beats; shrink self-regulation to a 3–6 word closing clause). Edit the BODY contract in `_shared/brief/copy-vocabulary.ts`. *Ship if Phase 2 shows word-count/beat-compression rejects are frequent.*
- **D2 — Pair every word-ban with replacement vocabulary** ("settle / steady / hold your line / keep your edge / stay sharp / pace yourself / protect the next hour") in `copy-vocabulary.ts`. *Ship if Phase 2 shows wellness/clinical/tier word-bans are frequent reject causes.*
- **D3 — Corrective retry** (low-risk, likely ship regardless): feed the specific failed-rule from attempt 1 into the attempt-2 system prompt instead of a generic "be stricter" nudge. Requires A's per-rule logging.
- **D4 — Timeouts**: Flash 4s → 6–8s, Claude → ≥ Flash. *Ship if Phase 2 confirms timeout is a real Flash-side contributor post-B.*

---

## Explicit non-changes

- Plan engine, 24h horizon, scoring, tags/memory, slot allocator, practice selector, why-line generator — untouched.
- Deterministic-template removal + `READINESS_AWAITING_MESSAGE` frontend fallback — already shipped separately, remain as the silent safety net.
- No prompt-contract edits before Phase 2 data exists.

## Files touched

- Phase 1: `supabase/functions/compute-outer-readiness/index.ts`, `supabase/functions/_shared/anthropic.ts` (+ optional `_shared/anthropic-smoke.ts`).
- Phase 3 (gated): `supabase/functions/_shared/brief/copy-vocabulary.ts`, `supabase/functions/_shared/brief-prompt-version.ts`, retry/timeout blocks in `compute-outer-readiness/index.ts`.
