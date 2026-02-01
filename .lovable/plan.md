

# Coach UI Refinements: Layout, Typography, Legibility & Contextual Recommendations

## Issues Identified from Screenshots

### Issue 1: Initial State Layout
The visual should fill the ENTIRE screen when no conversation is active, then transition to the coach's half (top 50%) once conversation begins.

### Issue 2: Missing Section Labels
- The coach half needs a "Self Mastery Coach" label
- The user half needs the user's first name (e.g., "Dev") as label
- This helps users understand who is speaking where

### Issue 3: Text Overflow and Font Issues
- Text is overflowing/too large (`text-lg` on coach responses)
- Font appears different/cryptic (possibly due to whitespace/formatting issues)
- Need to reduce text size and ensure proper line wrapping

### Issue 4: Background Too Dark/Distracting
- Current gradient overlay is too intense: `from-black/70 via-black/40 to-black/20`
- Making it hard to see content, especially embedded cards
- Need to lighten the overlay

### Issue 5: Protocol & Wisdom Cards Not Visible
- Cards are merging with the dark background
- Need stronger contrast/styling for cards on dark backgrounds

### Issue 6: Contextual Recommendations Missing
- Coach recommends practices/wisdom but doesn't explain WHY
- Recommendations should explain the purpose: "This will help you..."
- Should not recommend with every exchange - only at key moments

---

## Implementation Plan

### Part 1: Full-Screen Visual on Empty State

```text
Layout States:
+--------------------------------------------------+
|  EMPTY STATE (no messages):                      |
|  Full-bleed visual covering entire viewport      |
|  Coach greeting centered                         |
|  Prompt suggestions at bottom                    |
+--------------------------------------------------+

+--------------------------------------------------+
|  ACTIVE CONVERSATION:                            |
|  +----------------------------------------------+|
|  | "Self Mastery Coach"          (top half)     ||
|  | [Coach visual background - 50%]              ||
|  | Coach responses here                         ||
|  +----------------------------------------------+|
|  | "Dev"                         (bottom half)  ||
|  | [Light background - 50%]                     ||
|  | User messages + input here                   ||
|  +----------------------------------------------+|
+--------------------------------------------------+
```

**Implementation in CoachSplitView.tsx:**
- Detect `hasMessages` state
- When empty: visual fills full height, content overlaid
- When active: visual constrained to top half with label

### Part 2: Add Section Labels

Add clear labels to identify speaker zones:

```tsx
{/* Coach Section Header */}
<div className="px-4 py-2 text-center">
  <span className="text-xs uppercase tracking-wider text-white/80 font-medium">
    Self Mastery Coach
  </span>
</div>

{/* User Section Header */}
<div className="px-4 py-2 border-b border-border/30">
  <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
    {firstName}
  </span>
</div>
```

### Part 3: Fix Typography

| Current | New |
|---------|-----|
| `text-lg` (coach text) | `text-sm` or `text-base` |
| `text-2xl` (greeting) | `text-xl` |
| `text-base` (subtext) | `text-sm` |

Also ensure:
- Use `font-body` (Inter) for body text, not headline font
- Add `font-body` class to coach response paragraphs
- Ensure `whitespace-pre-wrap` doesn't create odd spacing

### Part 4: Lighten Background Overlay

```tsx
// Current (too dark)
<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />

// New (lighter, more ambient)
<div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/25 to-black/10" />
```

Additionally, add a subtle blur to soften the image:
```tsx
<img 
  src={coachVisual}
  className="w-full h-full object-cover object-top filter brightness-75"
/>
```

### Part 5: Enhance Card Visibility on Dark Background

**ProtocolCard on dark background:**
```tsx
// Add variant prop or context-aware styling
<ProtocolCard
  ...
  className="bg-white/90 dark:bg-white/85 shadow-lg border-white/20"
/>
```

**WisdomCard on dark background:**
```tsx
// Update styling for contrast
<div className={cn(
  "relative rounded-lg p-4",
  "bg-white/80 backdrop-blur-sm",
  "border border-white/20 shadow-md",
  className
)}>
```

### Part 6: Contextual Recommendation Logic

**Update System Prompt** (`supabase/functions/self-mastery-coach/index.ts`):

Add to the content deployment guide:

```text
=== RECOMMENDATION CONTEXTUALITY ===

When recommending a protocol or wisdom card:
1. ALWAYS explain WHY this specific practice will help their current situation
2. Connect the recommendation to what they just shared
3. Keep explanation brief: 1-2 sentences before the marker

GOOD Example:
"You mentioned feeling like a train is leaving without you. That urgency in your body is real, but it's clouding your judgment. Let's slow your nervous system first:
[PROTOCOL:somatic:box-breathing-calm]"

BAD Example (no context):
"Here's something that might help:
[PROTOCOL:somatic:box-breathing-calm]"

=== RECOMMENDATION FREQUENCY ===

Do NOT recommend protocols/wisdom with every exchange. Save them for:
- When the user explicitly asks for help
- When you detect physiological dysregulation (overwhelmed, scattered, urgent)
- After they've shared something significant and need grounding
- Key inflection points (before a meeting, after a difficulty, at closure)

If the conversation is flowing well and they're processing:
- Stay in dialogue mode
- Use questions, not recommendations
- Let them reach their own insights

Only deploy embedded content when it would genuinely serve them.
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/coach/CoachSplitView.tsx` | Full-screen empty state, section labels, typography fixes, lighter overlay, card styling |
| `src/components/chat/ProtocolCard.tsx` | Add dark background variant styling |
| `src/components/chat/WisdomCard.tsx` | Add dark background variant styling |
| `supabase/functions/self-mastery-coach/index.ts` | Add contextual recommendation and frequency guidance |

---

## Visual Layout Details

### Empty State (Full-Screen Visual)

```tsx
{!hasMessages ? (
  // Full-screen visual for empty state
  <div className="flex-1 relative overflow-hidden">
    <div className="absolute inset-0">
      <img src={coachVisual} className="w-full h-full object-cover object-top brightness-75" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
    </div>
    
    <div className="relative z-10 h-full flex flex-col">
      {/* Greeting content centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-black/20 backdrop-blur ...">
          <span className="text-xl font-headline text-saffron">SM</span>
        </div>
        <h2 className="text-xl font-headline text-white mt-4">Hello, {firstName}</h2>
        <p className="text-sm text-white/80 mt-2 max-w-sm">{greeting}</p>
      </div>
      
      {/* Input at bottom */}
      <div className="p-4 bg-background/95 backdrop-blur-xl rounded-t-2xl">
        {/* Prompt suggestions + input */}
      </div>
    </div>
  </div>
) : (
  // Split layout for active conversation
  <div className="flex flex-col h-full">
    <div className="h-1/2 relative">...</div>
    <div className="h-1/2">...</div>
  </div>
)}
```

### Active Conversation (Split Layout)

```text
+--------------------------------------------------+
| SELF MASTERY COACH                               |
+--------------------------------------------------+
|  [Visual Background - lighter overlay]           |
|                                                  |
|  Coach response text (smaller, font-body)        |
|                                                  |
|  [Protocol Card - white bg for contrast]         |
|  [Wisdom Card - white bg for contrast]           |
+--------------------------------------------------+
| DEV                                              |
+--------------------------------------------------+
|  ^ 4 earlier messages                            |
|                                                  |
|  [User message bubble]                           |
|                                                  |
|  [Input field]                                   |
|                                                  |
|  Switch to voice | End session                   |
+--------------------------------------------------+
```

---

## Expected Outcomes

1. **Immersive Empty State**: Full-screen cinematic visual before conversation starts
2. **Clear Speaker Zones**: "Self Mastery Coach" and user's name label their respective halves
3. **Readable Text**: Smaller font sizes, proper body font, no overflow
4. **Visible Cards**: Protocol and Wisdom cards have white/light backgrounds for contrast
5. **Lighter Background**: Softer overlay that doesn't overwhelm content
6. **Contextual Recommendations**: Coach explains WHY a practice helps before recommending
7. **Selective Recommendations**: Only at key moments, not every exchange

