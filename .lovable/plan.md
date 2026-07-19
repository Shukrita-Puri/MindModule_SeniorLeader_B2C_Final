# WS4 — Plan Arc Selector (reuse existing arc plumbing)

## Reuse decision
Everything needed already exists. WS4 becomes a **surgical edit** to the two files that already own arc logic:

- `supabase/functions/_shared/events/event-phase-map.ts` — SSOT for which phases each category (A–H) supports; `G` already declares `pre + during + post`, `H` already declares `during` only.
- `supabase/functions/_shared/jit/slot-allocator.ts` — already fans a travel_day into a `full_arc` of 3 slots (line 120 `buildNamedFullArcResult("travel_day", …, "G")`) and already gates dominant-event phase picking on the phase map (line 191 `dominantEventPhases`).

**No new .ts files. No new imports on the consumer side.** The gap today is one-dimensional: Category G's phase map advertises all three phases, so short-haul flights get pushed a "during" (in-flight) slot they don't need. We fix that by consulting `enrichEvent().travelArc` (already surfaced by WS2) at the two existing prune sites.

## Change 1 — `slot-allocator.ts`, dominant-event branch (~line 187–200)

Just after `dominantEventPhases` is derived from `EVENT_PHASE_MAP`, add a G-specific prune:

```ts
if (top.categoryId === "G") {
  const arc = enrichEvent({ title: top.eventTitle ?? "", durationMinutes: top.durationMinutes ?? undefined }).travelArc;
  if (arc === "pre-post") {
    dominantEventPhases = dominantEventPhases.filter(p => p !== "during");
  }
}
```

`pickForDominant("during")` then returns `null`, and the existing slot-2 fallback (`makeSlot(1, …, pickForDominant("during"), …, "during")`) will resolve to a state anchor — exactly the behaviour the phase map already produces for Category A today.

## Change 2 — `slot-allocator.ts`, `buildNamedFullArcResult` (~line 308–335)

Same idea, one line: when `dayShape === "travel_day"`, use the ranked top event's `travelArc` to drop the `during` slot from the emitted phases + `dominantEventPhases` array. Long-haul, red-eye and unknown-duration flights are unchanged (still full arc).

The `RankedJitCandidate` shape already carries `eventTitle` and duration signals through `ranked[]` (used elsewhere in this file), so no plumbing change is needed — we read them off the top-ranked G candidate.

## Change 3 — extend existing tests, no new suite file

Append to `supabase/functions/_shared/jit/slot-allocator.test.ts`:

1. **Short-haul flight as dominant G event** → slots emitted with `phase: "pre"`, `phase: "state"` (slot 1 fell back), `phase: "post"`. Assert no slot has `phase === "during"`.
2. **Long-haul flight (`durationMinutes >= 300` or explicit "long-haul"/"red-eye" title)** → slots `pre / during / post` unchanged. (Regression guard.)
3. **`hasTravelDay = true` with short-haul top event → `buildNamedFullArcResult` path** → same assertion as (1).

`event-tagging-v2.test.ts` already covers the enrichEvent side (12h→full arc, 2h→pre-post) so no duplication there.

## Explicitly out of scope

- No changes to `event-phase-map.ts` — Category G is correct as a **capability declaration**. Arc pruning belongs at the allocator, not the map.
- No new shared module (`travel-arc-selector.ts` is unnecessary given the reuse above).
- No changes to Brief, Smart Nudges, JIT selector, or any frontend.
- No schema changes.

## Validation

- `deno test supabase/functions/_shared/jit/slot-allocator.test.ts` — extended suite green.
- `deno test supabase/functions/_shared/events/` — WS1/WS2/WS3 tests remain green (48/48).
- No redeploy of edge functions required beyond `generate-mastery-plan` (which transitively imports `slot-allocator`), which we redeploy at the end of the change.

## Why this is safe pre-launch

Two localised inserts inside a file that already governs arc selection, gated on `categoryId === "G"` and a value already produced by an existing WS2 helper. No new file to wire, no new import graph, no consumer changes. Behaviour for every non-G event is byte-identical.
