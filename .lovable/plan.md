
# Plan v5.1 — Strategic-Aware Mastery Plan (no UI restructure)

User-facing UI of the Plan page is **unchanged**. Only the **content inside two existing surfaces** evolves:

1. The "Why this matters" body inside each priority card.
2. The single context line inside each Step practice card (becomes a 2–4-word sequence rationale).

Plus backend changes for slot purpose, 24h JIT ceiling, and CEO-Reality awareness — all invisible structurally, visible only through smarter copy.

---

## 1. Internal Slot Model (server-only naming, not shown to users)

The 3 priorities are produced by a slot pipeline with three roles. **These names never appear in the UI.** Order is determined by what the user actually needs today — a JIT may take the morning slot if their day starts at 7am.

| Internal slot | Purpose | Trigger |
|---|---|---|
| `start_of_day` | Prep for today's stress patterns + strategic goal | Before noon local, until completed. May **double as a JIT prep** if a high-stakes event sits inside the morning window (e.g. 9am board) — single slot, two intents woven into Why. |
| `jit` (0–N) | Pre-event regulation | Calendar event with `minutesUntil ≤ 24h` AND priority score ≥ threshold |
| `end_of_day` | Strategic Decompression — sleep, recovery, accountability to long-term goals | After 17:00 local; replaces empty middle slot earlier |

Rules:
- **24-hour MVP ceiling**: never surface a JIT for an event >24h away. If no qualifying JIT inside 24h, the middle slot becomes a **State-Aware General Reset** (e.g. "Busy Day Overwhelm Management", "Midday Recalibration"), not a future-dated prep.
- **Morning ↔ JIT fusion**: when `start_of_day` runs and the first calendar event is ≤4h away and high-stakes, the same slot's Why weaves both intents (e.g. "Ground for the day, sharpen for the 9am Board"). No extra slot, no extra UI.
- **Stateful evolution preserved** ([stateful-plan-evolution memory](mem://architecture/stateful-plan-evolution)):
  - The plan does **not rebuild** on every brief.
  - Completed priorities stay as crossed-out anchors.
  - For incomplete slots, the **practice title (the WHAT) stays stable**; only the **Why this matters** copy refreshes against the latest brief / state.
  - Full rebuild only when all 3 are complete (Bonus Round).

Edge function: `supabase/functions/generate-mastery-plan/index.ts`
- Add `MVP_JIT_HORIZON_HOURS = 24`; filter `filteredEvents` to `minutesUntil ≤ 24*60` before JIT slot assignment.
- Refactor `buildHorizonModules` → `buildSlotPlan({start_of_day, jits[], end_of_day})`, flattened to ≤3.
- When no JIT ≤24h, generate a state-management slot with `slotKind: 'state-management'`.
- Detect morning fusion: if `slotKind === 'start_of_day'` and `topEvent.minutesUntil ≤ 240` and `stakes_level ∈ {board, external, investor, …}` → set `morningFusion = topEvent`.

---

## 2. Three-Tier Context Engine — with hard "no-duplication-with-Brief" rule

Every "Why this matters" weaves three tiers:

```
{strategicAnchor}. {tacticalPattern}. {immediateSignal}.
→ {actionVerb} {object} {forContext}.
```

### Inputs by tier (all already in DB / edge context)

| Tier | Sources |
|---|---|
| **Strategic** | Onboarding `growth_priority` / Goal Question; `coach_pattern_observations.growth_area`; `pendingCommitments`; `practicePriorityTag`; archetype |
| **Tactical** | Insights cards: **Cause & Effect** (`causality_findings.signal_summary`), **Practice Effectiveness** (`content_relevance_feedback`), **Mind Readiness Trend** (`brief_snapshots` PRS); plus `hrvCorrelations`, `historicalPatternEngine`, `patternInsight`, `innerReadinessPattern` |
| **Immediate** | Daily check-in (outcome + sliders), Check-in Detail, `wearable_data`, `calendar_events`, **Brief Phrase, Brief Body, Lean-On, Watch-For, Signal Pills** (from `outerReadinessCache` / latest `brief_snapshots`) |

### Anti-duplication contract (critical)

The Plan must **build on** the Brief, not **echo** it.

- The edge function loads the latest `brief_snapshots` row for today (already cached as `outerReadinessCache`) and extracts a `briefClaimSet`: tokens of facts the Brief already named (numbers it cited, named events it referenced, lexicon clusters it used, pattern claim if any).
- When composing Why-text, the Plan's `immediateSignal` clause **must avoid restating any claim already in `briefClaimSet`**. It should:
  - Pick a **different signal** (if Brief used HRV-drop, Plan uses sleep-debt or check-in outcome).
  - Or **escalate the same signal into action** ("Given the compressed runway you saw in the brief, the move now is to ground before the call." — frames the brief as known context, doesn't restate the number).
- New helper `composeWhyLine(slotCtx, briefClaimSet)`:
  - If a tier's natural sentence overlaps `briefClaimSet` (≥ 2 token overlap on number+noun, or matches a named event already cited), drop that clause and substitute the next-best signal from the same tier.
  - If everything overlaps, switch to **bridge mode**: open with `"Following your brief: …"` style escalation, then go straight to action verb.
- All checks run **deterministically** (string token compare, not LLM). No round-trip cost.

### Deterministic vs AI

Stay **deterministic** for MVP. Reasons: speed, brand safety (matches `phrase-validation-standard`), zero token cost, no risk of restating Brief copy. AI can be a v2 enhancement once we have a quality harness.

---

## 3. CEO Reality awareness baked into Why-text

The Brief LLM already runs 7 CEO Reality Logic Engines (Veto Risk, Second Wind, Circadian Priority, Decision Leakage Guard, Post-Peak Hangover, Personal Friction Inference, Board-Level Outcome). The Plan must read the **same triggers** and adjust its Why-text accordingly — without restating the Brief.

Add `detectCeoRealities(req)` returning a flag set the slot composer uses as **strategic-anchor modifiers**:

| Reality | Detection (server, deterministic) | Effect on Why-text |
|---|---|---|
| Veto Risk (masked fatigue) | wearable HRV neg-deviation OR sleep <6h OR RHR elevated AND self-decl confidence/sharpness HIGH | Strategic anchor reframes: "Mask carries cost — protect the high-stakes call before composure becomes the variable." |
| Circadian / Travel | `globalLoad.timezoneShift48h > 3` OR calendar event matches `/(flight\|airport\|red-eye)/i` in 48h | Strategic anchor: "Travel debt active." Bias `restore` modules; end_of_day adds sleep-protocol bias. |
| Decision Leakage Guard | (HR elevated OR HRV dev <-15%) OR self-decl emotional = depleted/managing AND drain-event in calendar | Why-text names the leakage risk tied to the named event. |
| Post-Peak Hangover | yesterday score ≥75 AND today recovery deficit | Tactical clause: "Yesterday's peak left a recovery gap." |
| Personal Friction | declining self-decl on Sun pm / Mon am with no wearable degradation | Strategic anchor: "Internal Buffer compression." Soften tone; no high-load prep. |
| Board-Level Outcome | any `stakes_level ∈ {board, external, investor}` in 24h | Why-text **must** link state to a Leadership Variable (Executive Presence, Strategic Composure, Decision Power) per Elastic Lexicon. |
| **Public holiday** | all-day event matches `/(public holiday\|bank holiday)/i` | Skip heavy-day framing; end_of_day shifts to Recovery tone. |
| **Personal PTO / OOO** | all-day event matches `/(ooo\|out of office\|vacation\|annual leave\|pto\|leave)/i` | Why-text says "Holiday today — light touch." Lower JIT thresholds. Suppress strategic accountability prods. |

All of the above are **inline qualifiers inside Why-text**, not new UI elements.

---

## 4. Per-Step Sequence Rationale (Practice Cards)

Replace the existing context line on each step card with a **crisp 2–4-word sequence rationale**. Same UI slot, tighter content.

- Server returns `stepRationale: string[]` (one per practice in `practices[]`), computed deterministically from ordered `practiceTypes`:

| Sequence | Step rationales |
|---|---|
| `regulate → align` | ["Ground first.", "Then sharpen."] |
| `regulate → prepare` | ["Settle body.", "Then prep mind."] |
| `align → integrate` | ["Sharpen now.", "Then consolidate."] |
| `regulate → integrate` | ["Settle first.", "Then close out."] |
| single-step | (none — keep existing fallback) |

- Client (`TodayThreePriorities.tsx`): swap the context-line render to use `hm.stepRationale[i]` when present, else fall back to existing `practice.reasoning` (no regression for old cached plans).
- No new UI element; same line, crisper content.

---

## 5. Event Selection — Strategic weighting

Add to existing scoring in `scoredEvents`:

- `+15` if event type matches `coach_pattern_observations.growth_area` keywords.
- `+10` if event type matches onboarding `practicePriorityTag` / `growth_priority`.
- `+10` if event type appears in `hrvEventCorrelation` with avg drop >10% (tactical proof it matters for *this* user).
- Hard ceiling: `minutesUntil ≤ 1440`.

So a Board Meeting at 11:30 isn't just "next event" — it's "next event that proves your strategic goal."

---

## 6. UI — explicitly unchanged

- **No** slot-name chips ("MORNING RITUAL" / "JIT" / "EVENING CLOSE"). Slot purpose is server-only.
- **No** brief-reference line at the top of the card.
- **No** new badges for holiday / PTO / jet-lag — those become inline qualifiers inside Why-text.
- The only visible deltas are:
  1. The **Why-this-matters body** is now composed via the 3-tier template + brief-anti-dup logic + CEO-Reality modifiers.
  2. The **step card context line** is now a 2–4-word sequence rationale.

---

## 7. Files to Edit

- `supabase/functions/generate-mastery-plan/index.ts`
  - Add `MVP_JIT_HORIZON_HOURS = 24` ceiling on `filteredEvents`.
  - Refactor `buildHorizonModules` → `buildSlotPlan` (start_of_day / jits / end_of_day + state-management fallback + morning↔JIT fusion).
  - Extend `SlotContextInput` with `strategicAnchor / tacticalPattern / immediateSignal / ceoRealities / briefClaimSet`.
  - Add `composeWhyLine()`, `buildBriefClaimSet()`, `detectCeoRealities()`, `buildStepRationale()`.
  - Strategic boost in event scoring.
  - Return `stepRationale: string[]` on each `HorizonModule`.
- `src/components/home/TodayThreePriorities.tsx`
  - Render `hm.stepRationale[i]` on practice step cards (fallback to existing `practice.reasoning`). No layout change.
- `docs/PROACTIVE_MASTERY_PLAN_LOGIC.md` — document v5.1 model.
- New memory: `mem/features/mastery-plan/slot-model-v5.md` — internal slot purpose, 24h ceiling, anti-duplication contract.

---

## 8. Out of Scope (revisit when role-play / sparring ship)

- JIT horizon >24h.
- LLM-generated Why-text.
- Multi-day strategic arc view.

---

## 9. Acceptance Checks

1. **24h ceiling**: with no calendar events in next 24h → middle slot is State-Management, never a future-dated prep.
2. **Morning fusion**: with a 9am board meeting and current time 7am → start_of_day slot's Why weaves both day-prep and board-prep, no extra slot created.
3. **Anti-duplication**: if Brief said "HRV down 18%, 6 meetings ahead", the Plan's Why does NOT restate either fact — it picks a different signal or uses bridge framing.
4. **Stateful evolution**: completing slot 1 then re-checking-in 2 hours later → slot 1 stays crossed out, slot 2 & 3 keep their practice titles, only Why-text refreshes.
5. **CEO Reality**: an all-day "Annual Leave" event today → Why-text reframes to light-touch restoration; no accountability prods.
6. **Step rationale**: practice cards with 2 steps render ≤4-word rationale on each (e.g. "Ground first." / "Then sharpen.") in the existing context line.
7. **No UI changes**: the page structure, chips, headers, and card shape match the current Plan page exactly.
