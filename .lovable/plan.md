## P0 Fix — Readiness Source Contract, Brief LLM Reliability, Signal Pill Gating

This is a multi-area backend + frontend change. Doing it as one atomic pass so the contract holds end-to-end. Plan first because the scope is large and several changes touch hot paths (Brief generation, MRS, Plan gating).

### Root-cause hypotheses (to verify in step 1)
1. **False "Full Read" at 53/100**: `compute-outer-readiness` (and/or `useOuterReadiness`/MrsPage) is downgrading `readinessState` from `refined` → `baseline` only on the **score-bearing** path, but the **label/state** sent to the UI still resolves to `refined` because some consumer reads `brief_snapshots.refined_*` columns without re-checking `wearableStatus`. Frontend `getReadinessStateLabel('refined', false)` correctly says "Full read" — i.e. the bug is upstream: state is `refined` when wearable is not fresh.
2. **Mixed pill states** (one "REFINED", one "BASELINE", one "REFINED"): pills are built per-signal without a unified `isScoreBearing` gate; some derive freshness from check-in alone.
3. **"No signal detail yet" detached**: collapsible detail panel is keyed to a stale/empty pill index when pills are filtered.
4. **Deterministic Brief copy** ("Close strong.", "Steady the system…", "protecting the edge"): hardcoded fallback strings in `compute-outer-readiness` / `_shared/brief/copy-vocabulary.ts` are rendered when LLM fails, instead of returning awaiting state.
5. **Claude fallback 404**: `CLAUDE_MODELS.SONNET` was already corrected to `claude-sonnet-4-5-20250929` (verified in `_shared/anthropic.ts`); smoke test exists. Need to confirm no other call site hardcodes the old id.
6. **`llm_attempts` discarded**: `brief_snapshots.llm_attempts` column may not exist or is never written; need migration + write path.

### Phase 1 — Investigate (no code changes)
- Grep all references: `getReadinessStateLabel`, `wearableFresh`, `readinessState`, `refined`, `baseline`, signal pill builders, `compute-outer-readiness` payload shape, `useOuterReadiness`, `MrsPage`, `DecisionReadinessBrief`, Signal Pill components.
- Inspect `brief_snapshots` schema for `llm_attempts` column.
- Confirm where pill `sourceType` / `isScoreBearing` is (or isn't) computed.
- Confirm deterministic fallback strings and where they're emitted.
- Confirm `compute-inner-readiness` already gates `refined → baseline` on `wearableStatus !== 'fresh'` (done in earlier pass) — verify `compute-outer-readiness` honours that and that the Brief LLM path is gated the same way.

### Phase 2 — Backend source-of-truth contract
**File: `supabase/functions/compute-outer-readiness/index.ts`** (and shared helpers)
- Add a single helper that returns:
  ```ts
  readinessEligibility: {
    wearableFresh: boolean;
    checkInFresh: boolean;
    mode: 'awaiting_signals' | 'early_read' | 'full_read';
    scoreCanUpdate: boolean;       // = wearableFresh
    checkInCanRefine: boolean;     // = wearableFresh && checkInFresh
    reason: string;
  }
  ```
- Use it as the only branch point for: emitting score, building Brief, emitting pills, persisting `brief_snapshots`.
- **No wearable**: short-circuit. Persist check-in if present, but do **not** write a new score-bearing `brief_snapshots` row; emit `mode: awaiting_signals` with awaiting copy from `src/constants/awaitingSignals.ts` mirror in shared.
- **Wearable only**: build wearable-derived score + Brief; pills tagged `sourceTypes: ['wearable'], isScoreBearing: true`.
- **Wearable + check-in**: full refined path; pills that consumed check-in tag `sourceTypes: ['wearable','checkin']` and populate `detail` with the check-in context line.
- Add `sourceTypes`, `isScoreBearing`, `freshness`, `hiddenReason`, `detail` to every emitted pill.
- Stale wearable (>X hrs in user TZ) treated as `wearableFresh=false`. Never as fresh.

**File: `supabase/functions/compute-inner-readiness/index.ts`**
- Verify the previous gate is intact. If anything still emits `state: 'refined'` when `wearableStatus !== 'fresh'`, harden.

### Phase 3 — Brief LLM reliability
**Files:** `compute-outer-readiness/index.ts`, `_shared/anthropic.ts`, `_shared/brief/copy-vocabulary.ts`, `_shared/brief-prompt-version.ts`
- **Remove deterministic personality fallback.** When all LLM attempts fail, return awaiting copy (or null) and set `brief_source: 'awaiting'` or `'llm_failed'`. Never render "Close strong.", "Steady the system…", "protecting the edge".
- **Persist `llm_attempts`** — every attempt pushed to an array with `{ model, attempt, durationMs, outcome, rawReason, httpStatus, errorHead, validatorReject }`. Written to `brief_snapshots.llm_attempts jsonb`.
- **Migration**: `ALTER TABLE brief_snapshots ADD COLUMN IF NOT EXISTS llm_attempts jsonb;` with GRANT preserved.
- **Prompt tightening**: max 60-word body, target 45-55, four beats (evidence, read, work directive, self-regulation), banned/preferred vocab pairs, retry includes the literal validator-failure reason.
- **Timeouts**: Gemini Flash attempt 1 → 7s; Claude fallback → 8s.
- **Bump `BRIEF_PROMPT_VERSION`** to invalidate cached bad snapshots.
- Confirm `CLAUDE_MODELS.SONNET = 'claude-sonnet-4-5-20250929'` is the only Claude id used; smoke test stays.

### Phase 4 — Frontend
**Files (to confirm):** `src/components/home/mrs/MrsPage.tsx`, `src/components/home/DecisionReadinessBrief.tsx`, signal-pill component (`src/components/.../SignalPills.tsx`), `src/hooks/useOuterReadiness.ts`, `src/utils/readinessLabels.ts`.
- Prefer `payload.readinessEligibility.mode` for label.
- Derived fallback: never produce `full_read` from check-in alone; never produce `early_read` without `wearableFresh`.
- Label table:
  - `awaiting_signals` + no check-in → "Awaiting signals · sync your wearable and check in"
  - `awaiting_signals` + check-in present → "Check-in received · awaiting wearable signals"
  - `early_read` → "Early Read · check in to sharpen it"
  - `full_read` → "Full Read · with your check-in"
- Signal pills: render only pills with `isScoreBearing: true` when scoring is active. Suppress refined pills when `!wearableFresh`. Collapsible detail keyed to the selected pill id (not list index) — fixes the misaligned "No signal detail yet".
- Show check-in detail string inside pill collapsible only when `sourceTypes` includes `'checkin'` and `detail` is non-empty.
- Plan/MRS/Brief surfaces respect `scoreCanUpdate`; cached horizon modules from previous days are clearly labelled or hidden under awaiting state.

### Phase 5 — Tests
Add to `supabase/functions/compute-outer-readiness/*.test.ts` and `src/utils/readinessLabels.test.ts` covering the full matrix:
- no wearable + no check-in
- no wearable + check-in
- stale wearable + check-in
- fresh wearable + no check-in
- fresh wearable + check-in
- LLM failure (`llm_attempts` populated, no deterministic copy)
- Claude model smoke

### Out of scope
- Plan algorithm internals (only display gating).
- B4 resolver, scoring math, slot allocator, practice selector, why-line.
- Wearable ingestion / Oura cron.

### Risks
- `brief_snapshots` schema change requires migration + GRANT.
- Removing deterministic fallback may briefly increase visible "awaiting" surfaces if LLM is flaky — acceptable per spec.
- Prompt version bump invalidates today's cached briefs (intended).

### Deliverable
Final report with: files changed, root-cause confirmation, test/log proof for each matrix row, migration applied, residual risks.

---
**Approve to proceed?** Once approved, I'll execute Phases 1→5 in one pass and return the acceptance report.