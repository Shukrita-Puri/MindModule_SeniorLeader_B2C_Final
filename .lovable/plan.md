## Root-cause summary (from edge logs + code audit)

**Issue 1 — Week-Ahead "Couldn't load your upcoming week"**
`list-week-ahead-priorities` is crashing at boot:
```
worker boot error: Uncaught SyntaxError: The requested module
'../_shared/rules/calendarEvents.ts' does not provide an export named
'mergeCalendarEvents'
```
`calendarEvents.ts` re-exports via an indirect binding:
```ts
import { mergeCalendarEvents, ... } from './calendar-merge.ts';
export { mergeCalendarEvents };
```
Deno's edge runtime resolves this as a *local* binding, not a re-export, so consumers that import the symbol from `calendarEvents.ts` see it as missing. Other consumers (`generate-mastery-plan`, sync edge fns) happen to import from `calendar-merge.ts` directly, which is why only this function boots-broken.

**Issue 2 — Brief copy still deterministic ("holding the line… / Steady and selective.")**
`compute-outer-readiness` log:
```
[anthropic-smoke] model=claude-sonnet-4-5-20250929 status=400 ok=false
body="Your credit balance is too low to access the Anthropic API…"
[compute-outer-readiness] RESULT: briefSource=deterministic, llmFallbackReason=null
```
The Anthropic account behind `ANTHROPIC_API_KEY` is out of credits. Every brief request silently falls back to the deterministic phrase/body from `compute-inner-readiness:280` and `compute-outer-readiness:1235`. Not a code defect — but `llmFallbackReason` is `null` instead of `"anthropic_402_credits"`, hiding the real cause.

**Issue 3 — Expanded pill shows "No signal detail yet" even after check-in**
`PillDetailContent` renders that string only when `serverPill == null`. Two paths produce a null:
- a. The `try { … echoedSignalPills = signalPillsPayload }` block at `compute-outer-readiness.ts:5302–5395` is the *only* assignment site. Any throw in `getPillQualifiers` / `assertPillCoherence` leaves `echoedSignalPills = null`, the catch only `console.warn`s.
- b. On a cache hit, `signalPillsPayload` is still built and the try still runs — but the wearable for this user is stale (`sourceAgeDays:5`) so `hrvValue / sleepScore / rhrValue / hrValue` are all `undefined`. If the qualifier fetch returns rows that don't satisfy `assertPillCoherence`'s shape (e.g. all-null wearable history), the helper can throw and zero out the whole payload.

Either way the client receives `signalPills: null`, falls through `serverPills?.find(...) ?? null`, and shows the fallback string. The Mind qualifiers (clarity, emotion, regulation, pressure) the user *did* submit are never reached because the parent payload is null.

---

## Fix plan

### F1 — Unbreak `list-week-ahead-priorities` (release blocker)

In `supabase/functions/_shared/rules/calendarEvents.ts`, replace the indirect import-then-export pattern with a direct re-export so Deno emits a true re-export binding:

```ts
// Replace lines 20-31:
export {
  mergeCalendarEvents,
  normalizeForClassify,
} from './calendar-merge.ts';
export type {
  CalendarMergeInput,
  MergedCalendarEvent,
} from './calendar-merge.ts';
```

Then redeploy `list-week-ahead-priorities` (and any other function that imports from `calendarEvents.ts` — verified: only this one currently imports `mergeCalendarEvents` from there, but redeploying the shared dependents is safe).

### F2 — Surface the Anthropic credit failure + add a cheap fallback

a. In `compute-outer-readiness/index.ts` around the Anthropic call, on a `status === 400` with `"credit balance"` in the body, set:
```ts
llmFallbackReason = 'anthropic_402_credits';
```
so the brief result log and the `llm_attempts` row both name the real cause. Same treatment for `401` (`invalid_key`) and `429` (`rate_limited`).

b. **User action required:** top up the Anthropic account (or rotate to a funded key) — secret is `ANTHROPIC_API_KEY`. Until that happens every brief will remain deterministic. If you'd prefer to migrate the brief LLM call to Lovable AI Gateway (Gemini Flash) as the primary with Claude as fallback (mirrors the `LLM Resilience Strategy` memory), I can wire that as F2c in a follow-up — confirm before I do.

### F3 — Make the signal-pill payload self-healing

In `compute-outer-readiness/index.ts`:

1. **Hoist the assignment out of the try.** Set `echoedSignalPills = signalPillsPayload` immediately after the payload is built (line ~5294), *before* the qualifier/coherence enrichment. Qualifier attachment becomes additive — a thrown coherence check no longer wipes the whole payload.
2. **Promote the catch to error + reason field.** Replace `console.warn(...)` with `console.error('[signal-pills-v3] ...')` and add `pillEnrichmentError: err.message` to the response so the client (and us) can see when qualifiers were skipped vs missing.
3. **Tighten the client fallback string.** In `src/components/home/PillTooltip.tsx:233-239`, when `pill` is null but the parent `signalPills` array exists with other entries, render `"Signal not available for this dimension yet"` instead of the blanket `"No signal detail yet"`, so the user can distinguish "server dropped the payload" from "this specific pill has no contributors".

### F4 — Verification

After F1 + F3 ship:
- `supabase--edge_function_logs list-week-ahead-priorities` → no boot errors.
- Re-open `/executive-home` on Sunday → Week-Ahead Priorities loads.
- Expand any pill on the Brief → contributor rows for Mind dims (Clarity / Emotion / Regulation / Pressure) appear from the check-in even when wearable is stale.
- `[compute-outer-readiness] RESULT` log shows `llmFallbackReason: "anthropic_402_credits"` until the key is topped up.

### Files touched
- `supabase/functions/_shared/rules/calendarEvents.ts` (F1)
- `supabase/functions/compute-outer-readiness/index.ts` (F2a + F3.1/3.2)
- `src/components/home/PillTooltip.tsx` (F3.3)
- Redeploy: `list-week-ahead-priorities`, `compute-outer-readiness`.

### Out of scope
- Anthropic billing top-up (user action).
- Migrating brief LLM primary to Lovable AI Gateway (offered as optional F2c, awaits confirmation).
