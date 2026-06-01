## Phase 1b — MRS v3 Refined-Score Path

Replace the legacy "inner score" surface with the two-state MRS (Baseline + Refined ±15), wire the 4 Mind Check-in dimensions into the score, and show the refined number + tier on Executive Home.

---

### 1. What the user sees

- The Executive Home hero number and tier label become the **Refined MRS** whenever a Mind Check-in exists for the current window; otherwise they stay on the Baseline MRS (today's behaviour).
- Refined never moves more than ±15 from baseline (hard cap per spec §3.3).
- Tier cap (`SUSTAINED_DEFICIT` / `CONSECUTIVE_LOAD`) keeps working — now applied to whichever score is being displayed.
- No visual redesign in this phase. Only the **number, tier label and pill state** can change after a check-in. Signal Pill v3 contributors are Phase 2.

---

### 2. Server: `compute-inner-readiness`

Add the refined-score branch alongside the existing baseline composer.

**New inputs (all optional, null = neutral):**
- `clarityLevel` *(reuse `clarity_level` 1–5)*
- `emotionLevel` *(`emotion_level` 1–5)*
- `pressureLevel` *(`pressure_level` 1–5, semantics already inverted at the slider)*
- `regulationLevel` *(`regulation_level` 1–5)*
- `hasImminentHighStakes` *(boolean — JIT cat A/B within next 6h)*

**Helpers:**
- `sliderToScore(v)` → `{1:10, 2:30, 3:55, 4:80, 5:100}`; `null` → returns the current baseline so the weighted contribution is zero.
- `getMindWeights(hasImminentHighStakes)` → `{ clarity, emotion, pressure, regulation }`. Base = `{11, 9, 5, 5}`. When imminent high stakes: shift 3% from Clarity to Regulation → `{8, 9, 5, 8}`. Sum is always 30.

**Formula (spec §3.3):**
```
weightedCheckIn = Σ ( sub_score_i × weight_i ) / 0.30
blended         = baseline × 0.70 + weightedCheckIn × 0.30
refined         = clamp( round(blended), baseline − 15, baseline + 15 )
contribution    = refined − baseline                              // −15..+15
state           = (all 4 dims null) ? 'baseline' : 'refined'
```
When state = `baseline`, `refined === baseline` and contribution = 0.

**Tier cap order:**
1. Compute `tierBaseline` from raw baseline score.
2. Compute `tierRefined` from raw refined score.
3. `deriveTierCap` runs on the **displayed** tier (= `tierRefined` when state is refined, else `tierBaseline`). Cap rules unchanged; physio-low guard still uses the same `physComposite` input.

**New response fields:**
```ts
{
  // Existing
  score,            // now = refined when present, else baseline (back-compat)
  tier, tierLabel, tierDisplayed, tierDisplayedLabel, tierCapReason,
  // New
  scoreBaseline,    // always present
  scoreRefined,     // null when state='baseline'
  readinessState,   // 'baseline' | 'refined'
  refinedContribution, // signed integer −15..+15, 0 when baseline
  mindWeights,      // echoed weights actually used
}
```
The `score` field keeps its current contract (displayed number) so no downstream consumer breaks; new fields are additive.

---

### 3. Server: `compute-outer-readiness`

- After the existing wearable / calendar fetches, read the **latest `daily_checkins` row for today** for this user (any time-window, latest `timestamp` wins) and pull `clarity_level / emotion_level / pressure_level / regulation_level`.
- Derive `hasImminentHighStakes` from the already-loaded calendar metrics: any classified event with category A or B starting within the next 6h in user-local time. Fall back to `todayHighStakes` proximity if classification isn't on the row.
- Pass the dims + flag through to `compute-inner-readiness` via the request body.
- Persist the new fields on `daily_context_snapshot` (see §4) inside the existing snapshot write.
- Continue echoing `tierDisplayed` / `tierCapReason` to the client; additionally echo `readinessState`, `scoreBaseline`, `scoreRefined`, `refinedContribution` so the client can render delta UI without re-deriving.

---

### 4. Database

Add three nullable columns to `daily_context_snapshot`:

| Column | Type | Purpose |
|---|---|---|
| `readiness_score_baseline` | `integer` | Raw State 1 score, always written. |
| `readiness_score_refined` | `integer` | State 2 score after ±15 cap. Null until first check-in of the window. |
| `readiness_state` | `text` | `'baseline'` or `'refined'`. |
| `refined_contribution` | `integer` | Signed −15..+15. |

`inner_score` and `inner_tier` are kept and now mirror the **displayed** score/tier (refined when present, else baseline) so legacy readers keep working. `tier_displayed` / `tier_cap_reason` columns from Phase 1a are unchanged.

No backfill — values populate on the next signal-assembly tick.

---

### 5. Client

- `useOuterReadiness` (`src/hooks/useOuterReadiness.ts`): forward the four `daily_checkins` dims to `compute-outer-readiness` (`clarityLevel`, `emotionLevel`, `pressureLevel`, `regulationLevel`). Expose the new echoed fields (`readinessState`, `scoreBaseline`, `scoreRefined`, `refinedContribution`) on the hook return.
- `energyStateEngine.ts`: pull the four dims from the latest `daily_checkins` row (it already reads `clarity_level`; extend the projection + interface). Surface the new score/state fields on the result.
- `ExecutiveHome` hero + `TodayStateCard`: `displayedScore = scoreRefined ?? scoreBaseline ?? overallBalance`; `displayedTier = tierDisplayed ?? tier`. No new visual elements — same hero, same pills, just driven by refined when available. The "+N / −N vs baseline" badge is **out of scope** for this phase (Signal Pills phase will own delta UI).

---

### 6. Tests

- New Deno tests in `compute-inner-readiness`:
  - All-null dims → `state='baseline'`, refined = baseline, contribution = 0.
  - All-5 dims → refined hits baseline + 15 cap.
  - All-1 dims → refined hits baseline − 15 cap.
  - `hasImminentHighStakes=true` → Regulation weight = 8%, Clarity = 8%, sum = 30%.
  - Pressure-only low (others null) → contribution within bounds and signed correctly.
- Update `compute-outer-readiness/redundancy.test.ts` cases that pass `clarityLevel/confidenceLevel` to additionally cover refined-score echoing without breaking.

---

### 7. Out of scope (later phases)

- Signal Pill v3 mind-dim contributors and `REGULATION_RISK`/`EMOTION_RESIDUE` divergence flags (Phase 2).
- Context split into Morning/Afternoon/Evening (Phase 3).
- Brief LLM phrase/body rebuild (Phase 4).
- New CEO-behaviour rule triggers from mind dims (Phase 2 alongside pills).
- Personal-baseline normalisation of the composite (rejected in revised spec).

---

### 8. Migration order

1. DB migration (3 new columns on `daily_context_snapshot`; types.ts will refresh automatically).
2. `compute-inner-readiness` — refined-score branch + new response fields.
3. `compute-outer-readiness` — fetch dims, derive imminent flag, pass through, persist, echo.
4. Client hook + engine — forward dims, consume echoes.
5. Hero / TodayStateCard — prefer refined score & tier.
6. Tests — Deno + verify build.

Each step is independently shippable; the older `score` contract is preserved throughout.