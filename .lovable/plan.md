

# Fix Coach "Prepare me" Label Visibility

## Problem
The "Prepare me" label is barely visible because saffron text blends into the warm-toned hero background image. At `text-[10px]` it's also too small to act as a compelling call-to-action.

## Solution
Make the label visually distinct and inviting by giving it a semi-opaque pill background, increasing font size, and using white text — so it pops against any background.

## Changes

### File: `src/components/navigation/CoachAccessButton.tsx`

1. **Default "Prepare me" label (mobile)**: Replace the plain saffron text with a pill-style badge:
   - Background: `bg-black/50 backdrop-blur-sm` (readable against any hero image)
   - Text: `text-white text-[11px] font-medium` (larger, bolder, white for contrast)
   - Shape: `rounded-full px-2.5 py-0.5` (pill shape draws the eye)
   - Add a subtle left-side dot or glow indicator in saffron to tie it to the coach button

2. **surfaceHint label (mobile)**: Same pill treatment but with `bg-saffron/80 text-white` to signal urgency/dynamism — keep the `animate-pulse`

3. **Desktop surfaceHint**: Same pill approach — `bg-black/40 backdrop-blur-sm text-white` so it works on any page background

4. **No other changes** — button icon, tooltip, navigation logic, and routing all stay the same

## Visual Result
- Against the sunrise hero: white-on-dark pill is immediately readable
- Against any future background: backdrop-blur ensures contrast
- The pill shape makes it feel tappable — an invitation, not just a label
- surfaceHint dynamic states will inherit the same high-visibility treatment

