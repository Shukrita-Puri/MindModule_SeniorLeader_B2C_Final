

## Check-In Detail Page Redesign + Outer Readiness Brief Polish

This plan covers two areas: (1) a complete redesign of the Check-In Detail page for C-Suite leaders, and (2) removing em dashes and fixing styling on the Outer Readiness Brief card.

---

### 1. Check-In Detail Page (`src/pages/CheckInDetail.tsx`)

**Title and copy changes:**
- Title: "Clarity & Confidence" (replaces "Want to add more detail?")
- Subtitle: "Rate your mental clarity and decision confidence. This shapes your readiness profile and how your day is calibrated." (replaces the "Optional" messaging)
- This screen becomes mandatory in the flow (no skip option)

**Navigation changes:**
- Back button navigates to `/daily-check-in` instead of `/executive-home`
- Remove the "Skip for now" button entirely

**Button styling:**
- "Save & Continue" button: white text (`text-white`) instead of `text-charcoal`

**Slider redesign (prominent, sleek):**
- Increase track height from `h-2` to `h-3` with a gradient track fill (primary to saffron)
- Increase thumb size from `h-5 w-5` to `h-7 w-7` with a shadow and border glow
- Increase label font sizes: metric name `text-base font-semibold`, value label `text-base`
- Add more vertical spacing between sliders

**Luxury 3D glass styling:**
- Page background: subtle gradient (`bg-gradient-to-br from-background via-background to-muted/20`)
- Slider card wrapper: frosted glass card with depth shadow, rounded-2xl, gradient border highlight, inner radial glow (similar to `LuxuryInsightCard` pattern)
- Subtle top-line glass highlight for premium feel

---

### 2. Outer Readiness Brief Styling (`src/components/home/StrategicIntentionCard.tsx`)

**Remove em dashes from tooltip:**
- Replace all `—` (em dashes) in the tooltip description with `. ` or restructure sentences

**Lean On / Watch For styling:**
- Remove `italic` class from the text
- Change font from `font-body` (Inter) to `font-subheadline` (Crimson Pro) for a distinct, editorial feel
- Keep `font-semibold not-italic` on the labels

---

### 3. Edge Function: Remove Em Dashes (`supabase/functions/compute-outer-readiness/index.ts`)

- Find and replace all `—` (em dash) characters with `. ` or restructure to use periods/commas across all 40+ theme context lines, Lean On/Watch For statements, pattern recognition overrides, and no-calendar fallbacks
- Update test file assertions to match

---

### Technical Details

**Files to modify:**
1. `src/pages/CheckInDetail.tsx` - Full redesign (title, copy, navigation, styling, remove skip)
2. `src/components/ui/slider.tsx` - Create a new luxury slider variant with larger track/thumb and gradient fill
3. `src/components/home/StrategicIntentionCard.tsx` - Remove italic from Lean On/Watch For, change font, remove em dashes from tooltip
4. `supabase/functions/compute-outer-readiness/index.ts` - Replace all em dashes in theme/insight strings
5. `supabase/functions/compute-outer-readiness/index.test.ts` - Update assertions to match removed em dashes

**No new dependencies required.** All styling uses existing Tailwind classes and design tokens.

