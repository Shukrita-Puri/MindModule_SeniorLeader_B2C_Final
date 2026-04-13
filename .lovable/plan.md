

# Fix Performance Readiness Brief — LLM Resilience, Wearable Chips, and Fallback Quality

## Summary

Four changes across three files: (1) increase Claude retries to 4, add Lovable AI fallback, (2) make deterministic fallback signal-aware, (3) add "Body steady" wearable chip, (4) add shared Lovable AI helper.

---

## Changes

### File 1: `supabase/functions/_shared/anthropic.ts` (Fix 4)

Add exported `callLovableAIText()` function at bottom of file:

```typescript
export async function callLovableAIText(params: {
  system?: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

  const allMessages = [];
  if (params.system) allMessages.push({ role: 'system', content: params.system });
  for (const m of params.messages) allMessages.push({ role: m.role, content: m.content });

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model || 'google/gemini-2.5-flash',
      messages: allMessages,
      max_tokens: params.max_tokens || 1024,
      temperature: params.temperature,
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lovable AI error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
```

### File 2: `supabase/functions/compute-outer-readiness/index.ts` (Fix 1 + Fix 2)

**Fix 1 — Increase retries to 4, add Lovable AI fallback:**

Change the retry loop from `attempt <= 2` to `attempt <= 4` at line 3434. Adjust timeouts: attempts 1-2 get 10s/8s, attempts 3-4 get 6s/5s.

After the Claude loop ends (line 3515), before the archetype fallback (line 3517), add Lovable AI fallback block:

```typescript
// ── Lovable AI fallback (if Claude failed) ──
if (!llmPhrase) {
  console.log('[compute-outer-readiness] [LLM] Claude failed after 4 attempts, trying Lovable AI...');
  try {
    const lovableController = new AbortController();
    const lovableTimeout = setTimeout(() => lovableController.abort(), 8000);
    const lovableContent = await callLovableAIText({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 380,
      signal: lovableController.signal,
    });
    clearTimeout(lovableTimeout);
    // Parse same as Claude path (JSON extraction + v4 validation)
    // ... (identical parse logic)
  } catch (lovableErr) {
    console.error('[compute-outer-readiness] [LLM] Lovable AI fallback failed:', lovableErr);
    llmFallbackReason = 'lovable_ai_failed';
  }
}
```

Import `callLovableAIText` from the shared helper at top of file.

**Fix 2 — Signal-aware deterministic fallback (lines 3517-3556):**

Replace the current generic fallback with logic that references live variables already in scope: `calendarLoad`, `calendarResult.meetingCount`, `hasWearable`, `hrvDeviation`, `sleepDeviation`, `checkInOutcome`, `todayHighStakes`, `consecutivePattern`, `leanOnResult`:

**Phrase**: Instead of `"Lead with {lean-on}."`:
- If `calendarLoad === 'high'` + depleted: `"Protect your energy — heavy calendar ahead."`
- If `todayHighStakes.length > 0` + wearable strained: `"Steady your system — high-stakes ahead."`
- If consecutive depleted 3+: `"Break the pattern — {count} depleted days running."`
- If strong/peak + light calendar: `"Sustain the advantage — light calendar to build on."`
- Default: `"Lead with ${leanOnResult.leanOn.toLowerCase()}."`

**Body**: Instead of generic goal text, compose from signals:
- Include meeting count if calendar connected
- Include wearable state summary if connected (e.g., "body steady" / "body strained")
- Include check-in outcome if available
- Goal context as secondary line

**Lean on / Watch for**: Use FULL `leanOnResult.leanOn` and `leanOnResult.watchFor` text (not truncated to 3 words). Add signal-based items:
- If wearable connected + steady: add `{ signal: 'Body steady — your system supports this', source: 'Wearable' }`
- If calendar light: add `{ signal: 'Calendar space — use it deliberately', source: 'Calendar' }`
- If consecutive pattern: add `{ signal: '{count}-day {state} pattern', source: 'Pattern' }`

### File 3: `src/components/home/DecisionReadinessBrief.tsx` (Fix 3)

After each tier block (full at ~line 264, partial at ~line 300, absolute at ~line 339), before the `else` (none) block at line 340, add a check:

```typescript
// After the absolute tier block closes (line 339), before the else:
// Add steady-state chip if wearable connected but no chip generated
const hasWearableChip = chips.some(c => ['hrv', 'sleep', 'rhr'].includes(c.id));
if (!hasWearableChip && tier !== 'none') {
  if (tier === 'absolute') {
    chips.push({ id: 'wearable-steady', label: 'System online', color: 'neutral', qualifier: ' · establishing baseline' });
  } else if (tier === 'partial') {
    chips.push({ id: 'wearable-steady', label: 'Body steady', color: 'green', qualifier: ' · early reading' });
  } else {
    chips.push({ id: 'wearable-steady', label: 'Body steady', color: 'green' });
  }
}
```

This goes right before line 340 (`} else {` for `tier === 'none'`), consolidating all three tier cases.

---

## What Does NOT Change

- Red/amber/green chip thresholds — unchanged
- Calendar pills rendering
- Score row, clarity/confidence chip logic
- LLM system/user prompt content
- UI layout of the card
- No migrations or schema changes

## Fallback Chain (after fix)

```text
Claude (4 attempts: 10s, 8s, 6s, 5s)
  → Lovable AI (1 attempt: 8s, Gemini 2.5 Flash)
    → Signal-aware deterministic fallback (calendar + wearable + patterns + archetype)
```

