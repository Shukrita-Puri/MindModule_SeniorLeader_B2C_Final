
# Coach UI Redesign + Gibberish Detection + Visual Asset Fix

## Overview

This plan addresses three issues:
1. **Gibberish Detection**: Coach responds to nonsense input ("ko", "ha", "fnfnf") as if meaningful
2. **UI Layout Reversion**: Revert from centered card to split-screen layout (Coach top half with background visual, User bottom half)
3. **Visual Asset Isolation**: Confirm no overlap between Executive Home videos and other pages

---

## Issue 1: Gibberish/Low-Quality Input Detection

### Current Problem
The AI coach interprets random characters like "ko", "ha", "lo", "nm", "fnfnf", "djkdf" as valid responses. Screenshots show the coach responding:
- "Steady. 'Ha' often signals a sudden insight..."
- "Acknowledged. You're keeping it lean..."
- "System noise detected. The signal is breaking down..."

While the AI eventually notices something is wrong, it should catch this much earlier.

### Solution: Input Quality Validation

**Approach 1: Client-side pre-validation** (before sending to AI)
Add input quality check in `handleSubmit` that detects:
- Very short messages (under 3 meaningful characters)
- No real words (consonant-only strings like "fnfnf")
- Repeated characters ("aaaa", "hhhh")
- Random keyboard mashing patterns

When low-quality input is detected, show a gentle prompt asking the user to share more clearly rather than sending to AI.

**Approach 2: System prompt enhancement** (AI-level detection)
Add to the system prompt:

```text
=== INPUT QUALITY AWARENESS ===

If the user sends:
- Random characters or gibberish (e.g., "asdf", "lkjh", "fnfnf")
- Single letters or very short nonsense responses
- Keyboard mashing or repeated characters

Do NOT interpret these as meaningful communication. Instead:
1. Gently acknowledge you're having trouble understanding
2. Ask them to share what's actually on their mind
3. Offer to restart with a clear question

Example response:
"I want to make sure I'm understanding you. Could you share what's on your mind in a full sentence? I'm here when you're ready to talk."

Do not project meaning onto gibberish. Do not treat "ha" as insight or "nm" as "nothing much" unless context clearly supports it.
```

### Implementation Files
- `supabase/functions/self-mastery-coach/index.ts` - Add input quality section to system prompt
- `src/pages/SelfMasteryCoach.tsx` or `src/hooks/useCoachConversation.ts` - Add optional client-side pre-filter

---

## Issue 2: Coach UI Layout Redesign

### Current Design (Centered Card)
- `CoachHeroBackground` renders transparent "SELF MASTERY COACH" text
- `CoachConversationCard` is centered in the middle of the screen
- User messages and coach responses appear in same card

### Desired Design (Split Screen - Epic Life Reference)
Based on the reference image:
- **Top Half**: Coach area with background visual (warm, human-like image), coach response prominently displayed
- **Bottom Half**: User input area with text field and action buttons
- Collapsible earlier messages still supported
- Protocol cards and mental models still render in coach's space

### New Layout Structure

```text
+--------------------------------------------------+
|  [Back]           Self Mastery Coach    [New Chat]|
|                                                   |
|  +----------------------------------------------+ |
|  |                                              | |
|  |         [Background Visual/Gradient]         | |
|  |                                              | |
|  |   "Let's close out the day together..."      | |
|  |                                              | |
|  |   [Protocol Card / Wisdom Card area]         | |
|  |                                              | |
|  |         [Thinking indicator here]            | |
|  +----------------------------------------------+ |
|                                                   |
|  +----------------------------------------------+ |
|  |     ^ 4 earlier messages (collapsible)       | |
|  |                                              | |
|  |   +--------------------------------------+   | |
|  |   | Type your response...               |   | |
|  |   +--------------------------------------+   | |
|  |                                              | |
|  |       Switch to voice  |  End session        | |
|  +----------------------------------------------+ |
+--------------------------------------------------+
```

### Component Changes

**1. Create `CoachSplitLayout.tsx`** (or rename/refactor `CoachConversationCard`)
- Top section: Coach response area with visual backdrop
- Bottom section: User input with history toggle
- Maintain glass-morphic styling

**2. Update `CoachHeroBackground.tsx`**
- Keep transparent text for empty state
- Add option for visual backdrop when in conversation
- Use warm, calming imagery (not the Executive Home videos - those stay exclusive)

**3. Refactor `SelfMasteryCoach.tsx`**
- Replace centered `flex items-center justify-center` with split layout
- Top: Coach visual + latest response
- Bottom: User input area

### Visual Assets
Coach page will use its own set of assets (not the Executive Home videos):
- Option 1: Soft gradient backgrounds with subtle animation
- Option 2: Static calming imagery (separate from architectural illustrations used in Recalibrate)
- Keep the transparent "SELF MASTERY COACH" text in background (subtle)

---

## Issue 3: Visual Asset Separation Confirmation

### Current State (Already Correct)

| Page | Visual Assets Used |
|------|-------------------|
| **Executive Home** | 15 unique videos in `/all-visuals/videos/` (depleted-morning.mp4, etc.) |
| **Recalibrate** | Architectural illustrations (`architectural-pause.jpg`, etc.) |
| **Coach** | Currently uses gradients + transparent text only |
| **Insights** | No hero visual (text header only) |
| **Practice Players** | Practice-specific thumbnails |

### Verification
The videos in `/all-visuals/videos/` are ONLY used in `src/pages/ExecutiveHome.tsx` lines 116-147. No other files reference these paths.

The user may be experiencing a visual loading issue or confusion. If there's an actual error:
- Check video file existence and accessibility
- Verify video poster fallback images load correctly
- Add error handling for video loading failures

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/coach/CoachSplitView.tsx` | New split-screen layout component |

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/self-mastery-coach/index.ts` | Add gibberish detection instructions to system prompt |
| `src/pages/SelfMasteryCoach.tsx` | Use split layout instead of centered card |
| `src/components/coach/CoachConversationCard.tsx` | Refactor or replace with split design |
| `src/components/coach/CoachHeroBackground.tsx` | Update for split layout visual |
| `src/hooks/useCoachConversation.ts` (optional) | Add client-side input validation |

---

## Technical Details

### Gibberish Detection Patterns

```typescript
const isLikelyGibberish = (text: string): boolean => {
  const trimmed = text.trim().toLowerCase();
  
  // Too short
  if (trimmed.length < 3) return true;
  
  // No vowels (likely random consonants)
  const vowelCount = (trimmed.match(/[aeiou]/g) || []).length;
  if (trimmed.length > 3 && vowelCount === 0) return true;
  
  // Repeated characters
  if (/(.)\1{2,}/.test(trimmed)) return true;
  
  // Common keyboard patterns
  const keyboardPatterns = ['asdf', 'qwer', 'zxcv', 'hjkl', 'jkl', 'fgh'];
  if (keyboardPatterns.some(p => trimmed.includes(p))) return true;
  
  // Check against dictionary of known short valid responses
  const validShortResponses = ['ok', 'yes', 'no', 'hi', 'hey', 'thanks', 'bye'];
  if (trimmed.length < 4 && !validShortResponses.includes(trimmed)) return true;
  
  return false;
};
```

### Split Layout CSS Structure

```tsx
<div className="flex flex-col h-screen">
  {/* Navigation */}
  <header className="relative z-40">...</header>
  
  {/* Coach Section - Top Half */}
  <div className="flex-1 relative overflow-hidden">
    {/* Visual backdrop */}
    <div className="absolute inset-0">
      <div className="w-full h-full bg-gradient-to-b from-saffron/5 via-taupe/3 to-background" />
    </div>
    
    {/* Coach response area */}
    <div className="relative z-10 h-full flex flex-col justify-end p-4">
      {/* Latest coach message + embedded content */}
    </div>
  </div>
  
  {/* User Section - Bottom Half */}
  <div className="bg-white/70 backdrop-blur-xl border-t border-black/[0.06] p-4">
    {/* Collapsible history */}
    {/* Input area */}
    {/* Action links */}
  </div>
</div>
```

---

## Expected Outcomes

1. **Gibberish Rejection**: Coach asks for clarity when receiving nonsense input instead of projecting meaning
2. **Split Layout**: Coach visual in top half, user input in bottom half (matching Epic Life reference)
3. **Content Rendering**: Protocol cards and wisdom cards still display correctly in coach's section
4. **Voice-Ready**: Split design supports future voice mode toggle
5. **Visual Separation**: Executive Home videos remain exclusive, Coach uses its own visual treatment

---

## Implementation Priority

1. **Phase 1**: Update system prompt with gibberish detection instructions
2. **Phase 2**: Create split layout component structure
3. **Phase 3**: Refactor SelfMasteryCoach.tsx to use new layout
4. **Phase 4**: Add client-side input validation (optional enhancement)
5. **Phase 5**: Test all flows (prepare, integrate, guided-reflection)
