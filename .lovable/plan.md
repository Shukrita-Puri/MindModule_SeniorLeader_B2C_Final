# Where A–H lives today, and how to make every feature use it

## The canonical taxonomy files

All of these are under `supabase/functions/_shared/events/`:

| File | Owns |
|---|---|
| `event-categories.ts` | The eight pillars A–H: id, user-facing name, self-regulation focus, §3 trigger inventory, Pre/During/Post protocol. Single source for A–H. |
| `event-subtypes.ts` | 55 subtypes (`gov.*`, `inf.*`, `vis.*`, `lead.*`, `str.*`, `conf.*`, `trv.*`, `rhy.*`), each with `categoryId`, keywords, demand profile, JIT lead time, scenario map. |
| `classify-event-v2.ts` + `resolve-event-category.ts` | The intended 5-layer resolver: user override → learned tokens → persisted `event_category` → dictionary classifier → unresolved. |
| `event-classifier.ts` | The older v1 keyword-only `classifyEvent(title)`. Still exported and still widely called. |
| `enrich-event.ts` | The façade: `enrichEvent(raw)` → category + subcategory + phases + demand + scenario. Calls the 5-layer resolver. |
| `event-phase-map.ts` | Per-category Pre/During/Post prescriptions. |
| `learning-store.ts`, `acronym-dictionary.ts`, `travel-patterns.ts`, `presentation-verbs.ts`, `format-taxonomy.ts` | Supporting layers for the resolver. |
| `executive-state-taxonomy.ts` (one level up) | Transitional re-export shim over the above. Slated for deletion. |

## What each feature is actually wired to

| Feature | Entry point | Path |
|---|---|---|
| Brief (`compute-outer-readiness`) | `enrichEvent` **and** raw `classifyEvent` v1 + `EVENT_CATEGORIES` + phase map; `selectLeadEvent` via the shim | mixed |
| Plan (`generate-mastery-plan`) | `enrichEvent`, `classifyEvent` v1, subtypes, categories, phase map, learning store, shadow-classify; some imports via the shim | mixed |
| Week Ahead (`list-week-ahead-priorities`) | `resolveEventCategory` + `enrichEvent` | canonical |
| JIT (`generate-jit-events`) | `classifyEvent` v1 through the shim only | legacy |
| Smart Nudges | `EVENT_CATEGORIES` + phase map + `classifyEvent` v1 through the shim | mixed |
| Insights — Drains (`cause-effect-engine`) | `EVENT_CATEGORIES` + shim helpers | mixed |
| Insights — Rhythm (`performance-rhythm-insights`) | only `dedupeCalendarEvents` from the shim; no classification | none |
| Signal engine (`_shared/signal-engine/_event-utils.ts`) | `classifyEvent` v1 via the shim | legacy |
| MRS (`compute-inner-readiness`) | imports no taxonomy at all | none |
| Frontend | `src/components/insights/PerformanceCausalityCard.tsx` contains its own hardcoded A–H name strings | duplicate |

Only two call sites (`enrich-event.ts`, `list-week-ahead-priorities`) go through the 5-layer resolver. Everything else that classifies calls the keyword-only v1 path, so user overrides, learned tokens and persisted `event_category` are ignored on those surfaces — which is why Insights filed the New York flight and DoubleTree stay under "Daily Rhythm & Baseline".

## Proposed consolidation

1. **Gap audit against the uploaded schema.** Diff `FINAL_A_to_H_Schema_Summary-2.md` (pillar names, every sub-category such as `A.trustee`, `B.client_presentation`, `C.town_hall`) against `event-subtypes.ts` + the alias map in `enrich-event.ts`. Produce a written gap list before touching code; add missing subtypes/aliases only where the doc names one that has no code row.
2. **One resolver everywhere.** Replace direct `classifyEvent(title)` calls with `enrichEvent(raw)` (or `resolveEventCategory`) in: `generate-jit-events`, `smart-nudges`, `_shared/signal-engine/_event-utils.ts`, `cause-effect-engine`, and the remaining v1 call sites in Brief and Plan. Keep v1 exported only as the dictionary layer inside `classify-event-v2.ts`.
3. **Retire the shim.** Repoint every `executive-state-taxonomy.ts` import at `events/*`, then delete the shim.
4. **Frontend single source.** Replace the hardcoded A–H strings in `PerformanceCausalityCard.tsx` with a small FE mirror file (same pattern as `src/types/weekAhead.ts`) generated from the category list, so labels can't drift.
5. **Guard.** Extend `cross-layer.test.ts` with a check that no module outside `events/` imports `classifyEvent` directly, and that every subtype in the doc has a code row.

## Notes

- Steps 2 and 3 change *which* category an event resolves to on legacy surfaces (that is the point), so each affected engine with a cached payload — `cause-effect-engine` in particular — needs a version bump to force a one-time recompute.
- No scoring formula, threshold, weight or gate changes anywhere in this work.
- Rollout order: audit (1) → shared plumbing (2, 3) → frontend (4) → guards (5), verifying build/tests between each.
