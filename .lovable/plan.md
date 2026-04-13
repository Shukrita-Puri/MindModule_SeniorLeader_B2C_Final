

# Fix Wearable Pills, Split Mind Pill, Trim Lean On/Watch For, Upgrade LLM v4, Reduce Latency

## 5 Changes Across 3 Files

---

### Fix 1 — Wearable pills not showing (`||` → `??` + syncing fallback)

**File:** `supabase/functions/compute-outer-readiness/index.ts` (lines 1968-1971)

**Root cause:** `wearableRow.resting_heart_rate || null` coerces `0` to `null`. The wearable data exists (visible in lean-on text) but individual metrics may be `0` during sync gaps.

**Changes:**
- Line 1968: `wearableRow.resting_heart_rate || null` → `wearableRow.resting_heart_rate ?? null`
- Line 1969: `wearableRow.hrv || null` → `wearableRow.hrv ?? null`
- Line 1970: `wearableRow.sleep_score || null` → `wearableRow.sleep_score ?? null`
- Line 1971: `wearableRow.total_sleep_minutes || null` → `wearableRow.total_sleep_minutes ?? null`
- Line 1972: `wearableRow.source || null` → `wearableRow.source ?? null`

**File:** `src/components/home/DecisionReadinessBrief.tsx` (lines 393-396)

**Change:** When `hasWearable` is true but no HRV/Sleep/RHR chips were generated (all metrics null), render a neutral "Wearable syncing" chip instead of nothing or a state assertion. Move the "Connect wearable" prompt to also fire when `tier !== 'none'` but zero wearable chips exist.

---

### Fix 2 — Split Mind pill into two pills (no raw numbers on front)

**File:** `src/components/home/DecisionReadinessBrief.tsx` (lines 398-505)

Replace unified mind pill with two separate pills:

**Mind Sharpness pill** (Stage 1 outcome):
- Front: `Focused` / `Steady` / `Scattered` / `Drained` / `Depleted` (not "Overwhelmed" — per user feedback, too clinical for C-suite)
- Back: `Check-in: {outcome}`
- Color: outcome tier (green/amber/red)
- Only renders when `outcome` exists

**Clarity & Confidence pill** (Stage 2 matrix):
- Front: analysis words only — `High clarity` / `Sharp confidence` / `Low clarity` / `Low confidence` / `Clear but cautious` (for clarity high + confidence low split)
- Back: `Clarity {x}/5 · Confidence {y}/5`
- Color: C×C tier
- Pattern qualifiers (consecutive low days, DOW deviation) attach here as grey qualifier text
- Only renders when clarity or confidence exists

---

### Fix 3 — Trim deterministic fallback Lean On / Watch For to 1-3 words

**File:** `supabase/functions/compute-outer-readiness/index.ts` (lines 3657-3703)

Current verbose signals → trimmed derived labels:
- `"Body steady — your system supports this"` → `"System steady"` ← but per spec rule, this duplicates pill. Change to `"Physiological credit"` (a derived implication)
- `"Calendar space — use it deliberately"` → `"Calendar headroom"`
- `"Heavy calendar (X meetings) — watch for decision fatigue"` → `"Decision fatigue"`
- `"Body strain — protect your recovery windows"` → `"Compounding cost"` (derived, not repeating pill)
- `"Autopilot mode — stay intentional"` → `"Autopilot risk"`
- `"X-day depleted/managing pattern — needs intervention"` → `"{X}-day pattern"`
- `"Your self-awareness — checking in is the edge"` → remove entirely (not signal-based)
- Archetype lean-on/watch-for: truncate to first 3 words of trait

Also rewrite the deterministic fallback **phrases** and **body** per v4 Section 12:
- Use archetype lean-on trait + time slot for phrase (not prose sentences)
- Use onboarding goal for body (not signal listing)
- If archetype null: return null for phrase/body (empty card > generic card)

Source priority for deterministic fallback: Wearable → Coach → Check-in → Calendar → Archetype → Goals (immediate → tactical → strategic).

---

### Fix 4 — Swap few-shot examples with v5 corrected set

**File:** `supabase/functions/compute-outer-readiness/index.ts` (lines 3241-3258)

Replace current 4 examples with 4 from the v5 corrected set, selected for maximum signal diversity:

1. **EX 01** — Sunday Evening + HRV board pattern + MASKED_HIGH + Sunday Anxiety (Pattern D + F)
2. **EX 03** — Afternoon + MASKED_HIGH + Clarity-Confidence Split + Coach insight (Pattern A + B)
3. **EX 07** — Day 1 Cold Start (no wearable, no calendar, archetype + goals only)
4. **EX 09** — Day 4 consecutive low + coach commitment active (Pattern I + consecutive)

All examples use `<strong>` HTML tags (not markdown asterisks). All lean-on/watch-for items are 1-3 word derived labels, not pill repetitions.

---

### Fix 5 — LLM latency reduction

**File:** `supabase/functions/compute-outer-readiness/index.ts` (lines 3451-3453)

- Reduce retries from 4 → 2: `[10000, 6000]` (validation retry shares same timeout budget, not additive)
- Change `for` loop: `attempt <= 2` instead of `attempt <= 4`
- Lovable AI fallback timeout stays at 8s (already reasonable)
- Worst case: 10s + 6s + 8s = 24s (was ~38s)

---

### Fix 6 — Docs update

**File:** `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md`

Update all affected sections (not just §7):
- §6.3: Wearable data contract — `??` not `||`, connected-but-no-data renders "Wearable syncing"
- §7: Signal pills — split Mind into Mind Sharpness + Clarity & Confidence; pill vocabulary table (Focused/Steady/Scattered/Drained/Depleted); no raw numbers on front
- §10/§12: Deterministic fallback — 1-3 word signals, archetype-first, null over generic
- §2.3: Bold — `<strong>` not `**`
- Add v4 changes summary block at top

---

## Implementation Order

1. Fix `||` → `??` in edge function + add "Wearable syncing" fallback chip
2. Split Mind pill into two in client
3. Trim deterministic fallback signals to 1-3 derived words + rewrite fallback phrase/body per Section 12
4. Swap few-shot examples with v5 corrected set
5. Reduce LLM retries from 4 → 2
6. Update docs
7. Deploy edge function
8. Verify end-to-end

