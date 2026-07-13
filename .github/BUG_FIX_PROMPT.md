# Bug Fix Implementation — Staged Plan

Stage 1 (this PR set) ships **frontend-only, additive guards** with
`console.info` telemetry. No server, no DB, no scoring changes.

## Bug 1 — Brief numeric vs. Today gauge mismatch

**File:** `src/components/home/DecisionReadinessBrief.tsx`

Prefer the persisted MRS snapshot (`useMrsSnapshot`) for `score` / `tier`
when the snapshot `isRenderable` and `mrsWindow === currentPeriodLocal()`.
Narrative and signal pills continue to render from `outerBrief`.

Diagnostic: `console.info('[decision-readiness-brief] mrs_override', { userId, briefScore, mrsScore, window })`.

## Bug 2 — "Why this matters" echoes the practice/slot title

**File:** `src/components/home/TodayThreePriorities.tsx`

Client-side echo guard. If `hm.whyLine` is a case-insensitive trimmed
duplicate of `module.title` (collapsed) or `module.title` / `hm.timeLabel`
(expanded), fall back to first non-echo of:

1. `hm.stepRationale[0]`
2. `hm.recommendedAction`
3. `fallbackRecommendedAction(hm)`

Diagnostic: `console.info('[today-three-priorities] whyline_title_echo', { userId, moduleTitle, whyLine })`.

## Bug 3 — Evening slot grouping (diagnostic only)

No runtime change in Stage 1. Run the following against
`mastery_plan_snapshots` to determine whether the duplication is
server-side (two modules emitted) or client-side (one module, flattened).

```sql
SELECT id, user_id, plan_date, mrs_window, horizon_modules, plan_json, generated_at
FROM mastery_plan_snapshots
WHERE user_id = '<AUTH0_SUB>'
  AND plan_date = '<YYYY-MM-DD>'
  AND mrs_window = '<morning|afternoon|evening>'
ORDER BY generated_at DESC
LIMIT 1;
```

### Interpretation

- `horizon_modules` contains **two** modules titled "Evening Close" and
  "Evening Close 2" → **server-side** duplication. Stage 2 fix lands in
  `generate-mastery-plan` / horizon dedupe.
- `horizon_modules` contains **one** module with `practices.length === 2`
  → **client-side** flattening. Stage 2 fix lands in
  `TodayThreePriorities` slot rendering.

## Rollback

All three changes are additive and independently revertable. The guards
are gated on `isRenderable` / exact echo — when their preconditions
fail, the previous render path is used verbatim.