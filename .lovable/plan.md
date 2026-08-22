# Close the remaining A–H entry-point gaps

Verified in the code today:

- `resolveEvent()` in `_shared/events/resolve-event-category.ts` is a thin wrapper that calls `enrichEvent()` and re-exports its fields. So every `resolveEvent` call site is already going through the 5-layer resolver (overrides → learned tokens → persisted category → dictionary).
- The legacy shim `_shared/executive-state-taxonomy.ts` is gone; nothing imports it.
- The real remaining leak is `classifyPatternBucket` / `classifyEventBucket` in `_shared/events/event-classifier.ts`: when the resolver returns no subtype it falls back to a raw keyword scan of the title, which is the pre-learning path. It is called in Smart Nudges (line 1274), Mastery Plan (line 5843) and cause-effect-engine (line 350/565).
- There is no CI guard preventing new imports of the keyword-only classifier outside `_shared/events/` (the vitest guard `src/lib/events/__tests__/singleEntryPoint.test.ts` covers `classifyEvent` and the shim, but not the bucket helpers, and `cross-layer.test.ts` has no import guard).

## What this run changes

1. **Kill the keyword fallback in the bucket helpers.** `classifyPatternBucket` keeps its subtype → legacy-bucket mapping but stops falling back to `EVENT_TYPE_KEYWORDS` when the resolver returns nothing; unresolved stays `null` and callers keep their existing null handling. `classifyEventBucket`/`classifyEventLabel` read off the resolver rather than the v1 keyword classifier. No bucket names change; only previously-keyword-guessed events now resolve via the learning loop or stay unattributed.

2. **Smart Nudges reads off `EnrichedEvent`.** Replace the `classifyPatternBucket as classifyEventForPattern` import with a single `enrichEvent(...)` call per event; derive the pattern bucket from `enriched.subtype` and the category from `enriched.category` (removing the second `resolveEvent` call on line 1286 so one call feeds both).

3. **Mastery Plan and Brief read off `EnrichedEvent`.** Plan line 5843 and 7738, Brief lines 256 and 7127: drop the `classifyEvent` local alias and the pattern-bucket call, replacing each with one `enrichEvent(...)` and reads of `.subtype` / `.category.name`. Same values, one call.

4. **cause-effect-engine calls `enrichEvent` directly.** Its inline `classifyEvent`, `classifyEventCanonical` and `canonicalCategoryName` collapse into one `enrichEvent` helper returning the `EnrichedEvent`; row label uses `enriched.category?.name`, subLabels use `enriched.subtype?.label`. Bump `ENGINE_VERSION` to 11 so cached payloads recompute.

5. **Make the v1 classifier internal + guard it.** `classifyEvent`, `classifyEventLabel`, `classifyEventBucket` stop being exported from `event-classifier.ts` (kept module-local for the dictionary layer). Add an import guard to `_shared/events/cross-layer.test.ts` (Deno) that fails if any file outside `_shared/events/` imports `classifyEvent`, `classifyEventLabel`, `classifyEventBucket`, `classifyPatternBucket` or `executive-state-taxonomy.ts`; mirror it in the vitest guard so `npm test` catches it too, and document the gate in `.github/CONTRIBUTING.md`.

## Launch safety

Wiring only — no scoring, weight, threshold, gate or copy change. Each surface is repointed and typechecked before the next; helpers stay exported until their last caller is gone. Sequence: bucket helpers → Smart Nudges → Plan → Brief → cause-effect-engine → un-export + guards. The one behaviour delta is intended: titles the keyword list guessed at now resolve through the learning loop instead.

## Technical notes

- Deploy after the backend edits: `smart-nudges`, `generate-mastery-plan`, `compute-outer-readiness`, `cause-effect-engine`.
- `ENGINE_VERSION` 10 → 11 in `cause-effect-engine`; Plan/Brief snapshot cache keys bumped alongside.
- No migrations; the learning-loop tables already exist and are read through `enrichEvent`.
- Full vitest suite plus `deno check` on each touched function before deploy.
