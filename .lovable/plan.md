
# Event Classifier v2 — Isolated Fix

Scope guard: classifier only. No changes to scoring, slot allocation, why-line LLM, JIT scoring math, Brief copy, or memory writes. Every existing call site keeps working unchanged until the flag flips.

## Build order

1. Schema (parity log table)
2. Pure modules (travel patterns, acronym dictionary, presentation verbs)
3. `classifyEventV2` layered resolver + parity logger
4. Snapshot test fixture
5. Audit `EDUCATIONAL_PATTERN` organiser-bypass in `generate-mastery-plan`
6. Flag-gated call-site swap (one consumer at a time, Plan + JIT first)
7. Populate-rate query for `event_metadata->>'location'` (decision input for a future Layer 4 pass)

## File list

New:
- `supabase/migrations/<ts>_event_classifier_parity_log.sql`
- `supabase/functions/_shared/events/travel-patterns.ts` — flight-number, route-code, "fly/travel/visit to X" regexes
- `supabase/functions/_shared/events/acronym-dictionary.ts` — token → existing subtype ID map (plus `gov.nonexec_board`)
- `supabase/functions/_shared/events/presentation-verbs.ts` — verb list for Layer 2
- `supabase/functions/_shared/events/classify-event-v2.ts` — layered resolver + parity logger
- `supabase/functions/_shared/events/__tests__/classify-event-v2.snapshot.ts` — fixture-driven snapshot test

Modified (additive only, no behaviour change until flag on):
- `supabase/functions/_shared/events/event-subtypes.ts` — add one row `gov.nonexec_board`; add optional `excludeKeywords?: string[]` field to schema (unused by v1)
- `supabase/functions/_shared/events/event-classifier.ts` — re-export `classifyEventV2`, keep `classifyEvent` untouched

Flag-gated swaps (one consumer per PR after parity green):
- `generate-mastery-plan/index.ts` — passes `attendeeRoles`, `isOrganizer`, `userTags`, `travelState`
- `generate-jit-events/index.ts` — same
- Then the other 11 surfaces, title-only callers

## Layered resolver contract

```ts
classifyEventV2(input: {
  title: string;
  isOrganizer?: boolean;
  attendeeRoles?: string[];   // optional, no-op if absent
  userTags?: string[];        // prefetched by caller, no DB read inside
  travelState?: 'home' | 'travelling' | 'arriving' | 'returning';
  eventMetadata?: Record<string, unknown>;  // for defensive status read
}): {
  category: EventCategory | null;
  subtypeId: string | null;
  confidence: 'high' | 'medium' | 'low';
  resolvedBy: 'layer0_status' | 'layer1_tags' | 'layer2_verbs' | 'layer3_roles'
            | 'layer4_travel_regex' | 'layer4_travel_state' | 'layer5_acronym'
            | 'layer6_dictionary' | 'layer7_v1_fallback' | 'unknown';
}
```

Layer order (first non-null wins):
- **L0 status** — `event_metadata->>'status'` cancelled/tentative → null (defensive; mostly no-op since cancelled events are deleted)
- **L1 userTags** — explicit user tag overrides everything
- **L2 verbs** — presentation verbs + `isOrganizer === true` → `vis.*`
- **L3 roles** — attendee role mix (board/investor/direct-report/customer) when passed
- **L4 travel** — `travel-patterns.ts` regexes on title, OR `travelState ∈ {travelling, arriving, returning}` with a travel-leaning title token
- **L5 acronym** — token match against acronym dictionary, with airport-code corroboration gate (3-letter all-caps token only counts as travel when L4 also fires or another travel cue is present)
- **L6 dictionary** — v2 keyword match with `excludeKeywords` honoured and word-boundary regex (fixes `onboarding`→`board`, `immediate`→`media`, `1:10`→`1:1`, `magma`→`agm`)
- **L7 v1 fallback** — calls existing `classifyEvent(title)` so we never regress in shadow mode

## Parity logging

Every v2 call (in shadow mode and after flip) writes one row:

```sql
event_classifier_parity_log (
  id uuid pk,
  user_id text not null,
  event_id uuid null,            -- calendar_events.id when available
  title_normalised text not null,
  v1_category text null,
  v2_category text null,
  v2_subtype_id text null,
  v2_confidence text not null,
  v2_resolved_by text not null,
  hard_demote_conflict boolean not null default false,  -- see below
  created_at timestamptz not null default now()
);
```

`hard_demote_conflict = true` when `v1_category ≠ v2_category` AND a row exists in `event_priority_memory` for `(user_id, v1_category)` with `hard_demote = true`. Surfaces the legacy-permanent-demote risk for manual review instead of letting it silently age out.

RLS: deny-by-default on `public`. Grants: `service_role` only. No `authenticated` reads — this is a diagnostic table.

## Acronym mapping policy

Map to existing subtype IDs only. Single additive row: `gov.nonexec_board`. Near-miss mappings get a `// REFINE: closest match for X, add dedicated subtype when taxonomy expands` comment inline. No taxonomy churn.

## Snapshot test

Fixture: ~80 real-world titles covering the known misses (`Onboarding`, `Flight showcase`, `Immediate`, `Run with team`, `1:10`, board/QBR variants, airport codes with and without travel context, presentation verbs, bland-titled exec meetings, the personal-noise overlaps). Test asserts `(category, subtypeId, resolvedBy)` per title and serves as the dictionary growth log — when you send me the post-rollout `other` list, new fixtures land here first.

## What we are explicitly NOT doing

- No Layer 4 location compare (deferred; we will run the `event_metadata ? 'location'` populate-rate query at the end of this pass and decide whether a follow-up `location text` migration is worth it; >40% populate = yes)
- No `attendee_relationships` change-trigger (Plan re-reads cache each run, consistent with existing model)
- No scoring/slot/Brief/why-line changes
- No taxonomy changes beyond `gov.nonexec_board`
- No migration of existing `event_priority_memory` rows (inert rows stay inert; conflicts surface via `hard_demote_conflict`)

## Rollout

1. Land schema + modules + resolver + snapshot test. Resolver shadow-runs from Plan + JIT entry points only, writing parity rows; existing behaviour untouched.
2. Watch parity log 3–7 days. You review divergences + `hard_demote_conflict` rows.
3. Flip flag per-consumer starting with Plan, then JIT, then the title-only surfaces in batches.
4. Run populate-rate query, hand result back to you for the Layer 4 decision.
5. Send you the list of titles still landing in `other` so we can grow the dictionary by data, not by guesswork.
