## Scope

Isolated change to `supabase/functions/_shared/jit/select-jit.ts` (with one small addition in `tactical-signals.ts`) to bring scoring in line with §11A of the spec. No changes to category ladder, interview classifier, crisis detector, MIN_IMMEDIATE threshold, tier weights, or the existing test fixtures' intent — only the *composition* of how Immediate, Sovereign, the JIT floor, and MemoryDelta combine.

Eight sub-changes, each small and surgical.

---

### 1. Hoist user-tagged relationships out of Immediate into Sovereign

Today: `weightedDominantRole(signals).weight` (`rel`) flows straight into `immediate = categoryBase + rel + stakes + interview`, with the same weight regardless of source (user_tag, memory_user_tag, llm, domain_heuristic). That double-counts user_tag rels (they get full Immediate weight AND are intended to live above tier weighting).

Change:
- Split the resolved attendee role into two terms:
  - `relationship_sovereign` = sum of `RELATIONSHIP_WEIGHT[role]` for signals whose `source ∈ {user_tag, memory_user_tag}`, capped at 25, no confidence discount.
  - `relationship_inferred` = `weightedDominantRole` restricted to `source ∈ {llm, domain_heuristic}`, using the existing confidence multipliers in `relationship-weights.ts` (Layer 3: ≥0.75→1.0, ≥0.5→0.6, <0.5→0.3; Layer 4: flat 0.3). Capped at 25 before multiplier.
- `immediate = categoryBase + relationship_inferred + stakes + situationalBoost`.
- `relationship_sovereign` is added to `sovereign.bonus` (so it escapes tier weighting), but it stacks with the existing importance bonus (no replacement).

### 2. `relationshipLeads` reads the effective value

Today the flag reads `rel` (the in-Immediate value). After (1) that residual is zero for sovereign-hoisted relationships, which would silently turn the flag off.

Change: compute `effectiveRel = relationship_inferred + relationship_sovereign` and set `relationshipLeads = (no user importance tag) AND effectiveRel ≥ 15`. (The clause "no user-declared relationship tag" in spec resolves to: no `tags.includes('high'|'medium'|'low')` AND no user_tag-sourced rel signal — keep the current "no tags" proxy as the simpler test-friendly form, but use `effectiveRel`.)

### 3. JIT floor fix (Decision 10)

Today (line 442): `if (immediate < MIN_IMMEDIATE) excluded.push('below_min_immediate')` — gates on immediate alone, evicting mature-tier events whose value sits in Tactical.

Change: gate on `(immediate ≥ MIN_IMMEDIATE) OR (tactical ≥ MIN_IMMEDIATE) OR (tierWeighted ≥ MIN_IMMEDIATE)`. Sovereign-High (`sovereign.bonus ≥ 45`) bypasses the gate entirely (already implicit through tierWeighted but make explicit). Exclusion reason renamed `below_jit_floor`.

Order: compute `tactical` and `tierWeighted` before the floor check (today tierWeighted is computed after — move it up).

### 4. Rename `interviewBoost` contribution to `situationalBoost`

The §7 framing wraps media/hiring/crisis under one term. Crisis already exits before scoring, so situationalBoost in scoring is just the interview boost — but the spec wants this exposed under the right name and gated to `attendeesCount ≥ 2` (today gated to `≥ 1`).

Change:
- Add an `attendeesCount >= 2` minimum inside `classifyInterview` (currently `< 1`); a 1-attendee "interview" returns `'none'`. Solo prep blocks already excluded by personal-noise / no-attendee gate.
- Surface in `components.breakdown` as `situationalBoost` (currently merged into `stakes + interview` on line 488). Split into separate `stakes` and `situationalBoost` fields.

### 5. MemoryDelta term (reads derived state)

Today there is no MemoryDelta in `select-jit.ts` — the legacy `event_priority_memory` is applied upstream in `rankJitCandidates`. Per §11A.6 it must apply post-tier-weighting inside the importance score.

Change:
- Add `memoryDeltaByEventId?: Record<string, { delta: number; hardDemote?: boolean; sovereignEscalation?: 'low' }>` to `SelectContext`. Pure data — caller (generate-mastery-plan/index.ts) loads from the existing derived store and passes in; this file stays pure.
- After computing `tierWeighted`: `importance = tierWeighted + sovereign.bonus + memoryDelta.delta`.
- `memoryDelta.hardDemote === true` → push to excluded with reason `memory_hard_demote` (mirrors `rankJitCandidates` behaviour).
- `memoryDelta.sovereignEscalation === 'low'` → treat as sovereign-low (sink behaviour piggybacks on existing `sovereign.demote` path; add new exclusion reason `memory_escalated_low`).
- Surface in `components` as `memoryDelta: number`.

No DB call here — only the contract; the loader in `generate-mastery-plan/index.ts` is a follow-up (out of scope for this file change).

### 6. Sovereign relationship bonus contract

Extend `sovereignTagAdjustment` consumers, not the function itself. In `select-jit.ts`:

```ts
const sovereign = sovereignTagAdjustment(ev.tags);
const sovereignBonus = sovereign.bonus + relationship_sovereign;
const sovereignDemote = sovereign.demote;
```

`importance = tierWeighted + sovereignBonus + memoryDelta.delta`.

### 7. Final sort — confirm only

Current sort (line 502): importance → tactical → strategic → minutesUntilStart. Matches §11A.7. No change. Add a one-line comment citing Decision 9 so future edits don't reintroduce urgency into points.

### 8. `SelectedCandidate.components` shape additions

Add to `breakdown`:
- `relationship_inferred: number`
- `relationship_sovereign: number`
- `situationalBoost: number` (split from `stakes + interview`)
- `memoryDelta: number`

Rename top-level `sovereignBonus` to keep including both importance-tag and hoisted-relationship contributions (single field, sum of both). Add adjacent `sovereignRelationship: number` for observability.

These are additive shape changes only — no consumer of `components.breakdown` outside tests should break, but grep call sites:

```
rg -n "components\.breakdown|sovereignBonus|relationshipLeads" supabase/functions src
```

Update any UI/log consumer that reads `stakes` to read `stakes + situationalBoost` if it wants the combined number.

---

## Files touched

- `supabase/functions/_shared/jit/select-jit.ts` — sub-changes 1–8.
- `supabase/functions/_shared/jit/select-jit.test.ts` — update existing baselines for the split shape; add 5 new tests:
  1. `user_tagged_board_member_hoists_out_of_immediate` — same event with role tagged user_tag vs llm: identical importance total, but Immediate is 25 lower in the user_tag case, sovereign 25 higher.
  2. `inferred_relationship_confidence_discount` — Gemini conf 0.6 produces `rel × 0.6`, not full weight.
  3. `jit_floor_passes_on_strong_tactical_alone` — Immediate < MIN, Tactical ≥ MIN, event ranked (not excluded).
  4. `relationshipLeads_reads_hoisted_value` — user_tag board (rel zeroed inside Immediate) still sets `relationshipLeads = true`.
  5. `memory_hard_demote_excluded` — `memoryDeltaByEventId[id].hardDemote` evicts with reason `memory_hard_demote`.
- `supabase/functions/_shared/jit/tactical-signals.ts` — no logic change; if a `sovereignEscalation` helper is preferred over passing in the conclusion pre-derived, add it here. Default plan: keep derivation upstream, pass in.

## Out of scope

- Loader changes in `generate-mastery-plan/index.ts` to populate `memoryDeltaByEventId` from the derived-state table (follow-up plan).
- Any changes to `rankJitCandidates`, `enrichEvent`, tier weights, MIN_IMMEDIATE value, crisis detector, category ladder, interview detection heuristics.
- The §10 sink-now/hide-future UX behaviour for sovereign-low (today's single-line `excluded` path stays; UX is a separate layer).
- Schema for the derived-state table itself.

## Risk

Low. All changes are inside one pure function. Existing 17 tests need baseline updates for the breakdown shape only; ranking order on legacy fixtures is unchanged because (a) the only tests that use `attendeeRoles` pass them as `ResolvedRole[]` which normalises to `source: 'llm', confidence: 1` — identical numeric output to today, and (b) the JIT floor only loosens, never tightens, so previously-ranked events stay ranked.
