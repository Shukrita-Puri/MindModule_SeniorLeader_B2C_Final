# Plan: Inject Signal Pill Tiers into Brief LLM Prompt

## Goal
Make the Brief LLM aware of the same pre-computed signal-pill tiers the user will see, so the generated prose never contradicts the MRS / signal-pill story.

## Scope
Isolated change inside `supabase/functions/compute-outer-readiness/index.ts` only. No UI, no business logic, no database, no other edge functions.

## Implementation

1. **Compute pre-LLM pill tier labels** immediately before `buildBriefSystemPrompt` is called (around line 6387), using the already-resolved variables `wearableFreshForGate`, `hrvValue`, `hrvDeviation`, `clarityLevel`, `rhrValue`, `rhrDeviation`:

```text
const preLLMDecisionTier: string =
  (wearableFreshForGate && hrvValue != null)
    ? (((hrvDeviation ?? 0) < -15 || (clarityLevel != null && clarityLevel <= 2)) ? 'MIND FOGGY'
      : ((hrvDeviation ?? 0) > 10 || (clarityLevel != null && clarityLevel >= 4)) ? 'MIND SHARP'
      : 'MIND MIXED')
    : (clarityLevel != null ? (clarityLevel <= 2 ? 'MIND FOGGY' : clarityLevel >= 4 ? 'MIND SHARP' : 'MIND MIXED') : 'MIND UNREAD');

const preLLMPhysicalTier: string =
  (wearableFreshForGate && rhrValue != null)
    ? ((rhrDeviation ?? 0) > 15 ? 'BODY STRAINED'
      : (rhrDeviation ?? 0) > 8 ? 'BODY MIXED'
      : 'BODY STEADY')
    : 'BODY UNREAD';
```

2. **Inject a SIGNAL PILL TIERS block** into `userPrompt` immediately after the READINESS block, before the CALENDAR TODAY block. Add exactly:

```text
userPrompt += `\n\n=== SIGNAL PILL TIERS ===`;
userPrompt += `\nDecision Readiness pill the user will see: ${preLLMDecisionTier}`;
userPrompt += `\nPhysical Reserves pill the user will see: ${preLLMPhysicalTier}`;
userPrompt += `\nPILL CONSISTENCY RULE (hard): body must never contradict these tiers.`;
userPrompt += `\nMIND FOGGY → never write "sharp", "clear", "decision power high".`;
userPrompt += `\nMIND SHARP → never write "spent", "taxed", "foggy", "mind is carrying".`;
userPrompt += `\nBODY STRAINED/BODY DEPLETED → never write "body is recovered", "physical runway clear".`;
userPrompt += `\nWhen pill tier and felt-state contradict: name both in beat (a) without resolving — the tension IS the story.`;
```

3. **MRS awareness (no display)** — the MRS score, tier, yesterday score and trend are already present in the READINESS block, and `mrsConsistencyLine(bandValence)` already emits a valence directive. To make the joined-up story explicit while never printing the number, append to the same block:

```text
userPrompt += `\nMRS the user will see: ${typeof innerReadinessScore === "number" ? innerReadinessScore : "awaiting"}/100 · band: ${bandValence ?? "unknown"} · tier: ${safeTier}`;
userPrompt += `\nMRS CONSISTENCY RULE (hard): never state or imply the numeric score or the tier word in the output, but the prose direction must match the band — low = constrained/protective, mid = selective/uneven, high = capacity available.`;
userPrompt += `\nIf the MRS band and the pill tiers disagree, lead beat (a) with the pill tier the user can literally see and let the band shape posture only.`;
```

Both blocks reference only variables already declared in the outer prompt scope (`innerReadinessScore`, `bandValence`, `safeTier`, `wearableFreshForGate`, `hrvValue`, `hrvDeviation`, `clarityLevel`, `rhrValue`, `rhrDeviation`), satisfying the brief-prompt variable-scoping rule.

## Verification
- Run `tsgo` on the project.
- Run the existing `brief_prompt_contract` test and the compute-outer-readiness suite.
- Deploy `compute-outer-readiness`.
- Smoke-test the deployed function and confirm the prompt now contains the `SIGNAL PILL TIERS` block and the MRS consistency lines.
