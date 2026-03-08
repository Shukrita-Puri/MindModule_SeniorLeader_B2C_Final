

# Inner Readiness + Outer Readiness Brief — Full Technical Status Report

## Summary: Both features are correctly updated and operationally healthy.

---

## 1. Sensitive Logic Protection — Confirmed

All proprietary scoring, theme matrices, and copy generation logic resides exclusively in edge functions. Zero scoring logic on the client.

| Logic | Location | Client-side? |
|---|---|---|
| Felt State scoring weights | `compute-inner-readiness` (line 9-15) | No |
| C+C → IR score formula | `compute-inner-readiness` (line 18-20) | No |
| Circadian scoring | `compute-inner-readiness` (line 23-27) | No |
| Wearable/HRV scoring + divergence | `compute-inner-readiness` (lines 36-56) | No |
| Composite weighting modes (4 modes) | `compute-inner-readiness` (lines 317-330) | No |
| 3-layer context statement assembly | `compute-inner-readiness` (lines 90-257) | No |
| 40-theme matrix (phrase + context) | `compute-outer-readiness` (lines 61-232) | No |
| Lean On / Watch For priority cascade | `compute-outer-readiness` (lines 421-496) | No |
| Pattern recognition (3+ day streaks) | `compute-outer-readiness` (lines 498-551) | No |
| "Strength without clarity" override | `compute-outer-readiness` (lines 641-654) | No |

**Client-side files** (`energyStateEngine.ts`, `energyStateScoring.ts`, `StrategicIntentionCard.tsx`, `TodayStateCard.tsx`) are thin orchestrators/renderers with no scoring formulas. Confirmed via codebase search — `getFeltStateScore`, `getCircadianScore`, `getWearableScore`, `getIRScore` return zero matches in `src/`.

---

## 2. C×C Independent Signal Logic — Both Functions Updated

### Inner Readiness (`compute-inner-readiness`)
`getCCModifier` (lines 147-216) evaluates Clarity and Confidence independently with 12 patterns:
- Patterns 1-7: Low clarity combinations (with time-of-day awareness)
- Patterns 8-12: High/mid combinations including outcome-dependent mid-range modifiers
- `steady` at mid/mid correctly returns `null` (Layer 1 sufficient)

### Outer Readiness (`compute-outer-readiness`)
`getCCModifier` (lines 277-351) evaluates independently with 8 Lean On/Watch For patterns:
- Pattern 1: Low clarity + High confidence
- Pattern 2: High clarity + Low confidence
- Pattern 3: Both low
- Pattern 4: Both high
- Patterns 5-8: Single-signal triggers (low clarity only, low confidence only, high clarity only, high confidence only)
- Mid/mid returns `null` — falls through to archetype/tier

Both functions use `clarity <= 2` / `clarity >= 4` thresholds (not averaging). The old `(c + conf) / 2` averaging logic has been fully removed from both edge functions.

---

## 3. Outer Readiness Priority Cascade — Correctly Implemented

The `getLeanOnWatchFor` function (lines 421-496) follows the specified priority order:

| Priority | Condition | Status |
|---|---|---|
| 0 | Sunday evening (after 9pm) | Implemented (line 436) |
| 1 | Coach insights with recency check (≤3 days fresh, >3 days checks contradiction) | Implemented (lines 441-467) |
| — | Partial coach (only strength or only growth) mixed with C×C/archetype | Implemented (lines 472-479) |
| 2 | C×C independent modifier | Implemented (line 482) |
| 3 | Evening recovery (weekdays after 9pm) | Implemented (lines 485-487) |
| 4 | Archetype × Tier matrix | Implemented (lines 490-492) |
| 5 | Tier fallback | Implemented (line 495) |

---

## 4. DB Reads/Writes — Verified

### Inner Readiness
- **Reads**: Today's check-in via `daily-checkins` edge function (clarity, confidence, outcome)
- **Writes**: Composite score persisted to `daily_checkins.energy_balance` with retry guardrail (6 retries over 30 min)

### Outer Readiness
- **Reads**: `user_coach_insights` (strength, growth_area, `created_at` — added for recency check), `daily_checkins` (last 7 days with `clarity_level`, `confidence_level` — added for pattern detection)
- **Writes**: Upserts to `daily_themes` table (phrase, driver, lean_on, watch_for, inner_readiness_score, archetype, calendar data)

### Downstream Consumers (confirmed reading from `daily_themes`):
1. `insights-semantic-analysis` edge function
2. `state-patterns-insights` edge function
3. `LeadershipPatternsCard.tsx` component

---

## 5. Bugs / Issues Found

### No critical bugs. Two minor observations:

**Observation A: Edge function logs are empty.** No recent invocations recorded — this means either: (a) no user has triggered these functions recently, or (b) logs have rotated. Not a bug, but worth noting for monitoring.

**Observation B: Pattern override persists original theme phrase, not the overridden one.** In `compute-outer-readiness` line 670, `theme_phrase: theme.phrase` is stored in `daily_themes`, but if a pattern override or "Strength without clarity" override fires, `finalPhrase` (line 644) is different from `theme.phrase`. The stored value in DB will be the original matrix phrase, not the override. This affects downstream consumers reading `theme_phrase` from `daily_themes`.

This is a minor data fidelity issue — the user sees the correct override in the UI (the response returns `finalPhrase`), but the DB record and downstream analytics may reference the wrong phrase.

**Fix:** Change line 670 from `theme_phrase: theme.phrase` to `theme_phrase: finalPhrase` and line 671 from `theme.driver` stays (driver doesn't change with overrides). Similarly, the context stored should be `finalContext` not `theme.context` (though it's already using `theme.context` indirectly via the upsert).

---

## Recommended Fix

One small change in `compute-outer-readiness/index.ts`:
- Line 670: `theme_phrase: theme.phrase` → `theme_phrase: finalPhrase`
- Add storing `finalContext` as well if there's a context column (currently not stored separately, so this is optional)

This ensures the `daily_themes` table reflects exactly what the user saw, keeping downstream analytics accurate.

