

# Fix: JIT & Time-of-Day Context Lines — Intermittent & Generic

## Root Cause Analysis

There are **two separate context description pipelines**, and the inconsistency comes from which one runs:

### JIT Context (`contextDescription`)

**Path A — New Pipeline (jit_event_context bridge):** `buildEnrichedContextDescription()` (line 1085) generates rich context from bucket classification, coach memory, HRV data, and confidence framing. This produces lines like *"High inner-state demand detected — you've discussed this concern with your coach — in 10 hours. Prepare with targeted practice."*

**Path B — Legacy fallback:** `scoreCalendarEventsLegacy()` (line 1164) generates weak context using only basic structural signals. This produces lines like *"You're organizing this event — in 10 hours. Prepare with targeted practice."* — which is the generic text visible in your screenshot.

**Why it's intermittent:** The bridge queries `jit_event_context` for rows updated within the last 4 hours. If `generate-jit-events` hasn't run recently (it's not called on every page load), the bridge finds no rows and falls back to legacy scoring — producing the generic "organizing this event" text.

**Additional issue:** In the legacy path, `coachContext.mentionContent` is never populated (line 638 — `coachContext` object is initialized without a `mentionContent` property), so `generateContextStatement()` in `generate-jit-events` always receives `null` as `content`, making the emotional concern detection ("Last time: You felt anxious going in") unreachable.

### Time-of-Day Context (`module.reasoning`)

The `reasoning` field exists on every module but is **never rendered** in `DailyRitual.tsx` or `JitCarousel.tsx`. The previous plan identified this but it hasn't been implemented yet. Values like "Restore calm and emotional regulation" are generated but invisible.

### Per-Module Reasoning (Static)

All `reasoning` values in both JIT and ToD are hardcoded strings (e.g., "Settle your body before this event", "Mental framework to sharpen your approach"). They're never context-aware.

## Plan

### Step 1: Fix Legacy Fallback Context in `generate-mastery-plan`

**File: `supabase/functions/generate-mastery-plan/index.ts`**

In `scoreCalendarEventsLegacy()` (~line 1255-1273), replace the weak context builder with richer logic:

- Remove the generic "You're organizing this event" line — being organizer alone is not a justifiable reason
- When no scenario matches and no structural signals exist, produce: `"Upcoming event — in X hours. Preparation recommended."`  
- When a scenario matches, use the scenario's `contextLabel` (e.g., "Board Meeting Prep detected")
- When confidence is below medium (from dim scores), suppress the context line entirely (return empty string so UI hides it)

Add a confidence-like score to legacy events using dimA + dimB to decide whether to show context:
```
if (dimA + dimB < 18) contextDescription = ''; // Hide if low confidence
```

### Step 2: Fix `mentionContent` Never Being Set in `generate-jit-events`

**File: `supabase/functions/generate-jit-events/index.ts`**

In the coach memory cross-reference block (~line 537-546), when `coachMemoryMatch` is true, also capture the matching memory content:

```typescript
if (coachMemoryMatch) {
  coachSignalScore = 15;
  coachSignalBucket = 'clarity';
  coachContext.hasMentions = true;
  // FIX: Actually populate mentionContent for generateContextStatement
  const matchedMemory = coachMemoryTexts.find((m: any) =>
    titleWords.some(w => m.content.includes(w)) ||
    m.themes.some((t: string) => titleLower.includes(t.toLowerCase()))
  );
  coachContext.mentionContent = matchedMemory?.content || null;
}
```

This enables the emotional concern detection ("Last time: You felt anxious going in") to actually fire.

### Step 3: Add `generate-jit-events` Call from `generate-mastery-plan` When Bridge is Stale

**File: `supabase/functions/generate-mastery-plan/index.ts`**

In `getPreScoredEvents()` (~line 960), before falling back to legacy scoring, check if there are calendar events available and the bridge is simply stale. If so, run the JIT scoring logic inline (simplified version) rather than falling back to the weak legacy path.

Actually, a simpler fix: **extend the bridge staleness window from 4 hours to 12 hours.** The data doesn't change that fast — events are the same throughout the day. Change line 971:
```typescript
const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
```

### Step 4: Enrich Legacy Context with Coach Memory + HRV

**File: `supabase/functions/generate-mastery-plan/index.ts`**

In the `enrichedContextDescription` block (~line 2021-2047), this enrichment only runs when the **bridge** path produced the top event. Move this enrichment to also apply when legacy scoring produced the top event. Currently it works because `topEvent.contextDescription` is set either way — but the legacy path starts with weak context. Enhance the enrichment to be more aggressive:

- When `relevantCommitment` exists, replace the entire opening with: `"You discussed this with your coach — prepare with targeted practice."`
- When `patternInsight` matches, use: `"Your coach has noted a pattern here — in X hours."`
- When HRV correlation exists (already appended), make it the lead context if no coach signal exists

### Step 5: Hide Context When Confidence is Low

**File: `src/components/home/JitCarousel.tsx`**

At line 297, conditionally render the context description:
```tsx
{preEventPlan.contextDescription && preEventPlan.contextDescription.length > 0 && (
  <p className="text-xs text-muted-foreground italic font-body leading-relaxed flex-1 min-w-0">
    {preEventPlan.contextDescription}
  </p>
)}
```

The backend will now send empty string for low-confidence events.

### Step 6: Add Per-Module `reasoning` to Card UI

**File: `src/components/home/DailyRitual.tsx`** (~line 629) and **`src/components/home/JitCarousel.tsx`** (~line 382)

After the title block, before the duration line, render:
```tsx
{module.reasoning && (
  <p className="text-[10px] text-muted-foreground/70 italic font-body line-clamp-2 leading-snug mt-0.5">
    {module.reasoning}
  </p>
)}
```

Increase card height from `h-40` to `h-44` in both files to accommodate.

### Step 7: Make Per-Module Reasoning Context-Aware (JIT only)

**File: `supabase/functions/generate-mastery-plan/index.ts`**

In the JIT module building blocks (~line 1920-2017), replace static reasoning strings with event-aware ones:

```typescript
// Touch 2 somatic
reasoning: `Settle your body before ${topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event'}`

// Touch 1 coach
reasoning: topEvent.scenario 
  ? `Discuss your ${topEvent.scenario.contextLabel.toLowerCase()} approach with your coach`
  : `Discuss your approach with your coach before this event`
```

## Summary of Changes

| File | Change |
|------|--------|
| `generate-mastery-plan/index.ts` | Extend bridge window 4h→12h; enrich legacy context; suppress low-confidence context; event-aware module reasoning |
| `generate-jit-events/index.ts` | Fix `mentionContent` never being populated |
| `JitCarousel.tsx` | Hide empty context; render `module.reasoning` |
| `DailyRitual.tsx` | Render `module.reasoning`; bump card height |

No database changes required.

