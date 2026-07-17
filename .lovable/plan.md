## Fix: onboarding hero mockup is cropped

### Diagnosis
`StageUSPIntro.tsx` renders the phone mockup with `object-cover` inside a `42vh` hero. Because the generated images are tall portraits (phone + card content), `object-cover` scales them up to fill the width and crops the top/bottom — which is why the Brief/Plan card content is hidden. `objectPosition: "center 6%"` only shifts the crop, it doesn't reveal the hidden pixels.

### Change (slides 1 & 2 only, presentation-only)
In `src/pages/onboarding/stages/StageUSPIntro.tsx`:

1. Increase hero height from `h-[42vh]` to `h-[48vh]` so the mockup has vertical room without squeezing the bottom text block (bottom half still holds title + body + dots + CTA comfortably).
2. For slides 1 & 2 (the phone mockups), switch the image to `object-contain` with `object-position: top`, so the entire phone — including the Brief score / Plan priority card — is visible, Granola-style, peeking up from the bottom of the hero.
3. Slides 3 & 4 (sunrise engraving) keep `object-cover` / `center` — they're landscape and already display correctly.

### Technical detail
```tsx
className="absolute inset-0 w-full h-full"
style={{
  filter: "grayscale(1) contrast(1.05)",
  objectFit: idx < 2 ? "contain" : "cover",
  objectPosition: idx < 2 ? "center top" : "center",
}}
```
And hero wrapper: `h-[48vh]`.

No image regeneration, no logic changes, no other files touched.
