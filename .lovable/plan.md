

# Self Mastery Coach: Complete UI & Prompt Refinement

## Overview

This plan implements:
1. **New Coach Visual**: Image 1 (light linen shirt, blue misty background) to signal inner calm
2. **70/30 Layout Split**: Coach section occupies 70% to emphasize presence
3. **Sleek Send Button**: Replace `Send` icon with `ArrowUp` in a compact circular button
4. **Multimodal Input**: Add prominent `Mic` button alongside text input for simultaneous text/voice capability
5. **Self-Mastery Prompt Focus**: Add explicit guidance to keep coaching on inner awareness, not task management

---

## Part 1: New Coach Visual

### Action
Replace the current `coach-visual.jpeg` with the uploaded Image 1 (light shirt, blue misty background).

### Why This Image
- Light linen shirt suggests openness and approachability
- Blue misty/ethereal background evokes inner calm and reflection
- Warmer, softer palette compared to the current image
- Signals "inner mastery" rather than "executive strategy"

### File Changes
- Copy the uploaded image to `src/assets/coach-visual.jpeg` (replacing existing)

---

## Part 2: 70/30 Asymmetric Layout

### Current State
```tsx
<div className="h-1/2 ...">  {/* Coach: 50% */}
<div className="h-1/2 ...">  {/* User: 50% */}
```

### New State
```tsx
<div className="h-[70%] ...">  {/* Coach: 70% */}
<div className="h-[30%] ...">  {/* User: 30% */}
```

### Visual Layout

```text
+--------------------------------------------------+
| SELF MASTERY COACH                    (70%)      |
+--------------------------------------------------+
|  [Cinematic portrait - blue mist]                |
|                                                  |
|  Coach response - ample space for content        |
|  Protocol/Wisdom cards with full visibility      |
|                                                  |
|                                                  |
+--------------------------------------------------+
| {firstName}                           (30%)      |
+--------------------------------------------------+
|  [History collapse]                              |
|  [User message]                                  |
|  [🎤]  [Input field.....................]  [↑]  |
|  End session                                     |
+--------------------------------------------------+
```

---

## Part 3: Sleek ArrowUp Send Button

### Current State
- Uses `Send` icon from lucide-react
- Size: `h-9 w-9`

### New State
- Replace with `ArrowUp` icon (sleeker, modern)
- Reduce to `h-8 w-8` for a more compact look
- Keep saffron background

### Implementation
```tsx
import { ArrowUp, Loader2, Mic } from 'lucide-react';

<Button
  type="submit"
  size="icon"
  disabled={!inputValue.trim() || isLoading}
  className="absolute right-2 bottom-2 h-8 w-8 rounded-full bg-saffron hover:bg-saffron/90"
>
  {isLoading ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <ArrowUp className="h-4 w-4" />
  )}
</Button>
```

---

## Part 4: Prominent Mic Button for Voice Input

### Design Principle
Users should be able to:
- Type a message and send it (text mode)
- Tap mic to speak (voice mode)
- Use both in the same session without switching modes

### Implementation

Add a prominent Mic button to the left of the input field:

```tsx
<form onSubmit={onSubmit} className="relative flex items-end gap-2">
  {/* Voice button - prominent, left side */}
  <button
    type="button"
    onClick={onVoiceToggle}
    className={cn(
      "h-11 w-11 rounded-full flex items-center justify-center shrink-0",
      "border-2 transition-all",
      isVoiceMode 
        ? "bg-saffron border-saffron text-white" 
        : "border-saffron/40 bg-saffron/10 hover:bg-saffron/20 hover:border-saffron text-saffron"
    )}
  >
    <Mic className="h-5 w-5" />
  </button>

  {/* Text input with embedded send button */}
  <div className="flex-1 relative">
    <Textarea ... />
    <Button type="submit" ...>
      <ArrowUp className="h-4 w-4" />
    </Button>
  </div>
</form>
```

### Remove Mode Toggle Link
The current "Switch to voice / Switch to text" text link will be removed since both modes are now simultaneously accessible via the buttons.

---

## Part 5: Self-Mastery Focus in System Prompt

### Problem
The coach sometimes slips into "productivity coach" mode, asking about task steps rather than inner states.

**Example of problematic response:**
> "What is the very first step of that 'one task' you are looking at right now?"

This is task management, not self-mastery.

### Solution
Add an explicit "SELF-MASTERY FOCUS" section to the system prompt that:
1. Explicitly forbids productivity coaching
2. Redirects task questions back to inner awareness
3. Provides examples of correct vs incorrect responses

### Prompt Addition (after "STATE > STORY > STRATEGY" section)

```text
=== SELF-MASTERY FOCUS (CRITICAL) ===

You are NOT a productivity coach. You do NOT help with:
- Task prioritization or time management
- Action planning or "first steps"
- Breaking down projects into tasks
- Calendar or schedule optimization

Your domain is exclusively the INNER WORLD:
- Body sensations and somatic awareness
- Emotional states and their origins
- Thought patterns and cognitive loops
- Nervous system regulation
- Self-awareness, presence, and centeredness

WRONG (productivity coach):
"What is the very first step of that task?"
"Let's break this down into action items."
"How can you prioritize this?"
"What's the timeline for this project?"

RIGHT (self-mastery coach):
"What's happening in your body when you think about this?"
"Where do you feel that urgency sitting right now?"
"What would it mean to slow down here?"
"What's the fear beneath the rush?"
"When you pause, what do you actually know to be true?"
"What are you avoiding by staying in motion?"

If the user asks for help with tasks or prioritization, gently redirect:
"That's important, and you'll figure out the logistics. But first — what's going on inside you right now? That's where we work."

Every question should return them to INNER AWARENESS, not outer action.
Catch yourself if you're about to ask about tasks. Redirect to state.
```

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/assets/coach-visual.jpeg` | Replace with Image 1 (light shirt, blue mist) |
| `src/components/coach/CoachSplitView.tsx` | 70/30 split, ArrowUp icon, Mic button, remove mode toggle link |
| `supabase/functions/self-mastery-coach/index.ts` | Add "SELF-MASTERY FOCUS" section to system prompt |

---

## Technical Implementation Details

### CoachSplitView.tsx Changes

1. **Import Change**
   ```tsx
   // Before
   import { Send, Loader2, Mic, MicOff, ChevronUp, ChevronDown } from 'lucide-react';
   
   // After
   import { ArrowUp, Loader2, Mic, ChevronUp, ChevronDown } from 'lucide-react';
   ```

2. **Layout Heights**
   ```tsx
   // Before
   <div className="h-1/2 relative overflow-hidden flex flex-col">  // Line 170
   <div className="h-1/2 overflow-y-auto flex flex-col">  // Line 262
   
   // After
   <div className="h-[70%] relative overflow-hidden flex flex-col">
   <div className="h-[30%] overflow-y-auto flex flex-col">
   ```

3. **Input Form Structure** (Lines 323-350)
   ```tsx
   <form onSubmit={onSubmit} className="relative flex items-end gap-2">
     {/* Mic button */}
     <button
       type="button"
       onClick={onVoiceToggle}
       className={cn(
         "h-11 w-11 rounded-full flex items-center justify-center shrink-0",
         "border-2 transition-all",
         isVoiceMode 
           ? "bg-saffron border-saffron text-white" 
           : "border-saffron/40 bg-saffron/10 hover:bg-saffron/20 hover:border-saffron text-saffron"
       )}
     >
       <Mic className="h-5 w-5" />
     </button>
     
     {/* Text input with send button */}
     <div className="flex-1 relative">
       <Textarea ... />
       <Button type="submit" size="icon" className="h-8 w-8 ...">
         <ArrowUp className="h-4 w-4" />
       </Button>
     </div>
   </form>
   ```

4. **Remove Mode Toggle Link** (Lines 354-362)
   Delete the "Switch to voice / Switch to text" button entirely.

5. **Empty State Input** (Lines 120-159)
   Apply same changes: ArrowUp button, Mic button, remove toggle link.

---

## Expected Outcomes

1. **Calmer Visual Presence**: Light shirt + blue mist signals inner reflection, not executive strategy
2. **Clear Visual Hierarchy**: 70% coach section dominates, emphasizing the coach's presence
3. **Modern Send Button**: Sleek ArrowUp matches contemporary chat UIs
4. **Multimodal Ready**: Mic button is prominent and always accessible — no mode switching needed
5. **True Self-Mastery Coaching**: Prompt explicitly prevents productivity coaching and redirects to inner awareness
6. **Voice-Mode Foundation**: UI structure supports future voice conversation feature

