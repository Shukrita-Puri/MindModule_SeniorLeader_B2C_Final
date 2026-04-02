

# Fix: Outer Readiness Context Relevance + Lean On/Watch For Length + Connector Visibility

## Root Cause Analysis

### Problem 1: "demands ahead" when calendar is empty
**Location:** `compute-outer-readiness/index.ts`, line 906

The depleted morning path calls `buildMorningTheme` with a hardcoded `defaultContext`: `"Starting the day in a depleted state with demands ahead. How you enter each moment today matters more than how much you do."`

The `buildMorningTheme` function (line 656) checks priorities 1-6 (poor sleep, high-stakes, HRV, dense calendar). When NONE match (no wearable data, no high-stakes events, calendar is empty/light), it falls to the **morning default fallback** (line 841) which uses this passed `defaultContext` verbatim — including "with demands ahead" even when there are zero meetings.

**Same issue at line 909** (afternoon depleted) uses the same "demands ahead" text.

**Fix:** Make the defaultContext calendar-aware. Replace the static "with demands ahead" strings with calendar-conditional language:
- If `eventCount > 0`: "with demands ahead"
- If `eventCount === 0` or calendar not connected: "How you enter the day determines how much you have for what matters" (no demands reference)

This affects 4 places in `getTheme()`: depleted morning (906), depleted afternoon (909-910), managing morning (952), and their equivalent in `getNoCalendarTheme()`.

### Problem 2: Lean On / Watch For too long
**Location:** `compute-outer-readiness/index.ts`, lines 1345-1849

The C×C modifier (Pattern 3, line 1393) generates:
- `"Your clarity. You see the direction clearly even when confidence hasn't caught up yet."`
- `"Waiting for confidence to arrive before acting on what you already know is right."`

These are prepended with `"Based on your check-in today: "` at line 1818.

**Fix:** Condense all C×C modifier outputs to 2-3 word core insights with source attribution in brackets. The current verbose sentences become:

| Pattern | Current Lean On | New Lean On | Current Watch For | New Watch For |
|---------|----------------|-------------|------------------|--------------|
| Both low | "Your honesty about where you are..." | "Your self-honesty (check-in)" | "Making commitments..." | "Premature commitments (check-in)" |
| Both high | "Your internal alignment..." | "Your alignment (check-in)" | "Overriding others..." | "Rigidity from conviction (check-in)" |
| High clarity + low confidence | "Your clarity. You see the direction..." | "Your clarity (check-in)" | "Waiting for confidence..." | "Delaying action (check-in)" |
| Low clarity + high confidence | "Your confidence..." | "Your confidence (check-in)" | "Operating as if..." | "Moving without direction (check-in)" |
| Low clarity only | "Your capacity to ask..." | "Your discernment (check-in)" | "Moving into the day..." | "Acting without anchor (check-in)" |
| Low confidence only | "Your self-awareness..." | "Your self-awareness (check-in)" | "Decisions performed from..." | "Projected confidence (check-in)" |
| High clarity only | "Your directional certainty..." | "Your direction (check-in)" | "Clarity about your own view..." | "Crowding out perspectives (check-in)" |
| High confidence only | "Your conviction..." | "Your conviction (check-in)" | "Confidence tipping into..." | "Closing off inputs (check-in)" |

Similarly condense evening variants. Remove the `"Based on your check-in today: "` prefix since source is now in brackets.

Apply same pattern to archetype, coach, and tier fallback sources:
- `"Based on your archetype profile: Your instinct to return to stillness..."` → `"Your stillness instinct (archetype)"`
- `"Based on your current readiness state: ..."` → `"Your state awareness (readiness)"`
- Coach sources: `"(coach, 3d ago)"` instead of `"Based on your recent coach conversation: ..."`

Context enrichment suffixes (from `buildDaytimeLeanOnSuffix` / `buildDaytimeWatchForSuffix`) should also be shortened — keep them to a single concise clause or remove them entirely since the Lean On/Watch For are now crisp.

### Problem 3: DailyRitual planBrief says "1 meeting ahead" but outer readiness says "demands ahead"
This is the same root cause as Problem 1. The planBrief correctly uses the dynamic meeting count (`with ${count} meetings ahead`) at line 795/807. The outer readiness incorrectly hardcodes "demands ahead." Fixing Problem 1 fixes this contradiction.

### Problem 4: Vertical connectors too subtle
**Location:** `ExecutiveHome.tsx`, lines 219 and 227

Current: `border-muted-foreground/20` — nearly invisible.

**Fix:** Change to `border-muted-foreground/35` and increase height from `h-6` to `h-8` for more presence while keeping the luxurious dashed aesthetic.

## Files to Change

### 1. `supabase/functions/compute-outer-readiness/index.ts`
- **Lines 906, 909-910, 952, 955**: Make defaultContext strings calendar-aware by checking `eventCount` before including "demands ahead" language
- **Lines 1360-1461**: Condense all 8 C×C modifier patterns to crisp 2-4 word Lean On/Watch For with `(check-in)` source tag
- **Lines 1468-1523**: Condense archetype matrix entries to crisp format with `(archetype)` tag
- **Lines 1527-1531**: Condense tier fallbacks to crisp format with `(readiness)` tag  
- **Lines 1775-1849**: Update source attribution from verbose prefixes to bracketed tags; remove or shorten context enrichment suffixes
- **Lines 1209-1275**: Condense evening insights similarly

### 2. `src/pages/ExecutiveHome.tsx`
- **Lines 219, 227**: Change connector from `border-muted-foreground/20` to `border-muted-foreground/35` and `h-6` to `h-8`

## What stays unchanged
- No database changes
- No changes to calendar metrics computation, wearable logic, or scoring
- Theme phrases (the quoted italic text) remain unchanged
- Context statement logic structure remains the same — only the fallback default text changes
- DailyRitual, JitCarousel, StepLabel components unchanged
- Coach insight age tiers and contradiction detection unchanged

