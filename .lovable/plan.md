

## Coach Page Fixes

Three changes based on your feedback:

### 1. Remove "Inner Mastery Coach" text from navigation bar
In `SelfMasteryCoach.tsx`, remove the `centerContent` prop entirely — no text in the nav bar at all during active chat. The nav should just be back arrow (left) + coach icon (right), like every other page.

### 2. Replace "New Chat" button with standard orange coach icon
Instead of a custom "New Chat" text button on the right side, use the same orange `ChatCircle` icon button that every other page uses. When on the coach page, tapping it calls `handleNewChat` (resets conversation) instead of navigating to `/coach`.

This makes the nav bar consistent: back arrow ← → orange chat icon, just like all other pages.

### 3. Generate a subtle AI background for the chat page
Use the AI image generation model to create a soft, light, atmospheric background (similar to the Allin reference — subtle clouds/sky in warm light tones) and use it as the chat conversation backdrop instead of the plain `bg-stone-50`.

- Generate via `google/gemini-2.5-flash-image` in an edge function
- Save to storage, reference as background
- Apply with low opacity behind the message thread so text remains readable

**However** — generating and storing an AI image requires an edge function + storage bucket setup which adds complexity. A simpler alternative: use CSS gradients to create a subtle warm atmospheric effect that evokes the same feel without needing an actual image file.

### Files to modify
- `src/pages/SelfMasteryCoach.tsx` — remove centerContent text, replace rightContent with standard coach icon that triggers handleNewChat
- `src/components/coach/CoachSplitView.tsx` — add subtle warm gradient/atmospheric background to active chat view instead of plain `bg-stone-50`

