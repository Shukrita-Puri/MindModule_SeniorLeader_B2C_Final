
# Brief + Plan refactor — shared modules own logic, LLM owns voice

Scope is targeted: two edge functions (`compute-outer-readiness`, `generate-mastery-plan`), the shared signal-engine context modules, the brief behaviour snapshot loader, one new `copy-vocabulary.ts` shared module, and three audit/spec docs. Onboarding, MRS scoring, event taxonomy, protocol combos, ledger merging and tier logic are NOT touched.

The June 3 guidance is treated as the authoritative spec for the Brief prompt. Plan changes are limited to the shared-snapshot contract + duplicate-event dedupe; the Plan's deterministic core is left in place.

---

## 1. New shared module: `copy-vocabulary.ts`

Create `supabase/functions/_shared/brief/copy-vocabulary.ts` and move all prompt persona / voice strings out of `compute-outer-readiness/index.ts`:

- `CHIEF_OF_STAFF_PERSONA` — verbatim §3 / §9 system block from the guidance.
- `VOICE_SOUND_LIKE` and `VOICE_NEVER_SOUND_LIKE` examples banks.
- `FORBIDDEN_WORDS` (wellness + clinical + score-tier lists, hard blacklist).
- `PRIORITY_ORDER` resolution rule (CEO flag > lead-event phase > divergence > pattern).
- `WORKED_EXAMPLES` (the four phrase/body pairs in §9).
- `OUTPUT_CONTRACT_JSON` schema description.

This is the single source of truth for prompt voice. The Brief edge function imports it; nothing else duplicates it. Addresses audit finding F-07.

---

## 2. Brief refactor — `compute-outer-readiness/index.ts`

The current file is ~5,300 lines, most of which is one giant prompt builder that re-derives logic the shared modules already compute. The refactor strips that out without rewriting unrelated machinery (DB writes, signature hashing, validators, tier logic, signal-pill computation).

### 2a. Delegate everything to shared modules before the prompt

Right before the prompt is built, assemble a single `briefContext` object by calling, in order:

- `buildBehaviourSnapshot({ coverage, extras })` — already exists; reuse its `promptBlockBrief`, `taxonomyBlock`, `signatureHash`.
- The correct `buildMorningContext` / `buildAfternoonContext` / `buildEveningContext` for the current window — currently only partially used. Promote their typed output (yesterday load, sleep, HRV/RHR deviation, vetoRisk, decisionLeakageRisk, dayKind, conferenceDayNumber, recoveryNote, tomorrow load on evenings) to the canonical `=== CONTEXT ===` block.
- `classifyEvent` + `phaseForEvent` per calendar event — produce the enriched per-event row (category A–H, phase, combo, builds/prevents). Stop letting the LLM classify.
- `causality_findings.signal_summary` query — filter to today's lead-event category + today's anomalous wearable (gated by check-in count ≥ 3). Mirror the JIT access path already in `tactical-signals.ts`.

### 2b. Rewrite the user-prompt assembly to the §8 block order

Replace the current ad-hoc block order with the exact §8 order, blocks omitted when empty so highest-priority survives truncation:

```
1. === ONBOARDING / LEADERSHIP PROFILE ===
2. === CEO BEHAVIOUR ===
3. === CONTEXT: [MORNING|AFTERNOON|EVENING] ===   (dayKind carries travel/PTO/holiday/conference)
4. === READINESS ===                              (reasoning-only; never echoed)
5. === WEARABLE ===
6. === CALENDAR TODAY ===                         (per-event category/phase/combo/goal)
7. === TOMORROW ===                               (evenings / Fri / Sun)
8. === PATTERNS ===                               (causality store, gated)
9. === WEEK AHEAD ===                             (Sun evening only)
```

The old `=== TIME ===` block and the C-Suite Calendar Load matrix are deleted.

### 2c. Strip duplicated logic instructions from the prompt

Delete from the LLM prompt:
- Reasoning steps 1–4 (re-read body, compound signals, re-classify) → replaced by the single line *"The analysis below is pre-computed. Do not re-derive numbers, deviations, or classifications. Trust them and synthesise."*
- The §5 A–H signal-pattern rulebook (MASKED_HIGH, Compounded Deficit, etc.) — these arrive as typed flags from the behaviour snapshot.
- The C-Suite Calendar Load matrix — events arrive pre-classified.
- Inline persona prose and local forbidden-word list — imported from `copy-vocabulary.ts`.

### 2d. System prompt = drop-in from §9

System block becomes: Persona → Voice banks → Hard constraints → Priority order → Silent reasoning (6 steps) → Body four-beat contract → Worked examples → JSON output contract. Imported verbatim from `copy-vocabulary.ts`.

### 2e. Validator alignment (small, surgical)

Per §7 of the guidance:
- Relax the forbidden-opener validator to allow `you` / `you're` at phrase start.
- Narrow the coaching-imperative ban to wellness-style softness only (`try to`, `consider`, `you should relax`); permit confident directives (`go`, `pace it`, `save it`).
- Keep wellness / clinical / score-tier blacklists hard.

Temperature stays at 0 (cache absorbs refresh variance; 0.35 reserved for future A/B).

### 2f. Hold-firm constraints

- Brief never prescribes a practice, duration, or "do X". One orientation posture only.
- Phrase never restates Body and vice versa.
- Score/tier never echoed (existing validator).
- The `consecutiveLowDaysForPrompt` style variable-scoping rule from `mem://reliability/brief-prompt-variable-scoping` is preserved — any new variable referenced in `userPrompt` is declared in the outer prompt scope.

---

## 3. Plan alignment — `generate-mastery-plan/index.ts`

The Plan stays deterministic. Only two changes:

### 3a. Same canonical snapshot as Brief

Plan must prefer the inline `behaviourSnapshot` forwarded by the client (already implemented) and fall back to `loadBriefBehaviourSnapshot` keyed by `expectedSignatureHash`. Any code path that re-evaluates `evaluateForScope('plan', …)` with a *different* coverage input than the Brief used is removed — Plan reads `flagsPlan` / `slotBoosts` / `promptBlockPlan` off the same snapshot the Brief produced for this `(user, local_date, window)`. Mismatch → refuse and request regeneration (no silent stale path).

### 3b. Duplicate-event dedupe by event anchor identity

The existing post-merge dedupe pass (`CATEGORY_MAX_SLOTS`) is hardened:

- Anchor identity = `eventId` when present, else `normalize(jitEventTitle) + startTimeBucket` — not primary content id.
- An event may occupy multiple visible plan slots only when the canonical `EVENT_PHASE_MAP` entry for its category lists more than one phase (pre/during/post) AND each slot's `jitPhase` matches a distinct allowed phase.
- Any extra occurrence is either (a) replaced by an unused module from the fresh horizon pool for that slot, or (b) stripped of JIT metadata (`isJit:false`, `jitEventTitle:null`, `jitPhase:null`) so the practice stays but the duplicate event anchor disappears.
- A short server log line records every dedupe action for observability.

LLM usage in Plan is unchanged in scope — contextual "why this matters now" only, never core plan selection.

### 3c. Legacy branch removal

Delete or guard the legacy plan branch that re-derives day-kind / travel state from raw DB rows when `behaviourSnapshot.flagsPlan` already covers them. No silent fallback to the legacy path — if the snapshot is absent the request errors with a clear `SNAPSHOT_REQUIRED` code so the client refetches the Brief first.

---

## 4. Latest-context contract

- Plan request must carry `expectedSignatureHash` (already wired) and the inline `behaviourSnapshot`.
- Server compares `behaviourSnapshot.signatureHash` to the most-recent `brief_snapshots.input_signature` for `(user_id, local_date, time_window)`. If the DB has a newer signature than the inline snapshot, server returns `409 STALE_SNAPSHOT` and the client refetches the Brief and retries. No "best effort" merge.
- Client already invalidates the plan cache when `behaviourSnapshot.signatureHash` or `wearableStatus.sourceRowDate` change — confirmed, no further client change needed.

---

## 5. Docs to update (no rewrites, append-only sections)

- `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md` — replace the "LLM analyzes signals" section with the new shared-module ownership table and the §8 block order.
- `docs/SHARED_MODULES_DELEGATION_AUDIT.md` — mark F-01, F-02, F-07, F-12, F-15 as resolved with PR-style notes; keep the other findings as-is.
- `docs/CEO_BEHAVIOUR_RULE_MAP.md` — add one line confirming Brief now consumes `promptBlockBrief` (no behaviour change).
- `.lovable/plan.md` — short "Brief refactor June 3" entry pointing at this plan.

No code edits to onboarding, MRS scoring, ledger merging, JIT selection v2, event-categories.ts, event-phase-map.ts, protocol-combos.ts, or any client consumer of brief/plan beyond what's already in place.

---

## 6. Acceptance checks (run after implementation)

- `bunx vitest run supabase/functions/compute-outer-readiness` (existing `body_copy.test.ts`, `index.test.ts`, `redundancy.test.ts`) all green; update only the assertions that intentionally pinned the old prompt blocks.
- `bunx vitest run supabase/functions/_shared/signal-engine` green — no shared-module logic changed.
- A manual call with two calendar events that share an `eventId` returns at most one plan slot for that event unless the category has multi-phase fanout.
- A manual call with a forced signature mismatch returns `409 STALE_SNAPSHOT`.
- A manual Brief call inspection shows: no `=== TIME ===` block, presence of `=== CONTEXT: MORNING ===` (or matching window), presence of `=== CEO BEHAVIOUR ===` populated from the snapshot, persona block sourced from `copy-vocabulary.ts`.

## 7. Out of scope

Onboarding flow, MRS v3 weights, Plan ledger schema, JIT selection v2, event taxonomy, protocol combos, signal-pill UI, Connected Data page, MrsPage, frontend caching layers, push notifications, Auth0, wearable sync, payments. None of these are touched.

## Deliverable

- New: `supabase/functions/_shared/brief/copy-vocabulary.ts`.
- Edited: `supabase/functions/compute-outer-readiness/index.ts` (prompt + block assembly path only).
- Edited: `supabase/functions/generate-mastery-plan/index.ts` (snapshot enforcement + dedupe hardening only).
- Edited: 4 doc files listed in §5.
- Approx. net code change: −1,500 to −2,500 LOC in `compute-outer-readiness` (logic moved out / prompt slimmed), +200 LOC in shared modules, +50 LOC in plan dedupe.
