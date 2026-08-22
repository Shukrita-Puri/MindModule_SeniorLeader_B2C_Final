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

`enrichEvent` is also the one place the system learns. It already routes through the 5-layer resolver, so every surface that adopts it inherits, in priority order: explicit user overrides → learned tokens promoted from confirmed history → the persisted `event_category`/`event_subcategory` stamped on the calendar row → the dictionary → an internal best guess with a confidence flag. Titles nobody has ever written a rule for (a new hotel chain, a new forum name) get attributed correctly on every surface at once, because there is only one place that decides.

1. **Reconcile the taxonomy with the uploaded schema.** Diff `FINAL_A_to_H_Schema_Summary-2.md` (pillar names plus every sub-category: `A.trustee`, `A.strategy`, `B.client_presentation`, `B.pitch_competitive`, `C.speaking`, `C.stakeholder_communication`, `C.media`, `C.roundtable`, `C.town_hall`, and D–H) against `event-subtypes.ts` and the alias map in `enrich-event.ts`. Write the gap list first, then add only the missing subtype rows / alias names. Existing subtype ids stay stable; doc-facing names come through the alias map.
2. **Repoint every consumer to `enrichEvent`.** Brief, Plan, JIT v2, Smart Nudges, both Insights engines, and `_shared/signal-engine/_event-utils.ts`. Week Ahead already resolves canonically but calls `resolveEventCategory` directly — it moves to `enrichEvent` too, so all eight surfaces share one call signature and one learning path.
3. **Delete the legacy surface.** Remove `_shared/executive-state-taxonomy.ts` once the last import is repointed; rehome the helpers it re-exported (`selectLeadEvent`, `dedupeCalendarEvents`, `isNoiseTitle`, `isEducationalTitle`) into `events/`. `classifyEvent`/`classifyEventLabel`/`classifyEventBucket` stop being public and become internals of the dictionary layer.
4. **One frontend source.** Add `src/types/eventCategories.ts` as the FE mirror of the A–H ids and names (same pattern as `src/types/weekAhead.ts`) and consume it in `PerformanceCausalityCard.tsx` in place of hardcoded strings.
5. **Guard it.** Extend `cross-layer.test.ts` with an import guard — no module outside `_shared/events/` may import `classifyEvent` or `executive-state-taxonomy.ts` — mirroring the Availability SSOT guard in `.github/CONTRIBUTING.md`, plus a check that every sub-category in the schema document has a code row.

## Launch risk — how this stays safe for next week

This is a wiring consolidation, not a rewrite. Nothing about scoring, weights, thresholds, gates or copy changes. Concretely:

- **Nothing gets disconnected.** Each consumer is repointed and its tests re-run before the next one is touched; a surface is never left importing a deleted module. The shim is deleted only after the last import is gone.
- **The behaviour delta is bounded and known.** The only user-visible change is that events which were previously keyword-missed (flights, hotel stays, holidays) now land in their true category. That is the fix being asked for.
- **Sequenced smallest-blast-radius first**, running the full suite between each: signal-engine → JIT v2 → Smart Nudges → Insights → Week Ahead → Brief → Plan → delete shim → frontend → guards. Any single step can stop or revert on its own.
- **Cutover option if the week is tight.** Steps 1, 4 and 5 are inert (taxonomy reconciliation, FE mirror, tests) and can land immediately. Steps 2–3 can be held behind the existing `shadowClassifyAndLog` parity logging so old and new resolutions are compared on live traffic before the flip. Say the word and I will land the inert half now and flip the rest after launch.

## Technical notes

- Steps 2 and 3 change *which* category some events resolve to on legacy surfaces (intended). Cached payloads must recompute: bump `ENGINE_VERSION` in `cause-effect-engine` and the equivalent cache keys for Plan/Brief snapshots.
- Learning-loop tables (`event_category_confirmations`, `event_learned_tokens`) and the nightly token roll-up already exist — this work makes them read on every surface rather than only Week Ahead and Plan. No new migrations expected; confirmed during step 1.
- Redeploy only the touched edge functions after each backend step.

