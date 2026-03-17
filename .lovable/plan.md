

# Audit: Data Flow — Inner Readiness → Outer Readiness → Mastery Plan

## Your Question Answered

You asked: "Does Outer Readiness already include calendar load? So shouldn't the theme already give the Mastery Plan the right direction? Why add calendar overrides again?"

**Yes, and here's exactly how it works — and why the calendar override layer is still correct.**

## The Data Flow (confirmed in code)

```text
┌─────────────────────┐
│  INNER READINESS    │  Score 0-100, Tier (depleted/managing/strong/peak)
│  (compute-inner)    │  Inputs: check-in, HRV, circadian
└────────┬────────────┘
         │ feeds tier + score
         ▼
┌─────────────────────┐
│  OUTER READINESS    │  Theme phrase + Lean On + Watch For
│  (compute-outer)    │  Inputs: tier + calendar load/pressure + time-of-day
│                     │  Calendar: low/medium/high (3 levels)
└────────┬────────────┘
         │ feeds theme phrase (e.g. "Hold your ground.")
         ▼
┌─────────────────────┐
│  MASTERY PLAN       │  Module specs → content selection
│  (generate-mastery) │  
│                     │  Step 1: Theme phrase → ThemeModuleMapping (base)
│                     │  Step 2: Calendar overrides (light/moderate/heavy/extreme)
│                     │  Step 3: Content scoring → final practices
└─────────────────────┘
```

## Why Calendar Appears Twice (and why this is correct)

**Outer Readiness uses calendar to select the THEME** — a directional phrase like "Hold your ground" or "Protect and build." This embeds calendar awareness into the *strategic direction*. The theme IS calendar-aware.

**But the theme phrase is then mapped to module specs** (regulate/align/prepare/integrate) via `THEME_MODULE_MAP` — a static lookup table with 40+ entries. This mapping captures the *type* of practice but NOT the *intensity adjustment* for calendar density.

**Example of the gap without calendar overrides:**

- Theme: "Lead from strength." (Strong tier + high pressure + high load)
- Base mapping: `align: focus='confidence', intensity='activating'`
- This is correct for a heavy day — but it's the SAME mapping whether there are 6 meetings (heavy) or 12 meetings (extreme)
- Without overrides: morning gets activating confidence practice even with 12 back-to-back meetings
- With overrides: extreme morning forces grounding + composure instead of activation

**The theme captures WHAT direction. The calendar overrides adjust HOW MUCH intensity.**

## What's Actually Happening Now (Verified)

1. **Outer Readiness `getTheme()`** — uses 3-level calendar (low/medium/high) × 4 tiers × time-of-day to select from 40 theme phrases. Calendar IS baked into theme selection. Confirmed at line 175-299.

2. **Mastery Plan `getModulesFromTheme()`** — maps theme phrase to static `ThemeModuleMapping`. This preserves the strategic direction but loses calendar granularity (the map doesn't know if load was "high" = 6 meetings or "high" = 12 meetings). Confirmed at line 507.

3. **Mastery Plan `applyCalendarOverrides()`** — re-reads raw calendar events and classifies into 4 levels (light/moderate/heavy/extreme) with finer granularity than Outer Readiness's 3 levels. Adjusts module intensity/focus based on actual density. Confirmed at line 582-676.

## Is This Redundant?

**No.** The two systems use calendar data at different resolutions for different purposes:

| System | Calendar Resolution | Purpose |
|---|---|---|
| Outer Readiness | 3 levels (low/med/high) | Theme direction (strategic framing) |
| Mastery Plan overrides | 4 levels (light/mod/heavy/extreme) | Practice intensity (tactical adjustment) |

The override layer catches cases the theme can't express — like the difference between "heavy" (6 meetings) and "extreme" (12 meetings), which both map to the same theme phrase but need very different practice intensities.

## The Architecture Is Sound

The cascade works as intended:
1. **Inner Readiness** → "How resourced am I?" (tier + score)
2. **Outer Readiness** → "Given my state + my calendar, what's my strategic frame?" (theme + lean on + watch for)  
3. **Mastery Plan** → "Given the strategic frame, what specific practices at what intensity?" (module specs adjusted by calendar density)

Each layer adds specificity. The theme carries the direction; the overrides tune the execution. No changes needed — the implementation matches the design intent.

