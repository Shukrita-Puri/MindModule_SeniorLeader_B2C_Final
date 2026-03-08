

# Plan: Redesign /refer Page to Match App Brand + Fix UX Issues

## Changes to `src/pages/Refer.tsx`

### 1. Visual Redesign — Match App Palette
- Use the app's glassmorphic card style (`bg-white/65 backdrop-blur-[30px]`) already defined in `Card` component
- Use saffron accent for the hero gradient and CTA buttons (brand primary)
- Use `font-headline` (Cormorant Garamond) for headings, `font-body` (Inter) for body
- Use taupe/gold accents for bullet icons instead of generic `text-primary`

### 2. Gift Box Icon — AI-Generated
- Use the Lovable AI image generation API (`google/gemini-2.5-flash-image`) to generate a gift box illustration via an edge function
- Simpler approach: Create an inline SVG gift box with saffron/gold colors and sparkle elements that matches brand, avoiding external asset dependencies
- Place in the hero card area replacing the plain `Gift` lucide icon

### 3. Fix Referral Link Visibility
- The referral link input is not visible (white text on white background)
- Make the input clearly readable with proper contrast
- Replace the dual copy icon + "Copy link" button pattern with a single clean layout: visible link text + "Copy link" button next to it (like Lovable's referral UI)

### 4. Update Copy
- Change bullet 2 from: "You get 1 month free once they subscribe to Pro (up to 6 months — resets every 3 months)"
- To: "You get 1 month free once they subscribe to Pro (valid up to 6 months free & this resets every 3 months)"

### 5. Streamlined Layout (Lovable-style single card flow)
Instead of 4 separate cards, consolidate into a cleaner single-scroll layout:
- Hero section with gift box SVG illustration
- "How it works" with saffron-colored step icons
- Referral link with visible URL + "Copy link" button
- Stats line: "0 signed up, 0 converted"
- Terms link at bottom

## Files Changed

| File | Action |
|---|---|
| `src/pages/Refer.tsx` | Rewrite with brand-consistent design, fix link visibility, update copy |

No backend changes needed — this is purely a visual/UX update.

