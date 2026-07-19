
# Week-Ahead "Prior Priority" — correct definition & fix

Date: 2026-07-19
Scope: `list-week-ahead-priorities`, `_shared/plan/event-priority-memory.ts`, `_shared/jit/load-jit-context.ts`, `_shared/jit/select-jit.ts`, `WeekAheadPriorities.tsx`
Out of scope: the classifier bug that put "Mind Module — Beta test…" into category `layoff`, daily Plan, Brief, JIT selectors.

## Plain-English definition

**"Prior" means before today.** A star tapped an hour ago is a *present* signal, not a learned pattern. The tag should read:

> `prior_priority` fires when the user has starred an event of this category/type at least once on a **calendar day before today (UTC)**, within the existing 60-day priority window.

No ISO-week boundary (too strict; loses last night's tap). No minimum count (one genuine prior-day tap is enough).

## Confirmed cause (from DB + code)

For `shukrita@mindmodule.me`, `event_priority_memory` has one row for `(layoff, mind_module_beta, priority)` at **2026-07-19 14:17 UTC** — ~1 hour before the 15:25 screenshot. That single row contributes `+10` to `memoryDelta`, clears the `>= 8` threshold in `list-week-ahead-priorities/reasonsFor()`, and emits "prior priority". So the tag is technically driven by real data, but the label lies about *when* the signal happened.

Root cause chain (all read-only, no schema change needed):

```text
event_priority_memory (category, type_key, signal, occurred_at)
   │
   ▼ applyEventPriorityMemory  → returns { delta, hardDemote, reasons }
                                   ← priorityCount + age info discarded
   │
   ▼ load-jit-context.ts        → stores { delta, hardDemote } only
   │
   ▼ list-week-ahead reasonsFor → if delta >= 8 push 'prior priority'
                                   ← no "before today" check
```

## Additional issues spotted while auditing

1. `reasonsFor()` silently caps at 3 reasons via `.slice(0, 3)`. A genuine prior-priority chip can be dropped when it collides with `known_relationship`, `high_stakes`, and `recurring pressure pattern`. Fix: pin `prior priority` to the front before slicing.
2. `historically_low_signal` renders with the same visual weight as positive chips, so users read it as a verdict. Fix: muted chip styling — no data change.
3. `recurring pressure pattern` (`patternScore >= 10`) is opaque to users. Not blocking — flagged for follow-up docs, not part of this PR.

## Implementation

### 1. `supabase/functions/_shared/plan/event-priority-memory.ts`

Extend `MemoryBoostResult` with additive fields; behaviour of existing callers unchanged.

```ts
export interface MemoryBoostResult {
  delta: number;
  hardDemote: boolean;
  reasons: string[];
  priorityCount: number;         // NEW
  hasPriorDayPriority: boolean;  // NEW — ≥1 priority row on a UTC date < today
}
```

Inside `applyEventPriorityMemory`, compute `todayDateUTC = now.toISOString().slice(0,10)`. For each `signal === 'priority'` row that already passes the `ageDays <= 60` gate, compare `new Date(r.occurred_at).toISOString().slice(0,10) < todayDateUTC` and set `hasPriorDayPriority = true` if any match. Return the two new fields (default `false` / `0` when there are no rows).

### 2. `supabase/functions/_shared/jit/load-jit-context.ts`

Extend the stored shape:

```ts
memoryDeltaByEventId?: Record<string, {
  delta?: number;
  hardDemote?: boolean;
  sovereignEscalation?: 'low';
  hasPriorDayPriority?: boolean;  // NEW
}>;
```

In section 4b where `applyEventPriorityMemory` is called, forward `res.hasPriorDayPriority || undefined` onto the stored entry.

### 3. `supabase/functions/_shared/jit/select-jit.ts`

Thread the flag through so `list-week-ahead-priorities` can read it without re-querying:

```ts
components: {
  …,
  memoryDelta,
  hasPriorDayPriority,   // NEW — ctx.memoryDeltaByEventId?.[ev.id]?.hasPriorDayPriority ?? false
  …,
}
```

Type additions on `SelectedCandidate.components` are additive; no consumers break.

### 4. `supabase/functions/list-week-ahead-priorities/index.ts`

Update `reasonsFor()`:

```ts
if (c.components.memoryDelta >= 8 && c.components.hasPriorDayPriority) {
  out.push('prior priority');
}
// Ranking boost from memoryDelta is unchanged — only the label is gated.
if (c.components.memoryDelta <= -10) out.push('historically low-signal');

// Preserve prior_priority ahead of the 3-cap slice
const prioritised = out.includes('prior priority')
  ? ['prior priority', ...out.filter(r => r !== 'prior priority')]
  : out;
return Array.from(new Set(prioritised)).slice(0, 3);
```

Ordering / picked-array / snapshot persistence unchanged. Ranking numbers unchanged — only the emitted label changes.

### 5. `src/components/home/WeekAheadPriorities.tsx`

Cosmetic only. Render `scoreReasons` as chips; give `historically low-signal` a muted style so it visually reads as advisory:

```tsx
{it.scoreReasons.map((reason) => {
  const isAdvisory = reason === 'historically low-signal';
  return (
    <span key={reason} className={cn(
      'text-[10px] rounded-full px-2 py-0.5 whitespace-nowrap',
      isAdvisory
        ? 'bg-muted/40 text-muted-foreground/60'
        : 'bg-muted/70 text-foreground/75 font-medium',
    )}>{reason}</span>
  );
})}
```

## Tests

- `supabase/functions/_shared/plan/event-priority-memory.test.ts` — five cases: (a) single priority row today → `hasPriorDayPriority=false`; (b) yesterday → true; (c) mix of today+yesterday → true; (d) no rows → false; (e) rows older than 60d → `delta=0`, `hasPriorDayPriority=false`.
- `supabase/functions/list-week-ahead-priorities/selector-evidence.test.ts` — assert source contains `hasPriorDayPriority` gate and that `prior priority` is pinned before the `.slice(0,3)` cap.
- Existing `event-priority-memory.test.ts` cases stay green (new fields are additive with `false`/`0` defaults).
- Frontend: extend `WeekAheadPriorities.test.tsx` to assert the muted chip class is applied to `historically low-signal` and the standard class to others.

## What does NOT change

| Item | Decision |
|---|---|
| 60-day priority lookback | Unchanged |
| `memoryDelta >= 8` ranking boost | Unchanged — only the label is gated |
| Daily Plan / JIT selector behaviour | Unchanged (extra field ignored) |
| `event_priority_memory` schema | No migration |
| `weekly_plan_snapshots.priorities` shape | Unchanged |
| Classifier bug (`layoff` on Mind Module event) | **Separate ticket** |

## Rollout

1. Ship helper + context + selector changes (server) in one deploy of `list-week-ahead-priorities`.
2. Ship frontend chip styling.
3. Verify on `shukrita@mindmodule.me`: the current same-day `mind_module_beta` row should no longer emit "prior priority" until a signal from a prior UTC date exists.

No feature flag — the only user-visible change is that same-day stars stop masquerading as history.
