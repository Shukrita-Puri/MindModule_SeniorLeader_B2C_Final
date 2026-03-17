

# Plan: Canonical Tags, JIT Progress Tracker, Calendar Message Italics, Feedback Modal Fix

## 4 Changes

### 1. Canonical Tag Mapping + `extractEventType()` Alignment + `check-in` Fix

**File: `supabase/functions/generate-mastery-plan/index.ts`**

**A. Add `CANONICAL_TAGS` map** (~30 lines, after `extractEventType`):
```typescript
const CANONICAL_TAGS: Record<string, string> = {
  'board': 'Pre Board Meeting',
  'investor': 'Pre Investor Meeting',
  'fundraising': 'Pre Fundraising Meeting',
  'pitch': 'Pre Pitch',
  'all-hands': 'Pre All-Hands',
  'leadership': 'Pre Leadership Meeting',
  '1:1': '1:1 Prep',
  'team': 'Team Meeting Prep',
  'client': 'Pre Client Meeting',
  'speaking': 'Pre Speaking Engagement',
  'strategy': 'Strategic Planning Prep',
  'quarterly-review': 'Pre Quarterly Review',
  'performance-review': 'Pre Performance Review',
  'ma': 'Pre M&A Discussion',
  'launch': 'Pre Launch',
  'layoff': 'Pre Difficult Conversation',
  'negotiation': 'Pre Negotiation',
  'crisis': 'Crisis Response Prep',
  'media-interview': 'Pre Media Interview',
  'hiring-interview': 'Pre Hiring Interview',
  'interview-ambiguous': 'Interview Prep',
  'standup': 'Standup Prep',
  'retrospective': 'Retro Prep',
  'planning': 'Planning Prep',
  'finance': 'Pre Finance Review',
  'competitive': 'Competitive Review Prep',
  'other': 'Meeting Prep'
};
```

**B. Expand `extractEventType()`** to cover 12 missing categories (strategy, speaking, leadership, ma, launch, layoff, negotiation, crisis, competitive, finance, quarterly, performance-review). Also split `interview` into `media-interview` vs `hiring-interview` vs `interview-ambiguous`.

**C. Remove `check-in` from `extractEventType()` mapping to `1:1`** — `check-in` stays ONLY in `pre-difficult-conversation` scenario keywords... actually, the REVERSE is needed: remove `check-in` from the scenario `pre-difficult-conversation` keywords (line 187) since "Check-in with Sarah" is a routine 1:1, not a difficult conversation. Keep `check-in` in `extractEventType()` → `1:1`.

Also remove `1:1` from `pre-difficult-conversation` scenario keywords (line 187) since 1:1s are NOT difficult conversations by default.

**D. Line 949**: Replace `matchedScenario.id.replace(/-/g, ' ')` with canonical tag lookup:
```typescript
const evtType = extractEventType(event.title || '');
const canonicalTag = CANONICAL_TAGS[evtType] || 'Meeting Prep';
contextParts.push(`Upcoming ${canonicalTag.toLowerCase()} detected`);
```

**E. Line 1705**: Replace `eventType: scenario?.id || 'general'` with:
```typescript
eventType: CANONICAL_TAGS[extractEventType(topEvent.event.title || '')] || scenario?.contextLabel || 'Meeting Prep',
```

**F. HRV context (lines 919-928)**: Replace raw `evtType` in HRV messages with canonical tag for user-facing text:
```typescript
const canonicalLabel = CANONICAL_TAGS[evtType] || evtType;
// "Your HRV typically elevates 18% during Pre Board Meeting — ..."
```

### 2. JIT Progress Tracker (match Time-of-Day style)

**File: `src/components/home/JitCarousel.tsx`**

Add a progress counter between the event header and carousel, matching the DailyRitual pattern at line 533-538:
```tsx
<span className="text-xs font-medium font-body text-muted-foreground">
  0 of {preEventPlan.modules.length} completed
</span>
```

This is display-only for now (JIT doesn't track completion yet — would need `jit_ritual` table). Show `0 of X completed` to match the visual pattern. The existing `progressTracked` field on `PreEventPlan` is already available for future use.

### 3. Calendar Message Italics

**File: `src/components/home/DailyRitual.tsx`**

Line 528: Add `italic` to the calendarMessage span class:
```tsx
<span className="text-[11px] text-muted-foreground font-body mt-0.5 italic">
```

This matches the JIT context description italic style at JitCarousel line 221.

### 4. Feedback Confirmation Modal — Light/Glass Design

**File: `src/components/PracticeRatingModal.tsx`**

Line 53-76: Replace the dark confirmation overlay with a glass-like design matching the rating form:
- Change `bg-black/60` → `bg-black/30` (lighter overlay)
- Change the inner div from `bg-gradient-to-br from-charcoal via-charcoal/95 to-charcoal/90` → `bg-background/95 backdrop-blur-md border border-border` (matching the rating form at line 82)
- Change `border-saffron/20 shadow-[0_0_60px_hsl(var(--gold)/0.15)]` → `shadow-2xl` (matching rating form)
- Keep the check icon and text but update text colors from `text-foreground` (which was white on dark) to work on light background

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/generate-mastery-plan/index.ts` | CANONICAL_TAGS map, expand extractEventType, fix check-in, use canonical tags in context + eventType response |
| `src/components/home/JitCarousel.tsx` | Add "0 of X completed" progress counter |
| `src/components/home/DailyRitual.tsx` | Add italic to calendarMessage |
| `src/components/PracticeRatingModal.tsx` | Light glass-like confirmation modal |

No DB migrations needed.

