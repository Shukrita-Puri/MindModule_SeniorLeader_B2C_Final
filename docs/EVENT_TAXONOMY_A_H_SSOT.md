# Event Taxonomy A–H — Single Source of Truth

> **Status**: Canonical. Documentation only — this file describes code, it does not duplicate it.
> **Last updated**: 2026-08-29
> **Code SSOT**: `supabase/functions/_shared/events/`
> **Frontend mirror**: `src/lib/events/categories.ts` (display only — never a second resolver)

---

## 1. The eight pillars

| Id | Name | Owned by |
|---|---|---|
| A | Board & Governance | `_shared/events/event-categories.ts` |
| B | Influence & Persuasion | ″ |
| C | Visibility & Communication | ″ |
| D | Interpersonal High-Stakes | ″ |
| E | Deep Work & Strategy | ″ |
| F | Conferences & External Events | ″ |
| G | Travel | ″ |
| H | Daily Rhythm & Baseline | ″ |

`EVENT_CATEGORIES` owns each pillar's id, user-facing name (used verbatim as the Insights bucket label), `selfRegulationFocus`, the canonical `triggers` inventory, and the Pre/During/Post protocol contract.

---

## 2. One entry point

`resolveEvent()` in `_shared/events/resolve-event-category.ts` is the **only** permitted way any surface — Brief, Plan, JIT, Week Ahead, Smart Nudges, Insights, signal engine — obtains a category. No feature may re-implement matching, keyword lists, or category guessing. The legacy shim has been deleted.

It returns `ResolvedEvent`: `{ subtype, categoryId, category, subcategory, bucket, label, scenarioId, confidence, source, enriched }`.

### Resolution layers (first match wins)

```text
1. User override            explicit user tag on the event
2. Learned token map        confirmed history (event_learned_tokens)
3. Persisted classification calendar_events.event_category / _subcategory
4. Layered classifier       classify-event-v2 -> subtype + acronym dictionary
5. Unresolved               categoryId null, confidence reported honestly
```

Layer 5 is a legitimate outcome. A null category means "we did not recognise this event", not "this event does not exist".

---

## 3. Scope boundaries

| Concern | File |
|---|---|
| Pillars, names, triggers, protocols | `event-categories.ts` |
| Granular subtypes, keywords, demand profile, JIT lead time | `event-subtypes.ts` |
| Acronyms and org-specific shorthand (RFP, QBR, …) | `acronym-dictionary.ts` |
| Layered classifier | `classify-event-v2.ts` |
| Content-vs-room intent (strong / weak / counter markers) | `event-intent.ts` |
| Title-only two-party inference | `two-party-title.ts` |
| Per-phase prescriptions | `event-phase-map.ts` |
| Enrichment (phases, demand, travel arc, lead time) | `enrich-event.ts` |
| Learning loop storage | `learning-store.ts` |

---

## 4. Governing rules

**Volume is factual; classification is interpretive.** Calendar load — light / busy / heavy, and true-zero "open day" — is derived from the deduplicated event set and is never changed by whether the resolver recognised an event. Unclassified events still count toward load. Classification governs only *naming* and high-stakes treatment.

**Deduplication precedes counting.** Counts come from the cross-provider (Apple + Google) deduplicated set with overlapping slots collapsed. No surface counts raw provider rows.

**Two-party inference is title-only.** Separators (`|`, `/`, `<>`, `-`), conjunctions, and person-like connector forms (catch-up, touch-base, 1:1) may establish a two-party meeting. Attendee count and duration may **not** — an empty calendar block is a legitimate reminder. Attendee data is used only to characterise the relationship (boss, colleague, interview). Social/group forms and stronger A–H matches override the heuristic.

**Intent beats surface words.** `event-intent.ts` distinguishes content from room using STRONG, WEAK and COUNTER markers, so a panel or fireside is not filed as passive learning.

---

## 5. Learning loop

```text
user override -> event_category_confirmations
                      |
             nightly SQL roll-up
                      v
             event_learned_tokens  ->  layer 2 of resolveEvent()
                      |
             event_priority_memory (persistence of what mattered)
```

Confirmed titles promote tokens; promoted tokens are read by the single resolver on every surface, so a correction made once applies everywhere.

---

## 6. Tests that hold the contract

| Test | Holds |
|---|---|
| `cross-layer.test.ts` | Every subtype label maps to a canonical pillar trigger |
| `classify-event-v2.test.ts` | Layer ordering and confidence |
| `event-tagging-v2.test.ts` | End-to-end A–H tagging |
| `two-party-title.test.ts` | Title-only inference, no attendee evidence |
| `taxonomy-user-examples.test.ts` | Real user titles |
| `schema-verification-cases.test.ts` | Persisted-column round trip |

Changing taxonomy behaviour is live-affecting: redeploy every consuming edge function (`compute-outer-readiness`, `generate-mastery-plan`, `generate-jit-events`, `smart-nudges`, `cause-effect-engine`, and the calendar sync functions) in the same change.
