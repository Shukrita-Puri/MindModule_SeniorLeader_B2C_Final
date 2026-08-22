# One A–H entry point for every feature; delete the legacy paths

## Where A–H lives today

Under `supabase/functions/_shared/events/`:

| File | Owns | Keep? |
|---|---|---|
| `event-categories.ts` | The eight pillars A–H: id, name, self-regulation focus, trigger inventory, Pre/During/Post protocol | keep — single pillar source |
| `event-subtypes.ts` | 55 subtypes (`gov.*`, `inf.*`, `vis.*`, `lead.*`, `str.*`, `conf.*`, `trv.*`, `rhy.*`) with `categoryId`, keywords, demand profile, JIT lead time | keep — single subtype source |
| `classify-event-v2.ts` + `resolve-event-category.ts` | 5-layer resolution: user override → learned tokens → persisted `event_category` → dictionary → unresolved | keep — internal layers |
| `enrich-event.ts` | `enrichEvent(raw)` → category + subcategory + phases + demand + scenario. Already calls the resolver. | **keep — this becomes THE entry point** |
| `event-phase-map.ts`, `learning-store.ts`, `acronym-dictionary.ts`, `travel-patterns.ts`, `presentation-verbs.ts`, `format-taxonomy.ts` | Supporting layers | keep |
| `event-classifier.ts` → `classifyEvent(title)` | Keyword-only v1. Ignores overrides, learned tokens and persisted categories. | **demote to an internal dictionary layer; no external callers** |
| `_shared/executive-state-taxonomy.ts` | Transitional re-export shim | **delete** |

## What each feature is wired to right now

| Feature | Current entry point |
|---|---|
| Brief (`compute-outer-readiness`) | `enrichEvent` **and** raw `classifyEvent` v1 + shim `selectLeadEvent` |
| Plan (`generate-mastery-plan`) | `enrichEvent`, `classifyEvent` v1, subtypes, phase map, learning store, shim imports |
| Week Ahead (`list-week-ahead-priorities`) | `resolveEventCategory` + `enrichEvent` — already canonical |
| JIT v2 (`generate-jit-events`, `_shared/jit/*`) | `classifyEvent` v1 via the shim only |
| Smart Nudges | `EVENT_CATEGORIES` + phase map + `classifyEvent` v1 via the shim |
| Insights — Drains (`cause-effect-engine`) | `EVENT_CATEGORIES` + shim helpers |
| Insights — Rhythm (`performance-rhythm-insights`) | only `dedupeCalendarEvents` from the shim; no classification |
| Signal engine (`_shared/signal-engine/_event-utils.ts`) | `classifyEvent` v1 via the shim |
| Frontend | `src/components/insights/PerformanceCausalityCard.tsx` hardcodes A–H name strings |

Only two call sites go through the 5-layer resolver. Everything else keyword-matches the title, which is why the New York flight and DoubleTree stay landed under "Daily Rhythm & Baseline" in Insights.

## The change

**Rule after this work: every feature calls `enrichEvent(raw)` and nothing else.** All category, subcategory, phase, demand, lead-time and scenario reads come off the `EnrichedEvent` it returns. No feature imports `classifyEvent`, the shim, or a hand-rolled A–H list.

1. **Reconcile the taxonomy with the uploaded schema.** Diff `FINAL_A_to_H_Schema_Summary-2.md` (pillar names plus every sub-category: `A.trustee`, `A.strategy`, `B.client_presentation`, `B.pitch_competitive`, `C.speaking`, `C.stakeholder_communication`, `C.media`, `C.roundtable`, `C.town_hall`, and D–H) against `event-subtypes.ts` and the alias map in `enrich-event.ts`. Write the gap list first, then add only the missing subtype rows / alias names so code and document agree. Existing subtype ids stay stable; the doc-facing names come through the alias map.
2. **Repoint every consumer to `enrichEvent`.** Brief, Plan, JIT v2, Smart Nudges, both Insights engines, and `_shared/signal-engine/_event-utils.ts`. Same behaviour contract, single resolution path, so overrides and learned tokens now apply everywhere.
3. **Delete the legacy surface.** Remove `_shared/executive-state-taxonomy.ts` after the last import is repointed; move the still-needed helpers it re-exported (`selectLeadEvent`, `dedupeCalendarEvents`, `isNoiseTitle`, `isEducationalTitle`) into their proper `events/` homes. Stop exporting `classifyEvent`/`classifyEventLabel`/`classifyEventBucket` publicly — they become internals of the dictionary layer.
4. **One frontend source.** Add `src/types/eventCategories.ts` as the FE mirror of the A–H ids and names (same pattern as `src/types/weekAhead.ts`) and consume it in `PerformanceCausalityCard.tsx` in place of hardcoded strings.
5. **Guard it.** Extend `cross-layer.test.ts` with an import guard — no module outside `_shared/events/` may import `classifyEvent` or `executive-state-taxonomy.ts` — mirroring the Availability SSOT guard described in `.github/CONTRIBUTING.md`, plus a check that every sub-category in the schema document has a code row.

## Technical notes

- Steps 2 and 3 change *which* category some events resolve to on the legacy surfaces (that is the intent). Cached payloads must recompute: bump `ENGINE_VERSION` in `cause-effect-engine`, and equivalent cache keys for Plan/Brief snapshots.
- No scoring formula, weight, threshold or gate changes anywhere in this work.
- Rollout to keep launch risk low: (1) reconcile + tests → (2) repoint one consumer per step, running the suite between each, in order signal-engine → JIT → Nudges → Insights → Brief → Plan → (3) delete shim → (4) frontend → (5) guards.
- Redeploy after each backend step: the touched edge functions only.
