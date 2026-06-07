## What I found (root causes)

I traced the screenshot end-to-end against `generate-mastery-plan` and the shared modules. The doc you referenced (`recalibrate-tagging-audit.md`) does **not** exist in the repo — I'll create it as part of this work so the audit is a living artefact.

### 1. "ahead of today's load" leaks with zero calendar events
`composeStateLabel()` in `generate-mastery-plan/index.ts` (lines 5172–5211) builds the anchor phrase as a hard cascade:
```
anchorEvent → highLoad → hrv/sleepDeficit → slot-2 specials → else "today's load"
```
The final `else anchor = "today's load"` (line 5210) fires for **slot 0** whenever no event, no high load, and no wearable deficit exist — so the literal "today's load" leaks even on an empty calendar / weekend morning, which is exactly what the screenshot shows. The variable-slot guard at 5216 only drops slot ≥ 1, never slot 0.

### 2. "Re-consolidate focus" verb chosen with no focus signal
`stateAction = 'Re-consolidate focus'` (line 5167) is the default `managing`-tier branch when the anchor category is **not** E and not cog-dominant. With no anchor at all, the branch still fires — so you get focus language without any focus context.

### 3. Practice is Ikigai (meta-renewal / presence), title says "Sharpen focus"
The filler selector (lines 5698–5772) is what picked Ikigai. Its scoring uses **only**:
- `stateSignalTags` (signal-body-under-load, masked-high, clarity-low, confidence-low, poor-sleep)
- `favorites`, `isFoundational`, recency penalty, content-type diversity

It **never** scores against:
- `mastery_category` (Flow Mastery vs Renewal vs Regulation vs Composure)
- `meta_skill` (`meta-renewal`, `meta-focus`, etc.)
- Recalibrate `category` (`pause` / `power-up` / `presence`)
- The slot's CEO verb intent (`Sharpen` → focus → Flow Mastery)
- The slot's protocol-combo (`mindset.flow` for Sharpen)

Ikigai is tagged `meta-renewal` + `presence` + `state_signal: signal-confidence-low`. With `confidenceLevel ≤ 2` it scored +15 and won — the selector had no way to know the slot wanted a **focus / Flow Mastery** practice.

### 4. `protocol-combos.ts` is imported but doesn't constrain content
`generate-mastery-plan/index.ts` imports `PROTOCOL_COMBOS` and `COMBO_TO_PRACTICE_TYPE`, but they're only used to:
- validate combo keys (line 3157)
- detect multi-step protocol combos for `protocolCombo` metadata (line 4599)

There is **no filter or score boost** that says "this slot needs `mindset.flow`, so prefer content whose `protocol_type` + metadata aligns with that combo." The combo intent never reaches the content scorer.

### 5. "Same practices keep showing up"
A 7-day recency penalty exists in the **filler** path only (lines 5753–5759: −25 / −12 / −5). I need to verify whether the **primary** selection paths (event-anchored slots, JIT slots) also penalise recently-shown content, or whether they re-pick the same module daily. From the import surface (`recentPracticeDays`) it's wired through, but not scored everywhere.

---

## Fix plan

Scope: `supabase/functions/generate-mastery-plan/index.ts` + a new `_shared/plan/practice-selector.ts` helper + `mem/` docs. No DB schema change. No UI change.

### Step 1 — Stop leaking "today's load" with no signal
In `composeStateLabel` (slot 0), when no event, no high load, and no wearable deficit:
- Drop the bare "today's load" fallback.
- Replace with a calendar-aware fallback: `"the day ahead"` (weekday) / `"the weekend ahead"` (Sat/Sun) / `"this morning"` when in morning window.
- Apply the same variable-slot drop logic to slot 0 only when the stateAction is also weak (i.e. tier ≠ depleted/managing/peak edge cases) — otherwise keep the slot but with a neutral anchor.

### Step 2 — Make `stateAction` consistent with the anchor
- If the resolved anchor is the neutral fallback (no event, no load, no deficit), prefer general verbs: `"Steady the system"` / `"Build capacity"` instead of `"Re-consolidate focus"`.
- Only emit focus-bearing verbs (`Re-consolidate focus`, `Prime for focus`, `Sharpen`) when an actual focus-driving signal exists: anchor category ∈ {E}, cog-dominant demand profile, OR `practicePriorityTag ∈ {focus_clarity}`.

### Step 3 — Bind content scoring to slot intent (the core fix)
Create `supabase/functions/_shared/plan/practice-selector.ts` that:
1. Takes the slot's `(verb, objective, categoryId, phase, protocolCombo, practicePriorityTag)`.
2. Derives a target `MasteryCategory` and `metaSkill` set from the verb/objective using a small explicit map, e.g.
   - `Sharpen / sustained_focus / focus_clarity` → mastery_category=`flow-mastery`, meta_skill ⊇ `meta-focus`
   - `Steady / regulation_composure` → `composure`, `meta-regulation`
   - `Reset / recovery_for_next` → `renewal`, `meta-renewal`
   - `Lead / executive_presence` → `composure`, `meta-presence`
   - `Reframe / decisive_alignment` → `mastery`, `meta-reframe`
3. Scores the content pool with explicit boosts for matching `mastery_category` (+25), matching `meta_skill` (+15), matching protocol-combo (+15 via `protocol_type` + `sub_type`), matching Recalibrate `category` (+10 when verb implies pause/power-up/presence).
4. Keeps the existing state-signal/favorites/recency/diversity scoring as tiebreakers.

Wire this helper into BOTH the filler path (5698–5772) **and** the primary event-anchored selection path (I'll locate the call site and refactor — it currently uses `moduleType` from `practiceType` only).

### Step 4 — Stop the repeat-the-same-practice pattern
- Extend the 7-day recency penalty to the primary selection paths (not just filler).
- Add a 30-day soft-rotation bonus: content NOT shown in last 30d gets +6.
- Per-day uniqueness across slots already exists via `seenContentIds`; keep.
- Hard rule: no single `content_id` may appear more than 2× in any rolling 14-day window (penalty −40 on the 3rd attempt).

### Step 5 — Make `protocol-combos.ts` actually drive selection
- In the primary selection, resolve the slot's intended `ComboKey` from `(category, phase)` via `EVENT_PHASE_MAP` (already imported).
- Pass the combo into the practice-selector helper so it can require `protocol_type` (`mindset` vs `somatic`) and prefer matching `sub_type` (`mindset` vs `tool`).

### Step 6 — Author the missing audit doc + memory
- New file: `docs/RECALIBRATE_TAGGING_AUDIT.md` — lists every sanctuary_content row, its Recalibrate `category`, `protocol_type`, `mastery_category`, `meta_skill`, `state_signal`, and flags rows missing a `mastery_category.primary` (Ikigai is one — `{"primary": null}`).
- New memory: `mem/features/mastery-plan/practice-selection-binding.md` — codifies the verb→mastery-category→meta-skill→protocol-combo map so future edits don't drift.

### Step 7 — Tests (Deno)
- `supabase/functions/_shared/plan/practice-selector.test.ts` — verb=Sharpen rejects `meta-renewal` content, prefers `flow-mastery` + `meta-focus`; verb=Reset prefers `renewal`.
- Extend `priority-title.test.ts` — empty calendar + tier=managing must NOT emit "today's load" or "Re-consolidate focus".
- Repeat-suppression test: same `content_id` cannot be selected on consecutive days when alternatives exist.

### Step 8 — Backfill nulls (data, not code)
Ikigai-purpose and any other rows with `mastery_category.primary = null` get filled in a small migration — without a primary mastery category, the new scorer can't match them to a slot intent.

---

## Validation checklist

- [ ] On an empty calendar morning, slot 0 title contains no "today's load" / "ahead of today's load".
- [ ] `Sharpen` verb only appears when a focus signal (cat E, cog-dominant, or `focus_clarity` tag) is present.
- [ ] Selected practice's `mastery_category` matches the slot's verb-derived target on ≥ 90% of synthetic fixtures.
- [ ] Same `content_id` does not surface on 3 consecutive days in fixture replay.
- [ ] `protocol-combos.ts` combo is observable in selection telemetry (`comboKey`, `comboMatch: true|false`).
- [ ] All existing Deno tests still pass (`priority-title`, `why-llm-validator`, `protocol-combos`).

## Out of scope

Brief copy/prompt, MRS scoring, JIT horizon, dedupe key, signal pills, UI components, RLS.

## Rollback

Revert the three source files + new helper + new tests. Optional: revert the metadata backfill via the inverse migration.
