# CHANGE 2 — A–H category labels in the Brief LLM prompt (BUCKET 2)

LLM path only. No deterministic change, no scoring change, no schema change. One deploy: `compute-outer-readiness`.

## Verified current state

The priority chain in the card is real and already shared by both paths:

```text
EVENT_CATEGORIES (event-categories.ts)
  -> event-subtypes.ts (categoryId + demandProfile + primaryPillar)
  -> stakesScore()               (event-classifier.ts:252)
  -> rankByStakes()              (event-classifier.ts:320)  sorts highest-stakes first
  -> getServerCalendarMetrics()  (_shared/signal-engine/db-queries.ts:226)
       filters stakes >= 60, slices to 2
  -> todayHighStakes / tomorrowHighStakes  (compute-outer-readiness:3227-3228)
  -> LLM prompt            renders the ranked titles
  -> deterministic fallback anchors beat (c) on todayHighStakes[0]  (deterministic-brief.ts)
```

So the two paths already share one source and one order. What the LLM is missing is visibility: the prompt shows category *names* in a suffix but never states the letter IDs, the ordering contract, or the Cat-H rule.

Current prompt rendering (already live):
- CALENDAR TODAY block (index.ts ~7126-7168) renders `HH:mm Title [Category Name]` and already carries a one-line `EVENT IMPORTANCE GUIDE (A highest -> H lowest) ... Focus beat (c) on the highest-category event.`
- TOMORROW block (~7185-7199) renders `HH:mm, Title [Category Name]`
- `todayHighStakesCategories` / `tomorrowHighStakesCategories` already exist as parallel arrays via `categoryNameOf()` (returns the canonical name)
- `EVENT_CATEGORIES` already imported (index.ts:35) — no new import
- No test asserts the CALENDAR TODAY prompt text; golden fixtures are deterministic-only and unaffected

## The change — `supabase/functions/compute-outer-readiness/index.ts` only

### 1. CALENDAR TODAY block

Replace the high-stakes rendering inside the existing `if (calendarLoad)` block (lines ~7126-7167):

- Heading becomes `=== CALENDAR TODAY (classified) ===`
- Keep the existing `Load: ... · High-stakes meetings: N` line; keep Total meetings, Back-to-back, Next event, Next high-stakes, and CLOCK TIME RULE lines untouched
- Replace the paired list + one-line EVENT IMPORTANCE GUIDE with:
  - `Events are listed highest-priority first. Priority is computed by the canonical A–H taxonomy:` plus the two-line hierarchy (A-D / E-H), category names taken from `EVENT_CATEGORIES` (not hardcoded)
  - `Rule: Cat H events (gym, run, social, family, catchup, daily rhythm) are NEVER the work directive anchor — even if they are the only event listed.`
  - `Focus beat (c) on the highest-category event.` (kept from the current guide)
  - Per-event lines `\n  HH:mm [Cat-X] Title` where the letter is derived via `Object.values(EVENT_CATEGORIES).find(c => c.name === catName)?.id ?? ''` (falls back to `[name]`, then plain title). Same index as `todayHighStakes[i]` / `todayHighStakesCategories[i]`
  - `\n  No classified meetings today.` when the array is empty

### 2. TOMORROW block

Same treatment on `tomorrowHighStakesTitles` / `tomorrowHighStakesEventTimes` / `tomorrowHighStakesCategories` (same indices): priority note, hierarchy, Cat-H rule, and `[Cat-X]` labels. Keep the existing `=== TOMORROW ===` heading and the Day / Load / First scheduled meeting / Tomorrow vs today lines.

### 3. Explicit non-changes

- `todayHighStakesCategories` derivation, `rankByStakes`, `getServerCalendarMetrics` — read-only
- Deterministic fallback (`deterministic-brief.ts`) — untouched; it already anchors on the same ranked array
- BODY_FOUR_BEAT_CONTRACT, `BRIEF_PROMPT_VERSION`, payload shape — untouched
- No new imports

## Priority-source consistency (closing note)

Verified by reading the chain above:

- LLM path: receives the ranked list; after this change it also sees letter IDs and the ordering contract
- Deterministic path: already anchors on `todayHighStakes[0]` (same ranked array) — already consistent, no code change
- JIT V2 (`generate-jit-events`): uses a different, deliberate selection axis (resolveEvent subtype + learned `importance_score` + urgency horizon) per the JIT v2 selection contract. Aligning it to stakes rank is out of scope — `generate-jit-events` is frozen for launch. Noted as a post-launch consistency item; no code touched

## Out of scope (launch safety)

Only `compute-outer-readiness/index.ts` is edited. No other function, no frontend file, no migration, no `_shared/events/`, `_shared/signal-engine/`, validator, or persona-copy files. One deploy: `compute-outer-readiness`. `BRIEF_PROMPT_VERSION` not bumped (data-availability prompt enrichment, not an output-contract change).

## Verification

Code checks (from the card's checklist): parallel indices; letter derived from `EVENT_CATEGORIES`; all eight categories listed; Cat-H rule line present; no new import; ordering note present.

Tests:
- `deno test supabase/functions/_shared/brief` — green
- `deno test supabase/functions/_shared/personas` — green
- 174 golden-set fixtures unchanged (prompt-only change; deterministic untouched)

Live:
- Deploy `compute-outer-readiness` only
- One live invocation; confirm generation succeeds and `brief_snapshots.payload_json.highStakesEventsDetailed` carries the correct category per title — the same parallel arrays the labels render from
- Note: the raw userPrompt is not persisted in payload_json, so label rendering is confirmed by code review of the rendering block plus the verified parallel-array data; the `[brief-provenance]` log confirms which path ran
- Honest expectation on the card's example: a gym/run title normally scores below the stakes >= 60 floor and never enters `todayHighStakes`, so a day with a board call usually lists only the board call (Cat A). The Cat-H rule is defensive for H-category events that do qualify (e.g. a 4h+ back-to-back block) — it renders last with its label and the rule forbids anchoring the directive to it