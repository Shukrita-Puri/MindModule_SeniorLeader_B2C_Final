

## Make ROI Text Impactful

**Problem**: The ROI text is barely visible — it's `text-sm` with a muted taupe inline style color.

**Fix** in `src/pages/onboarding/stages/Stage6Payment.tsx`:

1. Increase base font size from `text-sm` to `text-base`
2. Make the "under £1 each" span larger: `text-xl font-bold`
3. Change color from the muted `hsl(25, 15%, 55%)` inline style to use the saffron color class for visibility
4. Add slightly more vertical spacing

