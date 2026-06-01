
# MRS v3 — Revised Scoring Architecture (replaces §3 of `docs/MRS_V3_SPECIFICATION.md`)

## 1. Principle

MRS answers one question only:

> **"Right now, can this CEO meet the demands immediately ahead?"**

That is an **immediate-capacity** question. Patterns answer a different question — *"is today normal for them, and are they running a debt?"* — which belongs in framing and risk, not in the number. Mixing the two lets chronic low-scorers (e.g. a CEO in budget week or vision-setting week) **mask a genuine acute crash**, which is the exact failure mode MRS exists to prevent.

## 2. State 1 — Baseline score (revised)

| Pillar | Weight | Source |
|---|---|---|
| Physiological composite (HRV 50% / Sleep 35% / RHR-trend 15%) | **65%** | `wearable_data` via `computePhysiologicalComposite()` |
| Calendar demand score (0–100, inverted: higher demand → lower contribution) | **35%** | `calendar_events` via `demand-scorer` |
| ~~Pattern signals~~ | **0% — removed** | Moved to §4 (Context Layer) |

Cold-start tiers shift to the new split:

- Wearable <7d → **30% physio / 70% demand**
- Wearable 7–13d → **55% physio / 45% demand** (`sustained_deficit` suppressed; see §4)
- Wearable ≥14d → **65 / 35** (full)

## 3. State 2 — Refined score (unchanged)

State 2 still blends State 1 (70%) with the 4 Mind Check-in dimensions (30%), hard-capped at **±15** from baseline. No change to mind-dim weights (Clarity 11% / Emotion 9% / Pressure 5% inverted / Regulation 5%, or 8% when `has_imminent_high_stakes`).

## 4. Pattern signals — promoted to Context Layer

Patterns are now **read alongside** the score, not folded into it. Three jobs:

### 4a. Risk flags (write to `divergence_flags`)
The existing six-flag set is retained and now carries all pattern-driven semantics:
- `SUSTAINED_DEFICIT` (renamed from MRS v2 `RECOVERY_UNDERWAY` when 2+ consecutive days HRV below personal baseline)
- `CONSECUTIVE_LOAD` (3+ days high-demand calendar)
- `LIGHT_DAY_STRONG_STATE`, `EMOTION_RESIDUE`, `REGULATION_RISK`, `ALIGNED`

### 4b. Tier-display cap (the "soft guard")
This is how patterns *guide* the score without distorting it:

- If `SUSTAINED_DEFICIT` is active **and** today's physio composite is in the Mixed/Strong range (50–84), the **displayed tier is capped at "Mixed"**. Score number stays honest; tier label and pill colour reflect chronic debt.
- If `SUSTAINED_DEFICIT` is active **and** today's physio is already Low (<50), no cap is needed — the acute reading already tells the truth. **This is the key invariant**: the cap can never *raise* a low score and never *hide* an acute crash. A budget-week CEO who finally crashes still sees the crash; a budget-week CEO whose body is coping reads as Mixed (not Strong), with the debt visible in flags.
- `CONSECUTIVE_LOAD` ≥4 days applies the same cap.
- Cap is **never** applied during the first 14 days post-wearable-connect (cold-start safety).

### 4c. Brief framing
LLM brief receives the divergence flag list and renders the "why" of any cap (e.g. *"Score reads Mixed today despite a strong morning — 3rd day with HRV below your norm"*). No deterministic post-processing.

## 5. Personal baselining — decision

| Layer | Decision | Reason |
|---|---|---|
| HRV / Sleep / RHR sub-scores | **Already deviation-from-personal-baseline. Keep as-is.** | Physio composite is implicitly personalized — "their 70 = above their norm". |
| Composite (pre-blend) | **Do NOT additionally normalize against the user's 30-day MRS distribution.** | Doing so reintroduces the exact masking the user is rejecting: a chronic low-scorer's bad day would round up to "normal for them". |
| Pattern context | **All personal-vs-personal comparison lives in flags + brief**, never in the number. | Preserves immediate-capacity honesty. |

## 6. Schema delta vs the previous v3 spec

- `daily_context_snapshot`
  - `readiness_score_baseline` — formula changes to 65/35 physio/demand
  - **NEW** `tier_displayed` text (the post-cap tier shown in UI)
  - **NEW** `tier_cap_reason` text nullable (`SUSTAINED_DEFICIT` | `CONSECUTIVE_LOAD` | null)
  - `pattern_tactical_aggregates` — retained, but consumed only by flag-builder and brief, **never** by score composer
- `jit_event_context` — unchanged
- `daily_checkins` — unchanged

## 7. Code surface affected

- `supabase/functions/compute-inner-readiness/index.ts` — drop `patternContribution` from baseline composer; add tier-cap step after score → tier mapping.
- `supabase/functions/_shared/signal-engine/pattern-engine.ts` — keep emitting trends + flags; remove the `patternScoreContribution` export and its consumers.
- `supabase/functions/_shared/signal-engine/divergence-flags.ts` — add `tier_cap_reason` derivation alongside flag emission.
- `supabase/functions/compute-outer-readiness/index.ts` — Signal Pills already consume flags directly; no math change needed, only read `tier_displayed` instead of recomputing tier from raw score.
- `supabase/functions/smart-nudges/index.ts` — already baseline-only; no change.
- `supabase/functions/generate-brief-v6/index.ts` — receives new `tier_cap_reason` so it can author the "why" sentence; `prompt_version → v6.3` (already planned).
- UI — reads `tier_displayed` instead of deriving tier from `readiness_score_baseline` in `ReadinessHero.tsx`, `SignalPills.tsx`.

## 8. Docs & memory

- Rewrite §3 and §7 of `docs/MRS_V3_SPECIFICATION.md` with the above.
- Update `mem://architecture/readiness-scoring-weights-v3` body to: "Baseline 65/35 physio/demand. Patterns are context-only: flags + tier-cap + brief framing. Cap can never raise a score or hide an acute crash."
- `mem://index.md` Core line for readiness scoring stays pointing at the same memory slug.

## 9. Out of scope

- Refined-score formula and ±15 cap — unchanged.
- Signal Pill v3 mind-dim contributors — unchanged from the prior plan.
- Context split (Morning/Afternoon/Evening) — still Phase 3, unaffected by this revision.
- Brief LLM rebuild — still Phase 4.
- No data backfill required; baseline scores will simply re-compute on the next cron tick.

## 10. Implementation order (unchanged)

1. **Phase 1a (this plan):** schema delta + rewrite baseline composer + tier-cap step + UI reads `tier_displayed`.
2. Phase 1b: refined-score path (already specified).
3. Phase 2: Signal Pills v3.
4. Phase 3: Context split.
5. Phase 4: Brief LLM rebuild.
