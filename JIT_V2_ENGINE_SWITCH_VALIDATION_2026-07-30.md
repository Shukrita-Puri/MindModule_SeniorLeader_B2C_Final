# JIT v2 Engine Switch-Over Validation

**Date:** July 30, 2026  
**Scope:** Code-level validation of F3.1 from `PLAN_ROUND1_FINAL_ASSESSMENT_AND_GUIDE.md`

## Outcome

At the **code level**, the Plan engine switch-over to JIT v2 is now **confirmed in source**.

The validation below addresses the three required proof points from the assessment:

1. assignment line
2. `load-jit-context.ts` reachability
3. `skipCountsByBucket` / `followThroughByBucket` status

This confirms the implementation in repo code. It does **not** by itself prove production deployment state or runtime parity outcomes.

## Proof 1 — Assignment line

The live Plan path no longer assigns JIT candidates from the legacy ranker.

In [supabase/functions/generate-mastery-plan/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/generate-mastery-plan/index.ts), the live assignment now reads:

```ts
if (preferredSelectResult) {
  jitRankedCandidates = adaptV2Ranked(
    preFilteredEvents.map((entry) => entry.event),
    preferredSelectResult,
    nowMsForJit,
  ).filter((candidate) =>
    preFilteredEvents.some((event) => event.event.id === candidate.eventId)
  );
}
```

This is the live path used before slot allocation. It is not assigning via `rankJitCandidates(...)`.

### Validation result

- **Confirmed:** live Plan code uses `adaptV2Ranked(...)`
- **Rejected:** legacy `rankJitCandidates(...)` is not the live assignment source here

## Proof 2 — `load-jit-context.ts` is reachable in the live path

The live Plan flow calls `loadJitContextForEvents(...)` before `selectJitCandidates(...)`.

In [supabase/functions/generate-mastery-plan/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/generate-mastery-plan/index.ts), inside `buildPreferredJitV2Selection(...)`, the code does:

```ts
const { input, ctx } = await loadJitContextForEvents(
  supabaseClient,
  userId,
  rows,
  { nowMs: Date.now(), goals },
);
return selectJitCandidates(input, {
  ...ctx,
  nowMs: Date.now(),
  horizonMs: DAY_OF_HORIZON_MS,
});
```

This proves the loader is on the live request path before selector execution.

### What `load-jit-context.ts` populates

In [supabase/functions/_shared/jit/load-jit-context.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/_shared/jit/load-jit-context.ts), the loader:

- reads `attendee_relationships`
- replays relationship tags from `event_priority_memory`
- derives `memoryDeltaByEventId`
- returns these inside `ctx`

Key code-level behaviors:

- `attendee_relationships` query:
  - `.from("attendee_relationships")`
- relationship replay from `event_priority_memory`:
  - `signal === "tag_relationship"`
- memory delta projection:
  - `const memoryDeltaByEventId`
  - values written into `memoryDeltaByEventId![eid] = { ... }`
- final selector context includes:
  - `memoryDeltaByEventId`

### Validation result

- **Confirmed:** `loadJitContextForEvents(...)` is reachable in every live Plan run that builds preferred JIT v2 selection
- **Confirmed:** relationship-weighted scoring is no longer shadow-only
- **Confirmed:** `memoryDeltaByEventId` is populated in the shared selector context

## Proof 3 — `skipCountsByBucket` / `followThroughByBucket` status

These are now wired from `jit_preferences`.

In [supabase/functions/_shared/jit/load-jit-context.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/_shared/jit/load-jit-context.ts), the loader does:

```ts
const { data: prefs } = await supabase
  .from("jit_preferences")
  .select("event_type, action")
  .eq("user_id", userId);
```

It then builds:

- `skipCountsByBucket`
- `followThroughByBucket`

and returns both in `ctx`.

### Shadow-path note

The assessment correctly identified that the old shadow run had `{}` stubs. That is no longer true in the current repo state.

In [supabase/functions/generate-mastery-plan/index.ts](/Users/manojkumar/Documents/Mind%20Module/MindModule_SeniorLeader_B2C_Final/supabase/functions/generate-mastery-plan/index.ts), the shadow path now loads real tactical counts through `loadJitContextForEvents(...)` before calling `selectJitCandidates(...)`.

### Validation result

- **Confirmed:** `jit_preferences` exists as the source
- **Confirmed:** `skipCountsByBucket` and `followThroughByBucket` are wired
- **Rejected:** current repo state does not silently pass `{}` as the accepted final behavior

## Final F3.1 Status

At the **source-code level**, F3.1 should now be marked:

**Confirmed in source**

## What This Validation Does Not Prove

This validation does **not** confirm:

- that the latest code is already deployed to production
- that parity-week shadow logs were reviewed
- that production runtime data matches the expected behavior for all users
- that all dependent migrations/backfills were applied in production

Those are deployment/runtime checks, not source-code proof points.

## Recommended Follow-Up

After deployment, run a short production verification pass for:

1. live Plan requests producing JIT candidates from the v2 selector path
2. `jit_preferences` counts appearing in effective selector behavior
3. relationship-weighted attendee scoring influencing real requests
4. parity/shadow logging where still applicable

