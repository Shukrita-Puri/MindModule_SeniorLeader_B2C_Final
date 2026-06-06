## Scope (isolated — Plan only)

Touches **only** the Plan's "Why this matters" LLM path and the deterministic title that pairs with it:

- `supabase/functions/_shared/plan/why-llm.ts` — new system prompt, user block, validator, anchor-token helper, telemetry return shape.
- `supabase/functions/_shared/plan/title-prefixes.ts` — rename `BuildPriorityTitleInput.eventTitle/category` to `slotAnchorEventTitle/slotAnchorCategoryId`; introduce a shared `SlotAnchor` value object.
- `supabase/functions/generate-mastery-plan/index.ts` — pass the shared band off `shared.briefBehaviour`, derive `arcPosition` from `jitPhase`, build one `SlotAnchor` per slot and feed both the title builder and Why LLM input from it; tighten `composeWhyLine` to read the slot-scoped anchor.
- Tests: extend `supabase/functions/_shared/plan/priority-title.test.ts` (cross-event leakage); add `supabase/functions/_shared/plan/why-llm-validator.test.ts`.
- Docs/memory: append "Why-line ownership" block to `mem/features/mastery-plan/slot-model-v5.md`; new `mem/features/mastery-plan/why-line-prompt-contract.md`; update Why-line section in `docs/MASTERY_PLAN_CONTEXT_LOGIC.md`.

**Out of scope (no change):** Brief prompt/copy, Plan slot ordering, JIT horizon, dedupe key, MRS scoring, signal pills, UI components, DB schema, RLS, edge function config, `_shared/text/sanitise.ts` (reused as-is).

---

## 1. Shared state band — single source, never re-banded

Add to `WhyLLMInput`:

```ts
stateBand: 'firing' | 'sharp' | 'steady' | 'stretched' | 'depleted' | null;
arcPosition: 'prepare' | 'during' | 'recover' | 'standalone';
slotAnchor: SlotAnchor; // see §4
```

`stateBand` is read directly off `shared.briefBehaviour.band` — the same server-computed band powering the MRS dial and the Brief. **No independent re-banding.** If absent → `null`, the prompt drops the band-discipline block, the validator's valence gate is skipped (event-anchor grounding still required), and telemetry records `bandSource='missing'`.

`arcPosition` mapping from `jitPhase`:

```
'pre'       → 'prepare'
'during'    → 'during'
'post'      → 'recover'
undefined   → 'standalone'
any other   → 'standalone'   (defensive — future jitPhase values never crash)
```

Same `jitPhase` field the dedupe key `${eventId}::${jitPhase}` uses, so justification and dedupe agree on what "different" means.

---

## 2. Why-line system prompt rewrite (`why-llm.ts`)

Replace `buildPrompt`'s system text with:

- **Role**: Chief of Staff handing over one move; "Brief orients; Plan justifies."
- **Three-part connection** (STATE + EVENT + REASON) named as the target — guidance only, *not* a hard validator rule (avoid over-rejection; see §3).
- **State-band discipline** (only when band ≠ null):
  - firing / sharp → focus / edge / clarity framing; avoid recovery verbs.
  - depleted / stretched → "this is how you get ready for X"; protection/recovery framing welcome.
  - steady → either; let event + practice decide.
- **Arc awareness** keyed off `arcPosition` — encouraged, not enforced via lexical check (see §3.4).
- **Hard constraints**: one sentence; no wellness words (`recharge|self-care|mindful|breathe|nourish|restore|wellness|journey|calm|relax`); no clinical jargon (`parasympathetic|cortisol|sympathetic`); never name the score / band / state-band word; no system phrases ("optimise the window", "hold the base", "for your state").

**User block** (assembled deterministically — band/event/anchor sections omitted entirely when their inputs are null):

```
=== STATE ===
Band: <stateBand>  (match; do not name)
Most relevant signal: <derived from existing wearable/check-in fields>

=== THIS PRACTICE ===
Practice: <hm.practice.title | practices[0].title>
Protocol combo: <hm.timeLabel pre-override OR practice.type chain>
Arc position: <arcPosition>

=== THE EVENT ===            (only if slotAnchor.eventTitle)
Event: <slotAnchor.eventTitle>
Category: <slotAnchor.categoryId — EVENT_CATEGORIES[id].name>
When: <relativeEventPhrase(minutesUntilStart) — "in 2h", "tomorrow morning", "just finished">
Why it's a moment: <EVENT_PHASE_MAP[cat][phase].preventsBuilds joined>

=== ELSE ===                 (no anchor)
State-management — justify by day's state, not a calendar moment.
```

`relativeEventPhrase` lives in `_shared/text/sanitise.ts` — reused as-is.

---

## 3. Post-generation validator (`validateWhyLine` in `why-llm.ts`)

Returns `{ ok: true } | { ok: false, reason: ValidatorReject }`. **Asymmetric and forgiving** — engineered to fail closed only on clear contradictions, not on stylistic variance.

### 3.1 Anchor-token derivation (forgiving)

Per-anchor token set built once and reused by validator + telemetry:

```ts
function anchorTokens(title: string): Set<string> {
  const STOP = new Set(['the','a','an','and','or','with','for','of','to','in','on','at','your','my','this','that']);
  return new Set(
    title.toLowerCase()
      .replace(/[^\p{L}\p{N}:\s]/gu, ' ')   // keep "1:1", drop other punct
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOP.has(t))
      .concat(EVENT_TYPE_ALIASES[catId] ?? []) // e.g. ['board','meeting','session','call','review'] for cat A
  );
}
```

A second word-set is harvested from `EVENT_CATEGORIES[cat].selfRegulationFocus` so "conversation" satisfies a "1:1 with Sarah" anchor.

### 3.2 Anchor / state grounding (asymmetric)

```
if (textHasAnchorToken) → grounded ✓
else if (textHasStateToken) → grounded ✓        // state-mgmt slots, or anchor-less LLM phrasing
else → reject('generic')
```

State allowlist is *narrow* and band-keyed (only checked when band ≠ null):

- depleted/stretched: `/\b(low|running low|reserves|stretched|tired|drained|behind)\b/i`
- firing/sharp:       `/\b(sharp|firing|clear|edge|locked in|on form)\b/i`
- steady:             `/\b(steady|holding|on track|even)\b/i`

If band is null, any anchor token alone is sufficient — no state token required.

### 3.3 Valence gate (narrowed — only obvious contradictions)

Only checked when band ≠ null. Narrower than the original draft to avoid rejecting legitimate "protects the attention you'll need" copy on a sharp day.

```
firing/sharp + /\b(recover|recovery|recharge|wind down|come down|refill|rest up)\b/i
  → reject('valence_firing_recovery')
depleted/stretched + /\b(push|sprint|spend the edge|go harder|lean in|grind)\b/i
  → reject('valence_depleted_push')
```

`protect`, `preserve`, `maintain`, `hold`, `clear` are deliberately **not** rejected — they read as performance language across all bands.

### 3.4 No lexical arc check

Arc awareness is prompt-guided only. We do not validate "contains 'before'" / "contains 'after'" — that drives template fatigue and rejects good copy.

### 3.5 Duplication

Keep existing `jaccard > 0.85` check, but **gated** to: same `slotAnchor.eventTitle` AND same `arcPosition`. Two slots for different events can read similarly without rejection; two slots for the same event/arc still get caught.

### 3.6 Fallback path

On any reject → drop the LLM output and fall through to the existing deterministic `buildModuleEventWhyLine` repair already at `index.ts` lines 4631–4651. No retry, no second LLM call.

---

## 4. Slot identity — single `SlotAnchor` value object

New shared type (in `title-prefixes.ts`, re-exported):

```ts
export interface SlotAnchor {
  eventTitle: string | null;
  categoryId: EventCategoryId | null;
  phase: Phase | null;
}
```

`buildPriorityTitle` and `composeWhyLine` both accept a `SlotAnchor` (plus the existing surrounding inputs). Constructed once per slot in `index.ts`:

```ts
const slotAnchor: SlotAnchor = {
  eventTitle: hm.jitEventTitle ?? hm.anchorEventTitle ?? null,
  categoryId: hm.anchorCategoryId ?? hm.jitCategoryId ?? null,
  phase:      hm.jitPhase ?? null,
};
```

This kills the "Board Meeting" + "EXERCISE category" drift class structurally.

`composeWhyLine` already takes `slotAnchorCategoryId` — extend to read `slotAnchor.eventTitle` from the same object, and gate every anchor clause on **both** `categoryId` and `eventTitle` being present. Never emit an anchor clause with only one of them.

---

## 5. Telemetry (additive, function-log only)

Added to per-slot debug payload (existing `console.warn` paths):

```
whyLine.bandUsed         : stateBand | null
whyLine.bandSource       : 'shared_brief_behaviour' | 'missing'
whyLine.arcPosition      : prepare|during|recover|standalone
whyLine.fallbackPath     : 'llm_accepted' | 'deterministic_repair'
whyLine.validatorReject  : null | 'generic' | 'valence_firing_recovery' | 'valence_depleted_push' | 'jaccard_dup' | 'empty'
whyLine.anchorTokensUsed : true | false
```

No DB columns, no client payload changes. Lets us watch fallback rate and tune the validator from real traffic before tightening anything further.

---

## 6. Tests

**`priority-title.test.ts`** — add:
- `slotAnchorEventTitle='Q2 Board Meeting'`, `slotAnchorCategoryId='E'` → title uses E's verb/objective ("Sharpen sustained focus in …"), never an A-only verb. Proves cross-event leakage is structural-impossible.
- `SlotAnchor` with `eventTitle=null, categoryId='A'` → state-management fallback path, no "after the null".

**`why-llm-validator.test.ts`** (new, Deno test) — covers:
- band=null + anchor token present → accept (band gate skipped).
- band=null + no anchor token, no state token → reject `generic`.
- firing + "this clears your head and lets you recover" → reject `valence_firing_recovery`.
- firing + "this protects the attention you'll need for the board" → **accept** (`protect` is not banned).
- depleted + "push the afternoon block" → reject `valence_depleted_push`.
- depleted + "you're running low and the board's at 2 — this clears your head" → accept.
- title "1:1 with Sarah" + body "Before your conversation with Sarah…" → accept via alias token `conversation`.
- two outputs, same event + same arc, jaccard 0.9 → second rejected `jaccard_dup`.
- two outputs, different events, jaccard 0.9 → both accepted.

Run via `supabase--test_edge_functions`.

---

## 7. Docs + memory

- `docs/MASTERY_PLAN_CONTEXT_LOGIC.md` — rewrite Why-line section with: three-part connection (target, not validator), narrowed valence gate, `SlotAnchor` contract, arc-position dedupe partner, telemetry fields.
- `mem/features/mastery-plan/slot-model-v5.md` — append `## Why-line ownership`: Plan owns "how do I improve my readiness", Brief never does; band shared not re-derived; asymmetric validator; fallback path; telemetry must be monitored before tightening.
- New `mem/features/mastery-plan/why-line-prompt-contract.md` — captures the prompt snapshot + validator contract for future refactors (mirror of `prompt-snapshot-brief.md`).

---

## Technical notes

```text
generate-mastery-plan
  └─ per module
      ├─ slotAnchor = { eventTitle, categoryId, phase }   ← single source
      ├─ buildPriorityTitle({ slotAnchor, isTomorrow, practicePriorityTag })  (deterministic)
      └─ if (slotAnchor.categoryId) queue WhyLLMInput {
             stateBand:    shared.briefBehaviour?.band ?? null,
             arcPosition,                  ← from slotAnchor.phase
             slotAnchor,                   ← same object as title
             …existing wearable/checkin fields
         }
  └─ Promise.all(generateWhyStatement)
  └─ validateWhyLine → accept | record reject reason → buildModuleEventWhyLine fallback
  └─ stripBriefMarkdown → persist
```

### Risks addressed by this revision

1. **Validator false positives** → asymmetric grounding rule (§3.2), narrowed valence regex (§3.3), no lexical arc check (§3.4).
2. **Event-token brittleness** → alias set per category + content-word tokenizer that keeps `1:1` and drops short stopwords (§3.1).
3. **Binary band discipline** → only `recover/recovery/recharge/wind down/come down/refill/rest up` blocked on firing/sharp; `protect/preserve/maintain/hold` allowed (§3.3).
4. **Arc-position rigidity** → prompt-guided only, no validator string check (§3.4).
5. **Fallback quality gap** → telemetry counts fallback rate (§5); validator deliberately permissive to keep LLM path dominant.
6. **Anchor identity drift** → single `SlotAnchor` value object eliminates mismatched pair construction (§4).
7. **Shared-band staleness** → `bandSource` telemetry surfaces missing-band rate (§5); prompt + validator degrade gracefully when band is null (§1, §3.2).
8. **Jaccard over-firing** → dedupe only triggers on same event + same arc (§3.5).
9. **Future jitPhase values** → mapping has explicit `default → 'standalone'` (§1).

### Rollback

Revert the three source files + the two test files. No DB migration, no schema change, no client contract change.
