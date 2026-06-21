## Audit summary (what the workspace actually shows today)

I inspected every file referenced in the brief plus the upstream/downstream callers. Several premises in the bug report are **already correct in code** and should not be "fixed" — touching them risks regression:

| Premise in brief | Real state today |
|---|---|
| `list-week-ahead-priorities` uses legacy `rankJitCandidates` | False. Already uses `loadJitContextForEvents` + `selectJitCandidates({ horizonMs: 7*86_400_000 })` (`list-week-ahead-priorities/index.ts:44–261`). |
| `useWeekAheadMode` treats Saturday as Week-Ahead | False. Hook returns `active:false` for Saturday; only Sunday or `?mode=week-ahead` activates (`src/hooks/useWeekAheadMode.ts`). |
| `selectJitCandidates` has hard-coded 24h ceiling | False. Already `ctx.horizonMs ?? 24 * 60 * 60_000` (`select-jit.ts:316,407`). |
| `evaluateWeekAheadMode` returns Saturday active | False. Server predicate explicitly excludes Saturday (`_shared/plan/week-ahead-mode.ts`). |
| `loadJitContextForEvents` doesn't exist | Exists at `_shared/jit/load-jit-context.ts`. |

Bugs that **are** real and need fixing:

1. `generate-mastery-plan` still imports and calls the legacy `rankJitCandidates` at lines 1772 and 3230 (in addition to the modern `selectJitCandidates` at 507). The two paths can produce different anchor choices and may not share the 24h ceiling consistently.
2. `upcomingWeekLeadEvent` (line 5449) is computed from a future-window scan; the `promoteWeekLead` gate at 5668 uses `isSundayOrPostHoliday` which is correct in spirit, but the resolved event title can still leak into the slot anchor through other code paths (lines 5701–5712, 6055–6087) when an `anchorEventId` is set elsewhere. There is no single `isWithinDayOfHorizon(event, now)` invariant check applied uniformly before any of `anchorEventId / anchorEventTitle / eventId / eventTitle` is written into the response.
3. Coach is *not* fully suppressed — `isCoachCard: true` is still injected at multiple module-construction sites: `2350, 2363, 3390, 3405, 3636, 3699, 3711`. The slot 3 "Brief coaching check-in / Evening reflection and tiny wins capture" at 3711–3712 is the exact "Coach + Tiny Win hard-coded into evening" leak the user is reporting.
4. `generate-mastery-plan` response shape does not include a `weekAheadDecision` block, so frontend cannot honour the server decision authoritatively (it currently falls back to the local DoW predicate, which is conservative but not server-authoritative).
5. Sunday Week-Ahead error needs reproduction — `list-week-ahead-priorities` looks correct on the selector path, so the error is likely (a) a frontend assumption on response field shape, or (b) the `loadJitContextForEvents` path throwing on a missing input. Needs runtime/log evidence before patching.
6. `event-subtypes.ts` taxonomy: "in transition / interim / chief" can hit travel keywords; "presenting / present / pitch" coverage is partial. Tests will confirm before any edits.

## Goals (in priority order)

1. Strict 24-hour day-of anchor invariant — no named-event leak through any of the seven write-sites.
2. Add server `weekAheadDecision` to the Plan response; frontend ExecutiveHome routes on it.
3. Stop injecting `isCoachCard: true` and the "Brief coaching check-in / Tiny wins capture" evening module.
4. Reproduce + fix the Sunday Week-Ahead error.
5. Targeted classifier improvements + tests.
6. Regression tests covering Saturday/Sunday, Coach suppression, classifier fixes.

Explicitly **not in scope**: scoring weights, slot count, relationship taxonomy, sovereign tags, memory, why-line mechanics (only its inputs are gated), or any rewrite of `selectJitCandidates`/`practice-selector`.

## Implementation plan

### Backend

**B1. `_shared/plan/day-of-horizon.ts` (new, ~30 lines).**
Pure helper:
```ts
export const DAY_OF_HORIZON_MS = 24 * 60 * 60_000;
export function isWithinDayOfHorizon(
  event: { start_time?: string | null } | null | undefined,
  nowMs: number,
  horizonMs: number = DAY_OF_HORIZON_MS,
): boolean;
export function gateDayOfAnchor<T extends { eventId?: string|null; eventTitle?: string|null }>(
  slot: T, event: { start_time?: string|null } | null, nowMs: number,
  weekAheadActive: boolean,
): T; // nulls eventId+eventTitle if weekAheadActive=false AND event is outside 24h
```
Tested in isolation in `day-of-horizon.test.ts` (5 cases).

**B2. `generate-mastery-plan/index.ts` — apply the invariant.**
- Compute the resolved `weekAheadDecision` once near the top of the handler using `evaluateWeekAheadMode(...)` (already imported via `compute-outer-readiness` pattern — same call signature).
- Pass `weekAheadActive` into every code path that writes `anchorEventId / anchorEventTitle / eventId / eventTitle`. The known write-sites from the audit: 1702, 3482, 3878, 4982, 5006, 5226, 5701–5712, 5772–5773, 5800–5801, 5922–5923, 6055–6056, 6086–6087, 6194, 6354.
- Before any of those write a non-null value, run `gateDayOfAnchor(...)` against the matching calendar event. If `!weekAheadActive && !isWithinDayOfHorizon(event, nowMs)`, force both `eventId=null` and `eventTitle=null` and let the existing generic-anchor fallback ("the day ahead", "your current load", "today's rhythm") take over.
- `upcomingWeekLeadEvent` (5449) selection is unchanged, but its consumer block at 5668–5712 already gates on `isSundayOrPostHoliday`; tighten that to use `weekAheadDecision.active` directly so server decision wins, and apply `gateDayOfAnchor` on the resulting slot. This removes the `isWeekend && dow === 6` ambiguity.
- Migrate the two remaining `rankJitCandidates` call-sites (1772, 3230) — they keep their existing role (ranking already-filtered candidates for fallback contexts), but ensure the input set is filtered through `MVP_JIT_HORIZON_MINUTES` first (line 3185 already does this for the main filteredEvents path; replicate that filter immediately before each `rankJitCandidates` call so the fallback path cannot rehydrate >24h events).

**B3. Response contract.**
Add to the `generate-mastery-plan` response payload:
```ts
weekAheadDecision: {
  active: boolean;
  reason: WeekAheadReason | null;
  lookaheadDays: number;
  mode: "day_of" | "week_ahead";
}
```
Derived from the already-computed `evaluateWeekAheadMode` result.

**B4. Coach / Tiny-Win suppression.**
- Remove the three module-construction blocks that inject `isCoachCard: true` as a default/fallback slot, specifically the slot-3 evening blocks at 3636, 3699, 3711 (the "Brief coaching check-in" / "Evening reflection and tiny wins capture" entries).
- Leave `isCoachCard` as a *property* on the module type — coach-typed practices selected legitimately by `practice-selector` keep their flag — but no code path injects a synthetic coach module any more.
- The existing `mem://features/coach/suppression-standard` strip at the plan-finalisation layer remains as the second line of defence.
- Tiny Wins: confirm no `type === 'tiny_win'` synthetic module is injected as a slot-3 fallback (audit showed only `reasoning: 'Evening reflection and tiny wins capture'` text — removed as part of the coach block deletion above).

**B5. Sunday Week-Ahead error.**
Reproduce via `supabase--curl_edge_functions /list-week-ahead-priorities` (logged-in session) on Sunday-like fixture date, or via Deno test that wires the same inputs the frontend sends. Patch the actual error after I see the stack — most likely candidates from the audit are:
- response shape vs. `WeekAheadPriorities.tsx` field-name mismatch;
- a missing-attendees throw inside `loadJitContextForEvents` when the event has zero attendees;
- date math near `WEEK_AHEAD_HORIZON_MS` filtering everything out, producing an empty list the UI doesn't render.
No speculative fix until the actual failure mode is confirmed.

**B6. Classifier (`event-subtypes.ts`).**
- Add travel exclusion keywords: `in transition`, `transition`, `interim`, `chief`, `cto in transition`.
- Add presentation/influence verbs: `present`, `presenting`, `presentation`, `pitch` mapped to existing `inf.client_presentation` (no new subtype unless a test forces it).
- Only ship after the new classifier tests in T6 reproduce the misclassification first.

### Frontend

**F1. `src/pages/ExecutiveHome.tsx`.**
Route between `<TodayThreePriorities />` and `<WeekAheadPriorities />` using `useWeekAheadMode().active`, preferring the server's `weekAheadDecision.active` once it lands on the priorities payload. Header/eyebrow text mirrors: "Today's Performance Priorities" vs. "Week-Ahead Priorities".

**F2. `useWeekAheadMode.ts`.**
Extend the hook to accept an optional `serverDecision?: { active: boolean; reason: string|null }` argument and prefer it over the local DoW heuristic when provided. Keep the local fallback exactly as today (Sunday only, manual override). No Saturday change needed — already correct.

**F3. `WeekAheadPriorities.tsx`.**
Defensive renders only: loading state, meaningful empty state, no crash on missing optional fields. No layout change.

### Tests

**T1.** `_shared/plan/day-of-horizon.test.ts` — 5 cases for the helper.
**T2.** `generate-mastery-plan/index.test.ts` — Saturday 20 Jun 2026 evening fixture, calendar contains a Monday event titled "AI for Climate: Who Benefits" (>24h away). Assert response contains no occurrence of that title or its event id in any slot's `eventId / eventTitle / anchorEventId / anchorEventTitle`.
**T3.** Same suite — `weekAheadDecision.active === false` on Saturday, `=== true` on Sunday.
**T4.** Coach suppression — assert no module in the response has `isCoachCard === true` and no slot 3 module has the legacy "tiny wins capture" reasoning.
**T5.** `list-week-ahead-priorities/index.test.ts` — Sunday fixture builds a non-empty ranked list without throwing.
**T6.** `_shared/events/classify-event-v2.test.ts` (add cases) — "Chief UK In Transition" not classified as travel; "Presenting Mind Module to St James" classified as `inf.client_presentation`.
**T7.** `_shared/jit/select-jit.test.ts` — already has horizon test; add a relationship-prioritisation case ("Interview with EY CEO" ranks above "weekly standup" given direct-boss attendee).
**T8.** Frontend: `useWeekAheadMode` test (Saturday=false, Sunday=true, server override wins) and `ExecutiveHome` smoke test (renders correct component per decision).

### Validation

- Run `deno test` for `_shared/plan/`, `_shared/jit/`, `_shared/events/`, `generate-mastery-plan/`, `list-week-ahead-priorities/`.
- Run `bunx vitest run` for the frontend additions.
- Smoke `supabase--curl_edge_functions` on `/generate-mastery-plan` and `/list-week-ahead-priorities` if a logged-in preview session is available; otherwise rely on the Deno fixture tests as the contract proof.

### Out of scope (will not change)

Slot count, slot allocator math, MRS scoring, why-line LLM mechanics (only inputs gated), `selectJitCandidates` ranking math, relationship taxonomy, sovereign tags, memory model, calendar ingestion, practice selector internals.

### Risk

- The biggest risk is the `gateDayOfAnchor` invariant changing slot anchors for users on a normal weekday near midnight (event ~25h away). Mitigated by gating only when `!weekAheadActive` and only nulling the named anchor (not the slot itself), which falls back to the existing generic-anchor copy already in code.
- Removing the synthetic coach evening block changes the slot 3 shape on quiet days. Mitigated because the existing `practice-selector` fallback path at 6048 already supplies `nextMod` when no JIT candidate fires.

After plan approval I will execute B1→B6, F1→F3, then T1→T8, returning a final report with the artifacts and test results.