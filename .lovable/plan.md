
## Plan: harden the slider thumb so the exact white hatched disc renders everywhere

### Root cause identified

There is only one luxury slider implementation in the codebase:

- `src/components/ui/slider.tsx` contains the only `LuxuryThumb`
- `src/pages/CheckInDetail.tsx` is the only place using `variant="luxury"`

So this is not a “wrong page using a different thumb component” problem.

The broken thumb in your newer screenshot matches an older/intermediate thumb shape (small inner hatched circle / extra inner ring look), while the current file already contains the newer full-disc hatched version. That means the inconsistency is most likely one of these two issues:

1. the SVG thumb markup is still too ambiguous and needs to be simplified to the exact reference shape, and/or
2. a stale built bundle on the live/custom-domain route is still serving an older thumb version even though the source file now shows the newer one.

### What I will change

#### 1) Make the thumb SVG match the reference exactly
File: `src/components/ui/slider.tsx`

I will tighten `LuxuryThumb` so it is unambiguously the thumb from your reference:

- solid off-white circular disc
- diagonal hatch lines visible across the disc
- single dark hand-drawn outer ring
- no inner “dot” look
- no extra inner ring look
- same existing size, shadow, and overall rail layout

This keeps the current visual language, but removes the shape ambiguity that allowed the thumb to read as “broken”.

#### 2) Remove misleading legacy intent from the component
File: `src/components/ui/slider.tsx`

The current comment still describes the thumb as having a “small inner cross-hatch dot”, which no longer matches the intended thumb. I will update the component description so the implementation and future edits stay aligned.

#### 3) Confirm there is no duplicate thumb path in-app
I already verified from the code search that:

- there is no second `LuxuryThumb`
- there is no second luxury slider component
- `/check-in-detail` uses the shared slider directly

After approval, I’ll re-check the live rendering path as part of verification to confirm the app is not serving a stale thumb bundle.

### What will stay unchanged

- engraved rail texture
- slider colors / gradient
- slider spacing and layout
- `Continue to Today's Performance` CTA
- Daily Check-In state-button styling
- overall branding / typography / page composition

### Verification after implementation

#### Code-level verification
- confirm only one `LuxuryThumb` definition remains
- confirm `/check-in-detail` still uses the shared `variant="luxury"` slider
- confirm no inner-circle thumb markup remains

#### UI verification
Check `/check-in-detail` and verify all 3 sliders show:
- white circular thumb
- visible diagonal hatch lines
- dark outer ring
- no “broken/prohibited” icon appearance
- no oversized or distorted thumb

#### Environment verification
Compare rendering on:
- preview
- published/live route if available
- custom domain route if available

If preview is correct but live/custom still shows the older thumb, I’ll treat that as stale deployment/cache drift and force a fresh frontend rebuild through a real code change, then verify again.

### Expected outcome

The slider thumb on `/check-in-detail` will render as the exact white hatched circular thumb from your reference, with no broken inner-dot appearance, and the implementation will be aligned so the same thumb shows consistently across environments.
