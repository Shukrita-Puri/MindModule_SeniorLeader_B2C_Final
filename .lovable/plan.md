## Answer to your question

Smart Nudges is **not currently using a Claude → Gemini → static fallback chain**.

Current behavior in `smart-nudges` is:

```text
Claude Haiku → if missing/error/invalid → static fallback copy
```

There is a Lovable AI/Gemini helper available in the shared AI utility, but `smart-nudges/index.ts` does not import or call it today. Because the Claude Haiku alias is currently `claude-3-5-haiku-latest`, the AI path is likely failing with 404 and the function is effectively relying on static fallback copy.

## Focused patch scope

I will make one isolated Smart Nudges patch only. I will not change cascade logic, suppression, frequency, routing, timing windows, APNs delivery, user selection, or notification preferences.

## Implementation plan

### 1. Fix Claude Haiku model alias

Update the shared Claude model alias:

```text
claude-3-5-haiku-latest → claude-3-5-haiku-20241022
```

This restores the existing first-choice AI path without changing prompt logic or nudge behavior.

### 2. Add Gemini/Lovable AI as the middle AI fallback

Update Smart Nudges copy generation to follow:

```text
Claude Haiku → Lovable AI Gemini → validated static fallback
```

Implementation details:
- Import the existing `callLovableAIText` helper into `smart-nudges/index.ts`.
- Reuse the same V8 system prompt and user prompt for the Gemini attempt.
- Use the supported default Lovable AI model `google/gemini-3-flash-preview`.
- Apply the exact same V8 parsing and validation gate to both AI providers:
  - no fabricated wearable data
  - no citing null HRV/RHR/sleep fields
  - `violatesCopyContractV8`
  - `requiresNamedContextToken`
  - `violatesMeaningSentence`
- If Claude fails, log the Claude failure and attempt Gemini.
- If Gemini fails or returns invalid/non-compliant copy, fall back to static copy.

### 3. Gate all static fallback copy through V8 validators

Add a small local validator wrapper for fallback copy, used immediately after each fallback is selected:

```text
validateStaticFallbackCopy(copy, ctx, nudgeType)
```

It will:
- Build the same real-token V8 context used for AI validation.
- Run `violatesCopyContractV8(copy.body, v8Ctx)`.
- Reject/suppress any fallback body that violates V8.
- Log the variant id and reason if a fallback fails.
- Return a safe V8-compliant emergency copy only if absolutely needed, so the function never ships V7 phrasing.

This keeps validation centralized and prevents future fallback regressions.

### 4. Rewrite/purge the known failing V7 fallback variants

Target only the known failing variants you listed, plus any direct static fallback selected by those same branches:

- `FB-N1-light::A/B/C/D`
- `FB-N1-hrv::C`
- `FB-N3-light::B/C`
- `FB-N3-priorities::C`
- `FB-N3-fri-light::B`

I will rewrite these to V8 gold-standard shape:

```text
Meaning sentence with real context → specific in-app mental-performance CTA
```

Examples of allowed endings:
- `check in to set your intention`
- `check in to recalibrate`
- `check in to close the day`
- `check in to close the week`
- `log in to prep your mind`
- `log in to prep your state`
- `log in to recalibrate your mind`

I will remove/suppress V7 phrases such as:
- `prep now`
- `go to the app to prep`
- `open the app to prep`
- bare metric starts like `HRV -20% today — ...`
- passive consumption such as `your prep is ready`

### 5. Revalidate CTA variant rewriting after A/B assignment

Because the A/B CTA variant function rewrites the body after fallback selection, I will add a final V8 validation check after `applyCtaVariant(...)` and before insert/send.

This is important because the failing examples include variant suffixes like `::B` and `::C`; the final shipped text must be V8-compliant after CTA mutation, not only before it.

If final validation fails:
- suppress that notification for that cron tick rather than send non-compliant copy
- log the variant id, nudge type, and violation reason

### 6. Persist V8 telemetry in `notification_log.payload.metadata`

Currently the payload has top-level fields:

```text
architecture
cta_experiment
```

but recent rows show `payload.metadata` is null. I will persist both top-level and nested metadata to support current and future queries:

```json
{
  "architecture": "cos-mind-v8-meaning-forward",
  "cta_experiment": "cta-action-verb-v2",
  "metadata": {
    "architecture": "cos-mind-v8-meaning-forward",
    "cta_experiment": "cta-action-verb-v2"
  }
}
```

The APNs status update path will preserve the same metadata object when updating the payload.

### 7. Update the focused validation harness/docs references only where needed

I will update the existing Smart Nudges validation test/documentation references only as needed to reflect the focused patch:
- Claude fixed alias
- AI fallback chain is now Claude → Gemini → static
- static fallback copy is V8-gated
- telemetry metadata is persisted under `payload.metadata`

No unrelated Smart Nudges docs or architecture sections will be rewritten.

## Validation after patch

After implementation, I will validate:

1. Static code search confirms no active fallback body contains banned V7 phrases.
2. Fallback variants pass `violatesCopyContractV8` and `requiresNamedContextToken`.
3. Final post-CTA-variant body is validated before insert/send.
4. Dry-run/live function response still reports `cos-mind-v8-meaning-forward`.
5. Recent inserted `notification_log.payload.metadata.architecture` and `.cta_experiment` are populated.
6. Edge logs no longer show Claude 404 for the Haiku model alias.

## Files expected to change

- `supabase/functions/_shared/anthropic.ts`
- `supabase/functions/smart-nudges/index.ts`
- `supabase/functions/smart-nudges/v5_validation_test.ts` if needed for the V8 validation assertions
- `docs/SMART_NUDGES_TECHNICAL_DOCUMENTATION.md` only for the narrow fallback-chain / metadata note if needed