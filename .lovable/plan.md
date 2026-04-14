

# Plan: Two-Tier LLM Strategy for Decision Readiness Brief

## Updated Root Cause (from live logs just now)

The timeout issue is **fixed** (Claude now completes in 3.3-3.9s with 6s window). The current blocker is **`validation_body_tier_word`** — the `TIER_BLACKLIST` (`/\b(moderate|high|low|strong)\b/i`) rejects Claude's body text because it naturally uses words like "high" (e.g. "high calendar load") and "strong" (e.g. "strong clarity"). This is a false positive — these words in context are fine.

However, the two-tier Gemini-first strategy is still the right fix: faster response times, `response_format: json_object` for reliable parsing, and Claude as quality backup.

## Changes (2 files)

### File 1: `supabase/functions/_shared/anthropic.ts`

Add `response_format` parameter to `callLovableAIText`:

```typescript
export async function callLovableAIText(params: {
  // ... existing params
  response_format?: { type: string };
}): Promise<string> {
```

Include it in the fetch body when provided.

### File 2: `supabase/functions/compute-outer-readiness/index.ts`

**A. Import `callLovableAIText`** (line 4)

**B. Fix TIER_BLACKLIST false positives** (line 3411)

Remove `TIER_BLACKLIST` check from **body** validation only (keep it on phrase). Words like "high", "low", "strong" are natural in body context ("high calendar load", "strong clarity"). The phrase check stays — tier words in the headline are bad.

**C. Replace single Claude attempt with two-tier strategy** (lines 3474-3529)

```
Attempt 1: Gemini Flash (4s timeout)
  → callLovableAIText({ model: 'google/gemini-2.5-flash', response_format: { type: 'json_object' } })
  → Parse JSON → validate → accept or continue

Attempt 2: Claude Sonnet (6s timeout, only if attempt 1 failed)  
  → callClaudeText({ model: CLAUDE_MODELS.SONNET })
  → Parse JSON → validate → accept or fallback

Deterministic fallback (unchanged)
```

**D. Enhanced logging** — log which model was tried, success/failure reason, duration for each attempt.

## What stays unchanged

- System prompt (already compressed to ~5K chars)
- User prompt assembly
- All blacklist checks on **phrase** (wellness, tier, readiness)
- Blacklist checks on body for wellness/readiness words
- Deterministic fallback logic
- Atomic brief contract
- Frontend

## Expected outcome

- Gemini Flash responds in ~1-2s → brief succeeds on first attempt most of the time
- Body text no longer falsely rejected for containing "high"/"low" in context
- If Gemini fails, Claude gets 6s as backup
- Logs clearly show `model=gemini` or `model=sonnet` with pass/fail reason

