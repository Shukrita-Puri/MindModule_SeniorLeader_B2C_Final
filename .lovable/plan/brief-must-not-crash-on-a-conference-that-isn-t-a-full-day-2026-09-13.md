# Brief must not crash on a conference that isn't a full day

## The problem

A speaking slot that drops into an otherwise normal workday sets the behaviour flag `dropInSpeakingHighStakes`. That rule is treated as "owned by the conference day-shape branch", so it deliberately has no copy of its own. But the conference branch only runs when the whole day is classified as a conference. On a normal day the brief reaches the copy lookup, finds nothing, and throws — the deterministic brief build fails outright.

The other three beats (evidence, read, directive) already skip a missing entry quietly. Only the closing line throws.

## The fix

1. Give `dropInSpeakingHighStakes` its own copy so a one-slot conference or single speaking event is named and its impact described, on any day shape — no full-day arc needed.
2. Make the closing line never throw: when a flag has no copy, fall through to the existing generic closes instead of raising an error. Same defensive shape as the other three beats.
3. Remove `dropInSpeakingHighStakes` from the day-shape-owned exemption list, so the CI copy contract now guards it like every other brief-scoped rule.

Behaviour when the day *is* a conference is unchanged — that branch still wins, because it runs before the copy lookup.

## Technical detail

- `supabase/functions/_shared/personas/ceo/behaviour-copy.ts`
  - Add a `BEHAVIOUR_COPY.dropInSpeakingHighStakes` entry with the four beats (evidence, read, directive, close), window-aware per the existing window rule: no sleep or overnight recovery language after the morning, no forward-looking day framing in the evening. Copy names the speaking event and the state it needs, without prescribing a practice.
  - Drop `'dropInSpeakingHighStakes'` from `DAY_SHAPE_OWNED_RULES`.
- `supabase/functions/_shared/brief/deterministic-brief.ts` — `closeFor()` (~line 1336): replace the `throw` with a fall-through so the remaining day-shape-owned rules degrade to the band/window close rather than failing the build.
- Tests: `behaviour-copy.contract.test.ts` stays green (now covering the new rule); add a case asserting the deterministic brief builds a body when the top flag is a day-shape-owned rule and `dayShape` is not `conference`.
- Then deploy `compute-outer-readiness` and the shared modules that ship with it.

## Not touched

Day-shape/conference classification, `topCeoFlag` priority order, the four-beat contract, the LLM prompt path, Plan/JIT, and the narrative copy families.
