

# Fix: "From Your Wins" Shows Same Content for Every Bubble

## Problem

When tapping any bubble (Hope, Proactive, Intentional, etc.), the "From Your Wins" section shows the **same two wins** regardless of which bubble is selected. This is because `relatedWins={tinyWinsContent}` passes the entire unfiltered wins list as a single prop — the component has no way to match wins to the selected dimension/value.

## Root Cause

The edge function returns wins as a flat `winsContent` array with only `content` and `date`. Each win has dimension fields (`primary_emotion`, `agency_type`, `growth_signal`, etc.) in the database but these are **not included** in `winsContent`. The client component receives one global list and displays it identically for every bubble.

## Fix

### 1. Edge Function: Include dimension fields in `winsContent` response

**File**: `supabase/functions/tiny-wins-insights/index.ts`

Change the `winsContent` mapping (line 409) to include `primary_emotion`, `agency_type`, `regulation_level`, and `growth_signal` alongside `content` and `date`.

### 2. Client: Pass per-bubble filtered wins

**File**: `src/components/insights/PsychologicalDimensionBubbles.tsx`

- Change `relatedWins` prop type to include dimension metadata fields
- When a bubble is selected, filter `relatedWins` to only those wins whose `primary_emotion`, `agency_type`, `regulation_level`, or `growth_signal` matches `selectedItem.value`
- Replace the current `meaningfulWins` (global filter) with a per-selection filter

### 3. Parent wiring

**File**: `src/pages/Insights.tsx`

- Update `tinyWinsContent` state type to include the new dimension fields
- Pass the enriched array to `PsychologicalDimensionBubbles`

## Summary

| File | Change |
|------|--------|
| `tiny-wins-insights/index.ts` | Add dimension fields to `winsContent` response |
| `PsychologicalDimensionBubbles.tsx` | Filter wins per selected bubble value |
| `Insights.tsx` | Update state type to carry dimension metadata |

No database changes needed. One edge function redeploy.

