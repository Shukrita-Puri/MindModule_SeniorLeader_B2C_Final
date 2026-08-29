# Change 6 — windowContext into the deterministic fallback

## Current state (verified in code)

Change 6 has already landed. Confirmed by reading the files:

- `deterministic-brief.ts:167` — `windowContext?: WindowContext | null;` exists on `DeterministicBriefFallbackOpts` and is optional, so existing callers still compile.
- `compute-outer-readiness/index.ts:9631` — the single `buildDeterministicBriefFallback({...})` call site (line 9549) already passes `windowContext: briefWindowContext ?? null`, where `briefWindowContext` is the object built by `buildWindowContext(...)` at line 8180 and fed to the LLM prompt.
- Signals are built once: the deterministic path reads the same slice. `effectiveMeetingCount()` (line 364) takes the count from the window slice (morning = day, afternoon = remaining, evening = completed) and only falls back to flat opts when no slice is passed. `overnightSleepScore()` (line 385) returns sleep only in the morning window.
- The A3 contract tests already exist in `_shared/brief/deterministic-generic-window.test.ts`: no `<event> ahead`, no overnight language outside morning, timing clause at most once, no forward day framing in the evening, plus a window-context-drives-the-count case.

So no wiring work remains. Two small residual inconsistencies are worth closing, plus a verification pass.

## Work

### 1. Source the window from the slice, not the flat opt (deterministic-brief.ts)

`openDayClause()` and the fallback branches still branch on `opts.window`. When a `windowContext` is present, its `window` field is authoritative and should be preferred, so the slice is the single source for window-dependent tense. Add one internal helper `effectiveWindow(opts)` returning `opts.windowContext?.window ?? opts.window`, and use it in `openDayClause()` and in `overnightSleepScore()`'s no-slice branch. Pure refactor, no copy change.

### 2. Verification only (no other code changes)

- `deno test supabase/functions/_shared/brief` and `_shared/personas` — green.
- Golden set unchanged at 174 fixtures (deterministic template logic untouched).
- Behavioural check on the deterministic path across morning / afternoon / evening: sleep and overnight language appear only in morning output; no `"<event> ahead"`; timing clause at most once.

## Scope and safety

- Files touched: `supabase/functions/_shared/brief/deterministic-brief.ts` only (item 1). No call-site edit needed — it is already correct.
- No prompt-version bump. Deploy `compute-outer-readiness` only.
- Frozen: MRS, Plan, Insights, Nudges, cause-effect-engine, executive cards, frontend, migrations, signal pills, validators, signal-engine, event taxonomy.
