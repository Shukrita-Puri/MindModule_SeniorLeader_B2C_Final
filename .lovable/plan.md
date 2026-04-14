

# Plan: Relax Validation + Enhance Logging + Compress Prompt + Increase Timeout

**Single file**: `supabase/functions/compute-outer-readiness/index.ts`

---

## Change 1: Relax Validation (lines 3433–3466)

- **Line 3444**: Change `wordCount > 25` → `wordCount > 40`
- **Line 3455**: Change `signal.split(/\s+/).length > 3` → `signal.split(/\s+/).length > 5`
- **Line 3446**: Remove the `body_restates_phrase` check entirely
- **Keep all blacklist checks** (wellness, tier, readiness) unchanged

## Change 2: Enhance LLM Fallback Logging (lines 3494–3552)

Add detailed context to every failure path:

- **Before the LLM call** (after line 3420): Log `systemPrompt.length` and `userPrompt.length` for input size correlation
- **On timeout** (line 3545–3546): Log the `timeoutMs` threshold and model name
- **On parse failure** (line 3534): Log `content.length` and `content.substring(0, 200)` 
- **On validation rejection** (line 3524–3525): Log the specific failing value (e.g. word count, matched blacklist word)
- **On success** (line 3531): Also log `durationMs` for tail-latency monitoring
- **Final fallback** (line 3551): Include model name used

## Change 3: Compress System Prompt (~22% reduction)

The system prompt (lines 3205–3279) is ~9,200 characters. Compress without losing quality:

- **Few-shot examples**: Cut from 4 → 2 (keep #1 Sunday Pre-Board and #3 Consecutive Low + Coach — highest-value synthesis patterns). Remove examples 2 and 4.
- **Day-type overrides** (lines 3236–3242): Compress 7 blocks into compact single-line format
- **Signal synthesis patterns A–I** (lines 3244–3253): Compress to `LABEL: condition → directive` single-line format, keep all 9
- **Cold start** (lines 3255–3259): Compress to 2 lines
- **Preserve fully**: 6-step reasoning protocol, all hard constraints/blacklists, output format, wearable hierarchy, JIT override, null discipline

Estimated reduction: ~2,000 chars → ~7,200 final. Reduces time-to-first-token.

## Change 4: Increase Timeout 3.5s → 6s

- **Line 3495**: Change `retryTimeouts = [3500]` → `retryTimeouts = [6000]`
- Per the doc spec (section 6.5), the intended timeout is 6 seconds — current 3.5s is below spec and the confirmed root cause of 100% fallback rate

## Change 5: Deterministic formatFallbackSignal — match relaxed limits

- **Line 3581**: Change `.slice(0, 3)` → `.slice(0, 5)` to match the relaxed 5-word signal limit for consistency

## What is NOT changing

- No multi-model strategy (no Gemini)
- No frontend changes
- No changes to deterministic fallback logic or atomic brief contract
- No changes to user prompt assembly
- All blacklist checks preserved

## Expected Outcome

- Prompt compression + 6s timeout → LLM calls can realistically complete
- Relaxed validation accepts valid-but-slightly-long outputs
- Enhanced logs show exact failure reason, input sizes, and duration on every attempt
- Successful call durations logged to detect tail-clipping at 5.8–6.0s

