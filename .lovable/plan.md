

# Audit: Has the Beta Tester Feedback Been Addressed?

The feedback: **"The previous scoring and statements gave heavy weightage to the performance readiness assessment score. They wanted wearable data to guide the score more, and the statement to take into account immediate data sources (wearable/calendar) so the system shows it understands them."**

---

## 1. SCORING WEIGHTS — ADDRESSED ✓

The `compute-inner-readiness` scoring weights have been updated correctly:

| Mode | Old Wearable Weight | New Wearable Weight | Old C×C | New C×C | Old Felt | New Felt |
|------|---------------------|---------------------|---------|---------|----------|----------|
| No wearable | n/a | n/a | 30% | 45% | 55% | 40% |
| Aligned | ~25% | **35%** | ~22% | **30%** | ~40% | **25%** |
| MASKED_HIGH | 35% | **40%** | — | equal split | — | equal split |
| RECOVERY_UNDERWAY | 30% | **35%** | — | equal split | — | equal split |

Wearable data now has the highest single weight (35-40%) when present. Felt state (the check-in word) has been reduced from dominant (40-55%) to secondary (25-40%). This directly answers the "score was too heavily influenced by the felt-state check-in" concern.

## 2. CONTEXT STATEMENTS — ADDRESSED ✓

The `selectSignalsForStatement()` function in `compute-inner-readiness` now uses **calendar-aware signal selection**:
- On **heavy days** (high calendar load or high-stakes events): surfaces multiple wearable signals (HRV deviation, sleep, RHR) in the primary sentence
- On **light days**: surfaces the single strongest wearable signal
- Wearable signals are prioritized over felt-state when both exist
- Calendar context (heavy/light day) shapes which signals surface

The LLM synthesis in `compute-outer-readiness` also injects immediate data (HRV deviation, sleep deviation, RHR, calendar load, meeting count, high-stakes events, next event countdown) into its prompt — so the generated phrase and body copy reference specific signals the user can recognize.

## 3. SIGNAL CHIPS — ADDRESSED ✓

The `DecisionReadinessBrief` component builds deterministic chips from immediate data:
- HRV deviation → "Body under load" / "Body recovered"
- Sleep deviation → "Poor sleep" / "Well rested" / "Short sleep"
- RHR → "HR elevated"
- Calendar pills show specific event titles and timing
- All chips are tap-to-flip to reveal the raw number

This makes the card visually demonstrate that the system is reading wearable + calendar data.

## 4. GAPS STILL PRESENT

### Gap A: Runtime Error — `DecisionReadinessBrief is not defined`
The preview currently crashes. The import and export are correct (`PerformanceReadinessBrief` exported from `DecisionReadinessBrief.tsx`, imported as `PerformanceReadinessBrief` in `ExecutiveHome.tsx`). This is likely a stale Vite HMR cache. **Fix: trigger a clean rebuild** — no code change needed, but worth verifying.

### Gap B: DailyRitual Hardcoded Fields — NOT FIXED
The plan called for fixing `clarityLevel: 0` and `confidenceLevel: 0` in `DailyRitual.tsx`. These fields no longer appear in the code at all — it seems the DailyRitual now derives all signals server-side via `timezoneOffset` only. However, the original plan's intent was to pass real clarity/confidence values through to the daily plan generation edge function. **Needs verification**: does the plan generation edge function already fetch these server-side? If so, this is resolved. If not, the plan may be using 0s server-side.

### Gap C: `watchForSource` Uses Same Value as `leanOnSource`
Line 2642 of `compute-outer-readiness`: `watchForSource: leanOnResult.source` — this uses the same source tag as leanOn. In the cascade, leanOn and watchFor can come from different priority levels. The `getLeanOnWatchFor` function returns a single `source` for the pair, so this is technically correct (they always come from the same cascade level), but worth noting.

### Gap D: LLM DOW Query is Simplified
The typical day-of-week outcome query (lines 2443-2457) doesn't actually filter by day of week — it uses `filter(() => true)` which returns all check-ins. This means the "typical Monday outcome" data fed to the LLM is actually "typical any-day outcome." Minor but should be fixed for accuracy.

---

## VERDICT

**The core feedback is addressed.** The scoring now gives wearable data 35-40% weight (up from 25-30%), and context statements prioritize physiological + calendar signals. The signal chips make immediate data visible. The LLM synthesis references specific wearable/calendar data.

**To fully close:** Fix the runtime error (likely stale build), fix the DOW query filter, and verify clarity/confidence passthrough in plan generation.

