## What's already in place

I read `relationship-weights.ts`, the `generate-mastery-plan` resolver loader (lines ~161–222), and `resolve-attendee-relationship`. The chain you describe is partially built:

| Step | Status today |
| --- | --- |
| 1. User-declared tag (`source=user_tag`) | ✅ shipped (last turn — bridge from `record-event-priority-signal`) |
| 2. Memory replay (prior tags / prior resolutions) | ❌ not implemented — `event_priority_memory` rows tagged with `tag_relationship` are written, but nothing reads them back as relationship signal |
| 3. Firecrawl/LinkedIn cached role | ✅ shipped — read in loader, late-resolve fire fixed Issue 9 |
| 4. Domain-based heuristic | ❌ not implemented — `isGenericDomain` exists but no internal/external classification |
| 5. `unknown` no-penalty | ✅ shipped — weight=0 floor |
| Confidence gating | ❌ not implemented — `attendee_relationships.confidence` is stored but never multiplied into weight |
| Multi-attendee `dominantRole` | ✅ shipped |

So three concrete additions: memory replay (step 2), domain heuristic (step 4), and confidence gating across both LLM-inferred and heuristic sources.

---

## Plan

### Step 1 — Confidence gating in `relationshipWeight`

Extend `relationshipWeight(role, confidence?, source?)` in `relationship-weights.ts`:

- `source === 'user_tag'` or `source === 'memory_user_tag'` → full weight, no discount.
- Otherwise apply a confidence multiplier:
  - `confidence >= 0.75` → ×1.0
  - `0.5 ≤ confidence < 0.75` → ×0.6
  - `confidence < 0.5` (or null) → ×0.3
- Domain-heuristic source is treated as `confidence ≈ 0.4` so it nudges (≈×0.3) rather than dominates. Boss/board still nets ~7–8 pts, peer ~2, which is the "directional but weak" behaviour you described.

### Step 2 — Domain-based heuristic (step 4 of your chain)

Add `inferRoleFromDomain(attendeeEmail, userEmail | userCompanyDomain)` to `relationship-weights.ts`. Logic:

- Generic domain (gmail/outlook/etc.) → `unknown`, confidence null. Never promote.
- Domain matches user's own domain → `peer`, confidence `0.5` (internal — could be report/boss/peer, we conservatively pick peer).
- Domain differs and isn't generic → `external_partner`, confidence `0.4`.

The user's domain comes from `profiles.email`. Loader passes `userOwnDomain` into the role map build. Heuristic only fills entries the cached `attendee_relationships` lookup didn't already cover — never overrides a real resolver result.

This closes the race: an external meeting whose attendees haven't been resolved yet scores `external_partner ≈ 15 × 0.3 ≈ 4–5` immediately instead of `0`, enough to stay in candidacy while the async resolver catches up. Next run, the cached high-confidence role replaces the heuristic.

### Step 3 — Memory replay (step 2 of your chain)

In the `generate-mastery-plan` loader, after the cached-role + late-resolve pass and before the heuristic fallback, query `event_priority_memory` for the same user where `signal = 'tag_relationship'` and `meta->>'relationshipTag'` is present.

For each row, look up the linked event's attendees once and stamp the mapped `ResolvedRole` (using the existing `RELATIONSHIP_TO_ROLE` table in `record-event-priority-signal`) onto those emails as `source='memory_user_tag'`, full weight, no decay — but only if the email currently resolves to `unknown` or has no cached row. This means: once you tag "Boss" on a recurring 1:1, future occurrences with the same attendee skip Firecrawl entirely.

Bounded by the same email-set already being iterated; no extra round trip beyond one indexed query.

### Step 4 — Wire `source` + `confidence` through `SelectInputEvent`

`SelectInputEvent.attendeeRoles` is currently `ResolvedRole[]`. Replace with:

```
attendeeRoles: { role: ResolvedRole; source: 'user_tag' | 'memory_user_tag' | 'llm' | 'domain_heuristic'; confidence: number | null }[]
```

`dominantRole` becomes "highest *weighted* role" using the new confidence-aware `relationshipWeight`. So a high-confidence Boss beats a domain-heuristic peer even though both have weight > 0.

### Step 5 — Tests (Deno, `select-jit.test.ts`)

- Memory replay: prior `tag_relationship=Boss` on an email lifts a bland-title meeting above MIN_IMMEDIATE without any cached `attendee_relationships` row.
- Domain heuristic: external_partner@acme.com on a meeting with the CEO (whose domain is sov.co) lifts the score above 0 but stays below a high-confidence Boss.
- Confidence gating: same role with `confidence=0.4` produces ~30% of the importance contribution of `confidence=0.9`.
- Sovereignty: `user_tag` Boss always beats `llm` Investor regardless of LLM confidence.

### Files touched

- `supabase/functions/_shared/jit/relationship-weights.ts` — add `inferRoleFromDomain`, extend `relationshipWeight` signature, add `weightedDominantRole`.
- `supabase/functions/_shared/jit/select-jit.ts` — new `AttendeeRoleSignal` shape; use weighted dominant + confidence-aware weight in `immediate`.
- `supabase/functions/generate-mastery-plan/index.ts` — load user email/domain, add memory-replay pass and domain-heuristic fill, build the richer `attendeeRoles` array.
- `supabase/functions/_shared/jit/select-jit.test.ts` — four new tests above.

### Explicitly NOT in scope

- No change to `RELATIONSHIP_WEIGHT` numbers themselves (board/boss 25, investor 20, …). Only how they're scaled.
- No new edge function or cron — heuristic runs inline in plan generation, free.
- No schema change. `attendee_relationships.confidence` already exists; `event_priority_memory` has what we need.

### Open questions before I implement

1. **User's own domain source**: I'd read `profiles.email` (whatever's already there) and strip the domain. Confirm that's the right source, or do you want a dedicated `profiles.company_domain` field? (Stripping `email` is zero-effort; a dedicated column is cleaner if a user's login email ≠ their work domain.)
2. **Domain-heuristic for `peer` (internal)** — confidence `0.5` gives weight ≈ 5. Is that the right floor, or do you want internal attendees treated as effectively zero until the resolver lands? My read of your §C is "directional only," so 5 feels right, but call it.