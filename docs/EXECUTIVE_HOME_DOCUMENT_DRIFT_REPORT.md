# Executive Home Document Drift Report

**Purpose:** identify where the older Executive Home docs are outdated and state the current code-level reality.

**Compared documents:**

- `EXECUTIVE_HOME_CARDS_FINAL_WIRING_GUIDE-2.md`
- `EXECUTIVE_HOME_CARDS_FINAL_SSOT-2.md`

**Codebase date used:** 2026-07-15

## Summary

The older Executive Home documents are no longer fully aligned with the live implementation.

There are three broad classes of drift:

1. features the docs say are missing, but now exist
2. behaviors the docs describe as target-state, but are now partially or fully implemented
3. behaviors the docs present as settled, but the code still contains transitional fallback paths or incomplete migration work

This report separates those cases so engineering and product do not mistake document age for a live defect.

## 1. Features The Docs Marked Missing, But Now Exist

### 1.1 `build-executive-home-cards`

**Older doc claim**

- The orchestrator did not exist yet and was still target-state.

**Current code reality**

- The orchestrator exists and is active at:
  - `supabase/functions/build-executive-home-cards/index.ts`
- It supports:
  - `scheduled`
  - `manual_refresh`
  - `manual_replay`
  - `backfill`
  - `dry_run`
- It also normalizes:
  - `checkin_save -> manual_refresh`

**What is new**

- The Executive Home build is now a real per-window orchestration path, not just a proposed architecture.

### 1.2 `travel-state-sync`

**Older doc claim**

- `travel-state-sync` did not exist yet.

**Current code reality**

- The producer exists at:
  - `supabase/functions/travel-state-sync/index.ts`
- It is also configured in:
  - `supabase/config.toml`

**What is new**

- Travel-state production is now live and feeds downstream timezone/travel logic.

## 2. Prompt Version Drift

### 2.1 Brief prompt version

**Older doc claim**

- Frontend/backend Brief prompt version was `v6.5-no-deterministic-fallback`.

**Current code reality**

- Frontend:
  - `src/constants/briefPromptVersion.ts`
- Backend:
  - `supabase/functions/_shared/brief-prompt-version.ts`
- Both now use:
  - `v6.6-replacement-vocabulary`

**What is new**

- The code is aligned on a newer prompt version than the older docs describe.

## 3. Brief Validation Drift

### 3.1 Four-beat body contract

**Older doc claim**

- The Brief four-beat contract was prompt-instructed but not validator-enforced.

**Current code reality**

- Structural four-beat validation exists in:
  - `supabase/functions/_shared/brief-validators.ts`
- The function:
  - `validateBodyFourBeatStructure(...)`
- It is called by:
  - `validateBody(...)`

**What is new**

- The body contract is no longer prompt-only.
- The validator now checks structure in addition to evidence and language rules.

### 3.2 Body length wording

**Older doc claim**

- The older docs discuss a transition from a shorter ceiling and treat the updated limit as pending or recently corrected.

**Current code reality**

- The live validator already enforces the newer longer ceiling.
- This is no longer an open migration item.

**What is new**

- The live code has already moved past the historical word-limit transition described in the older docs.

## 4. `mindset.pause` Drift

### 4.1 Practice selector routing

**Older doc claim**

- `mindset.pause` was only wired through the event-phase path and not through the state intent ladder.

**Current code reality**

- `deriveSlotIntent(...)` in:
  - `supabase/functions/_shared/plan/practice-selector.ts`
- now has an explicit state-based branch for:
  - pre-decision clarity
  - detachment
  - decision fatigue
  - reactive-thinking recovery
  - direct `mindset.pause` combo requests

**What is new**

- `mindset.pause` is no longer event-phase-only.
- The selector has a real state-based path for it now.

## 5. Rest-Day Allocation Drift

### 5.1 Slot allocator behavior

**Older doc claim**

- Rest day still emitted three state slots instead of zero.

**Current code reality**

- `allocatePlanSlots(...)` in:
  - `supabase/functions/_shared/jit/slot-allocator.ts`
- now returns:
  - `restDay: true`
  - `slots: []`
- for a true rest day.

**What is new**

- The allocator no longer fabricates three priorities on a true rest day.

## 6. MRS WoW Drift

### 6.1 Composition mismatch suppression

**Older doc claim**

- Some earlier sections described the composition-mismatch bug as unresolved or under verification.

**Current code reality**

- The suppression guard exists in:
  - `supabase/functions/mental-fitness-scores/index.ts`
  - `src/hooks/useWeeklyMrsDelta.ts`
- WoW is suppressed for:
  - `composition_mismatch`
  - `awaiting_signals`
  - `not_enough_history`

**What is new**

- The symmetric composition guard is implemented now.

## 7. Current Snapshot Architecture Changes

### 7.1 Brief snapshot-read-first

**Older doc state**

- Snapshot use was described more generically and not always with the newer read-first split.

**Current code reality**

- Current read-first Brief path lives in:
  - `src/hooks/useCurrentBriefSnapshot.ts`
  - `src/components/home/DecisionReadinessBrief.tsx`
- The UI prefers the current-window snapshot when renderable.

**What is new**

- Brief snapshot-read-first is now real.

**Important current limitation**

- It is still not fully snapshot-only.
- The hook itself documents that wearable/source provenance is not fully reconstructable from `brief_snapshots` alone.
- The Brief UI still overlays snapshot data onto live `useOuterReadiness`.

### 7.2 Plan snapshot reader

**Older doc expectation**

- Some sections imply a stricter current-window contract.

**Current code reality**

- `get-mastery-plan-snapshot` uses this precedence:
  1. current-window ready
  2. latest same-date ready
  3. current-window awaiting
  4. latest same-date awaiting

**What is new**

- Cross-window fallback is an intentional live behavior and is explicitly logged.

## 8. Current Fallback Paths The Older Docs Do Not Represent Well

### 8.1 Brief deterministic support still exists

**Older doc expectation**

- The deterministic Brief fallback was described as removed or effectively gone.

**Current code reality**

- The code still contains deterministic Brief support inside:
  - `supabase/functions/compute-outer-readiness/index.ts`
- The system is stricter than before, but the deterministic path still exists.
- `brief_source` can still be:
  - `deterministic`

**What is new**

- The newer code is not “old behavior unchanged,” but it is also not “deterministic support fully deleted.”
- The live state is transitional: deterministic support exists, cache replay ignores deterministic rows, and awaiting logic is stronger.

### 8.2 Plan local Brief-behavior rebuild still exists outside strict path

**Older doc expectation**

- Plan must not recompute behavior and should always consume the Brief snapshot.

**Current code reality**

- `generate-mastery-plan` still allows a local rebuild fallback when:
  - `strictBriefHandshake !== true`
- The strict no-rebuild rule is only fully enforced on the orchestrated Executive Home path.

**What is new**

- Parity is strong on the main path, but not universal across every caller.

## 9. Current Live Gaps The Docs Still Point To Correctly

These are not just document drift. They remain real implementation gaps.

### 9.1 Plan lineage fields remain incomplete

**Schema supports**

- `brief_snapshot_id`
- `source_context_snapshot_id`

**Current writer reality**

- `generate-mastery-plan` still writes:
  - `brief_snapshot_id: null`
- `source_context_snapshot_id` is not populated here.

### 9.2 Brief snapshot-only migration is incomplete

**Current reality**

- Snapshot read-first exists, but full ownership by snapshot is not complete yet.

### 9.3 Cross-window fallback remains live

**Current reality**

- Plan read fallback across windows is still part of the live contract.

### 9.4 Universal strict Brief-to-Plan parity is incomplete

**Current reality**

- Orchestrated path is strict.
- Legacy/non-strict callers can still trigger local rebuild fallback.

## 10. Recommended Interpretation

Use the older docs for historical intent only.

Use the regenerated docs for current implementation truth:

- `docs/EXECUTIVE_HOME_CARDS_REGENERATED_WIRING_GUIDE.md`
- `docs/EXECUTIVE_HOME_CARDS_REGENERATED_SSOT.md`

Use this drift report when someone asks:

- what in the old docs is no longer true
- what is actually live now
- which items are genuine remaining engineering gaps versus simple documentation lag

## 11. Short Version

Outdated in the older docs:

- orchestrator missing
- travel-state-sync missing
- four-beat Brief validation not enforced
- old prompt version
- `mindset.pause` only partial
- rest-day still creates 3 slots
- WoW composition guard still missing

Current live truth:

- orchestrator exists
- travel-state-sync exists
- four-beat Brief validation exists
- prompt version is `v6.6-replacement-vocabulary`
- `mindset.pause` has a state-based path
- true rest day returns zero slots
- WoW composition suppression exists

Still real gaps:

- Plan lineage fields incomplete
- Brief snapshot-only migration incomplete
- Plan cross-window fallback still live
- universal strict Brief-to-Plan parity not finished
