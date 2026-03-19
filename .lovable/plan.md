

# Plan: Fix "Your Momentum" Data Gap + "How You Show Up" Duplicates

## Findings

### Issue 1: "Your Momentum" shows no data

**Root cause identified**: Tiny win extraction IS implemented — it runs on every coach message via `extractAndStoreTinyWin` in `self-mastery-coach/index.ts` (line 3436-3448). The DB has only **2 wins from January 26**, meaning either:

1. The extraction AI (`gemini-2.5-flash-lite`) is too conservative and rarely calls `store_tiny_win`
2. Sessions aren't generating enough qualifying content
3. The orphaned session processor does NOT trigger tiny win extraction — it fires 7 downstream functions but `store-tiny-win` / `extractAndStoreTinyWin` is not among them

**Key gap**: The `process-orphaned-sessions` function handles abandoned sessions but does NOT extract tiny wins. Only the live streaming path in `self-mastery-coach` does win extraction. If a session is orphaned before the user sends their final message, wins may be missed.

**Additionally**: The extraction prompt is strict ("When in doubt, do NOT store") and may be filtering out valid wins that don't use explicit achievement language.

### Issue 2: "How You Show Up" shows duplicate text

**Root cause**: In `performance-rhythm-insights/index.ts`, lines 426-428 add the overall positive check-in rate as a signal. Then line 431-433 picks the **top signal** as `presenceInsight`. Lines 436-439 build `presenceActions` from the **top 2 signals**. 

When the baseline check-in signal is the highest-scored, it appears as BOTH `presenceInsight` AND `presenceActions[0]` — producing the exact duplicate seen in the screenshot.

### Issue 3: No cause-effect in "How You Show Up"

The cause-effect insight exists (line 530-534 in the UI) but renders as a **separate section below**, not inside the "How You Show Up" card. The user expects it inline.

---

## Changes

### File 1: `supabase/functions/performance-rhythm-insights/index.ts`

**Fix A — Deduplicate presenceActions vs presenceInsight**:
- After setting `presenceInsight` from top signal, filter `presenceActions` to exclude any signal whose text matches `presenceInsight`
- This prevents the same sentence from appearing twice

**Fix B — Include cause-effect insight inside "How You Show Up"**:
- Add `causeEffectInsight` to the `presenceActions` array (if available and not already used as `presenceInsight`), so it renders inside the presence card bullets instead of as a disconnected standalone section

### File 2: `supabase/functions/process-orphaned-sessions/index.ts`

**Fix C — Add tiny win extraction to orphaned session processing**:
- After the downstream functions fire, also call the AI-driven tiny win extraction for orphaned sessions
- Fetch session messages, then call the Lovable AI gateway with the same extraction prompt used in `self-mastery-coach`
- This ensures abandoned sessions still contribute wins to "Your Momentum"

### File 3: `supabase/functions/self-mastery-coach/index.ts`

**Fix D — Broaden tiny win extraction sensitivity**:
- Update the extraction system prompt to be less conservative: recognize implicit wins (moments of pride, accomplishment language, growth reflections) even without explicit "win" framing
- Add examples like: "I stayed calm", "I delegated", "I noticed my pattern", "things went well", "I'm proud of"
- Change "When in doubt, do NOT store" to "When the user describes something they did well or are proud of, even implicitly, store it"

### File 4: `src/components/insights/PerformanceRhythmCard.tsx`

**Fix E — UI: Remove standalone cause-effect section if already shown in presence card**:
- Add a guard: if `causeEffectInsight` was included in `presenceActions` (server-side), don't render the standalone 1C section again
- Alternative: move the cause-effect rendering into the presence card section so it's always grouped together

---

## Summary

| Change | File | Impact |
|--------|------|--------|
| Deduplicate presenceInsight/Actions | performance-rhythm-insights EF | Fixes duplicate sentence |
| Include cause-effect in presence card | performance-rhythm-insights EF + UI | Groups analysis together |
| Add tiny win extraction to orphaned sessions | process-orphaned-sessions EF | Captures wins from abandoned sessions |
| Broaden win extraction prompt | self-mastery-coach EF | More wins detected from conversations |

No DB migrations needed. Three edge functions to deploy.

