## Goal

Fix three issues in the "How You Show Up" / Mind Rhythm Patterns block on `/insights`:

1. **Title still reads "How You Show Up"** — the user expected it renamed.
2. **Copy is verbose and split by dimension sub-headers** (Energy / Clarity / Sharpness / Confidence) — feels like a report, not a brief.
3. **Up to 6 findings shown** — too much. Show **only the top 3**, picked by a Chief-of-Staff prioritization rule. Long form moves to the Weekly Insights email.

---

## 1. Rename the section

In `src/components/insights/PerformanceRhythmCard.tsx` (around line 1030 + 1033):

- Change the rendered label and `InsightInfoModal` title from **"How You Show Up"** → **"Your Rhythm Signals"**.
- Update the `InsightInfoModal` `explanation` to one tight line:
  > *"The 3 strongest patterns from your check-in trends — when you're sharpest, where you slip, and what's repeating."*

(If the user prefers a different name e.g. "Rhythm Signals" / "Your Patterns", we can swap the string in one place.)

---

## 2. Collapse the per-dimension layout into one unified list

Today the block iterates `[energy, clarity, sharpness, confidence]` and prints a sub-header + bullet list per dimension (lines 1037–1054). Replace with **a single flat list of 3 bullets**, no sub-headers. Each bullet:

- Lucide `ArrowRight` icon (kept).
- One line of crisp text (≤ ~110 chars).
- A small muted dimension tag at the end (e.g. `· Energy`, `· Clarity`) so the user still knows which axis it came from — but it's an inline tag, not a section break.

---

## 3. Tighten the copy templates in the edge function

In `supabase/functions/performance-rhythm-insights/index.ts` rewrite the four `text:` strings produced by `mineSeries` so each finding is one short sentence. Current vs. proposed:

| Kind | Current (verbose) | New (crisp) |
|---|---|---|
| `peak-window` | "Mornings are your 'focused' / 'steady' window (72% across 14 check-ins) – Evenings sit at 40%." | **"Mornings are your peak Energy window (72%)."** |
| `peak-day` | "Mondays land 'focused' / 'steady' 80% of the time vs Fridays at 30%." | **"Mondays run sharp; Fridays drop off."** |
| `cell-peak` | "Tuesday mornings are your sharpest cell (85% 'focused' / 'steady' across 6 check-ins)." | **"Tuesday mornings are your sharpest window."** |
| `consecutive` | "3+ consecutive Sundays you've checked in 'drained' / 'overwhelmed'." | **"3 Sundays in a row you've shown up drained."** |

Per-dimension vocab (used inline): `Energy` / `Clarity` / `Sharpness` / `Confidence`. Drop the bracketed scale labels ("Crystal/Lucid (4–5)", "Peak/Acute (4–5)", etc.) from user-facing copy — keep them only in internal logs.

The full long-form (with %, n, scale labels) stays in the payload as `longText` so the **Weekly Insights email** can use it later without a second pass.

```ts
interface RhythmFinding {
  kind: RhythmKind;
  text: string;        // crisp, ≤110 chars — for the app
  longText: string;    // verbose with stats — for the weekly email
  dimension: 'energy' | 'clarity' | 'sharpness' | 'confidence';
  confidence: number;
  observations: number;
  priorityScore: number; // see §4
}
```

---

## 4. Chief-of-Staff prioritization (which 3 win)

A Chief of Staff surfaces **what changes the executive's next decision**, not the prettiest stat. Rank order — highest first:

1. **Active risk (negative consecutive runs)** — `kind === 'consecutive'` AND negative band. These are *recurring drops* the user can act on this week. **+1.0 priority weight.**
2. **Strong cell-peak** (`cell-peak`, positive) — concrete day×time the user can protect for high-stakes work. **+0.8.**
3. **Day-of-week trough** — `peak-day` finding where the *worst* day's pct ≤ 30%. Pull the trough out as its own crisp insight ("Fridays slip on Clarity"). **+0.7.**
4. **Time-of-day peak** (`peak-window`, positive) — useful but generic. **+0.5.**
5. **Day-of-week peak** (`peak-day`, positive only) — informational. **+0.4.**
6. **Positive consecutive runs** — celebratory but non-actionable. **+0.3.**

**Dimension tiebreaker** (Chief-of-Staff hierarchy for an executive): Sharpness > Clarity > Energy > Confidence. Sharpness/Clarity directly govern decision quality; Energy is fuel; Confidence trends slowest.

**Final score** = `priorityWeight + (statisticalConfidence × 0.3) + dimensionBonus`.

**Selection rule:**
- Take top 3 by score.
- **Diversity guard:** at most 2 findings per dimension, and at most 2 of the same `kind`, so the user doesn't see "Mondays peak / Fridays peak / Wednesdays peak."
- If only 1 finding qualifies, render it alone (no padding with weak signals — honesty over volume).

The edge function returns:
```ts
mindRhythmPatterns: {
  topThree: RhythmFinding[];          // capped at 3, prioritized
  all: RhythmFinding[];               // full set, retained for the weekly email
} | null
```

---

## 5. UI changes (PerformanceRhythmCard.tsx)

- Update the `mindRhythmPatterns` interface to the new shape (`topThree`, `all`, `longText`, `dimension`).
- Replace the per-dimension `.map` block (lines 1037–1054) with one flat `.map` over `data.mindRhythmPatterns.topThree`.
- Render each item as: `→ {f.text}  · {dimensionLabel(f.dimension)}` with the dimension tag in `text-[10px] uppercase text-muted-foreground/60`.
- Gate: show the block only if `topThree.length >= 1` and `checkInCount >= 7` (unchanged threshold).
- Empty state copy (when 0 findings but ≥7 check-ins): *"Patterns will sharpen as your check-ins accumulate across more days and times."*

---

## 6. Weekly Insights email (forward-compatible)

No code shipped now, but the new `all` array + `longText` field on each finding gives the future weekly email everything it needs (full list, stats, dimension breakdown). Documented in the memory file below.

---

## 7. Memory + docs

- Update `mem://features/insights/level-trend-calendars.md` to record:
  - Section is now **"Your Rhythm Signals"** (3 max, single flat list, no sub-headers).
  - Prioritization order (active risk → cell-peak → trough → ToD peak → DoW peak → positive runs).
  - Dimension tiebreaker (Sharpness > Clarity > Energy > Confidence).
  - `longText` reserved for the weekly email; app shows only `text`.

---

## Files to edit

- `supabase/functions/performance-rhythm-insights/index.ts` — rewrite copy templates, add `longText` + `dimension` + `priorityScore`, build `topThree` with the prioritization + diversity rule, return `{ topThree, all }`.
- `src/components/insights/PerformanceRhythmCard.tsx` — rename label + modal, swap interface, replace per-dimension render with flat 3-bullet list, update DEV-mode shape stub.
- `mem/features/insights/level-trend-calendars.md` — document the new contract.

## Validation after implementation

- Hit `/insights` as a user with ≥7 check-ins; confirm exactly ≤3 bullets, no sub-headers, label reads "Your Rhythm Signals".
- Confirm a user with a 3+ Sunday `drained` run sees that surfaced first.
- Confirm a user with no patterns ≥7 check-ins sees the new empty-state line, not the old block.
- Spot-check `mindRhythmPatterns.all` in the edge function response so the future weekly email has the long form available.