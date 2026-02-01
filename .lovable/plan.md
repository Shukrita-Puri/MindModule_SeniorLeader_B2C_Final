
# Coach Background Visual Enhancement

## Overview

Add the uploaded cinematic portrait image as a full-bleed background visual for the coach's top half of the split view, similar to the Epic Life reference design.

---

## Current State

The coach section currently uses gradient backgrounds only:
- Warm gradient backdrop (`from-saffron/15 via-taupe/10 to-background`)
- Radial glow effect
- Transparent "SELF MASTERY" text overlay

## Desired State

Based on the Epic Life reference:
- Full-bleed portrait image covering the coach's half
- Image positioned to focus on the face/profile area
- Dark gradient overlay for text legibility
- Coach response text overlaid on the image
- Warm, cinematic feel matching the existing brand

---

## Implementation

### File Changes

| File | Action |
|------|--------|
| `src/assets/coach-visual.jpeg` | Copy the portrait image |
| `src/components/coach/CoachSplitView.tsx` | Add image as background with overlay |

### Visual Treatment

The background will feature:

1. **Full-bleed image**: Using `object-cover` to fill the container
2. **Position focus**: `object-position: top center` to keep the face visible
3. **Dark gradient overlay**: `bg-gradient-to-t from-black/70 via-black/30 to-black/20` for text legibility
4. **Text contrast**: Coach responses will use light text (`text-white`) when image is present

### Code Structure

```text
+------------------------------------------+
|  [Portrait Image - full bleed]           |
|  +---------------------------------+     |
|  | Dark gradient overlay           |     |
|  |                                 |     |
|  | "Hello, Dhairya"                |     |
|  | "How can I support you..."      |     |
|  |                                 |     |
|  | [Protocol Card]                 |     |
|  +---------------------------------+     |
+------------------------------------------+
|  [User input area - light bg]            |
+------------------------------------------+
```

### Implementation Details

```typescript
// Background layer in top half
<div className="h-1/2 relative overflow-hidden">
  {/* Full-bleed portrait image */}
  <div className="absolute inset-0">
    <img 
      src={coachVisual}
      alt=""
      className="w-full h-full object-cover object-top"
    />
    {/* Dark gradient overlay for text legibility */}
    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
  </div>
  
  {/* Content with light text */}
  <div className="relative z-10 h-full flex flex-col justify-end p-4 pb-6">
    <h2 className="text-white text-2xl font-headline">Hello, {firstName}</h2>
    <p className="text-white/80">{greeting}</p>
  </div>
</div>
```

### Text Contrast Updates

When the image background is active, text colors will be adjusted:
- Heading: `text-white`
- Body text: `text-white/90`
- Muted text: `text-white/70`
- Coach monogram: Keep saffron accent for brand continuity

The "SM Coach" avatar circle will use `bg-black/30 border-white/30` instead of saffron tones to match the dark overlay.

---

## Expected Outcome

1. **Cinematic feel**: Premium, human-centered visual matching Epic Life reference
2. **Text legibility**: Dark gradient ensures coach responses are readable
3. **Brand continuity**: Saffron accents preserved in interactive elements
4. **Split clarity**: Strong visual distinction between coach (image) and user (light) halves
5. **Full bleed**: Image extends edge-to-edge with no gaps

---

## Technical Notes

- Image imported as ES6 module from `@/assets/coach-visual.jpeg`
- `object-cover` ensures image fills container without distortion
- `object-top` positions the face in view as container changes
- Gradient overlay uses `from-black/70` at bottom for maximum text contrast where responses appear
