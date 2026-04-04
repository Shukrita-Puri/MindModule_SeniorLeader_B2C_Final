

# Global Mobile Typography System

## Problem
Font sizes are desktop-scaled. On a 390px mobile screen, titles compete with body text, context statements run to 3+ lines, and nothing creates clear visual hierarchy. A C-suite user glancing at the app before coffee cannot instantly parse what matters.

## Solution
Define a mobile-first typography scale as CSS utility classes in `index.css`, then apply them consistently across all pages and components. No logic, data, or copy changes – only sizing, spacing, and visual weight.

---

## Part 1: Global CSS Variables + Utility Classes

**File: `src/index.css`**

Add a new `@layer components` block defining mobile typography utilities:

```css
/* Mobile-first typography scale */
.typo-score        { font-size: 48px; font-weight: 500; }
.typo-page-title   { font-size: 17px; font-weight: 500; }
.typo-section-label { font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; }
.typo-context      { font-size: 15px; font-weight: 400; line-height: 1.5; }
.typo-supporting   { font-size: 12px; font-weight: 400; }
.typo-btn          { font-size: 15px; font-weight: 500; }
.typo-state-label  { font-size: 15px; font-weight: 500; }
.typo-state-sub    { font-size: 12px; font-weight: 400; }
.typo-lean-label   { font-size: 11px; font-weight: 500; text-transform: uppercase; }
.typo-lean-value   { font-size: 13px; font-weight: 400; }
.typo-tab          { font-size: 14px; }
.typo-hero-sub     { font-size: 15px; }
```

Also add a context-clamp utility for the 2-line hard limit:
```css
.context-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

---

## Part 2: Page-by-Page Application

### ExecutiveHome.tsx
- Hero greeting `h1`: Change from `text-4xl sm:text-5xl md:text-6xl` → `text-[28px] sm:text-4xl md:text-5xl` (mobile: 28px, still scales up for tablet/desktop)
- Hero subtitle: Change `text-base` → `text-[15px] text-muted-foreground/70` (was full opacity, too heavy)
- Tab bar labels: Already `text-sm` (14px) – correct, just confirm `font-weight` toggles between 400/500

### TodayStateCard.tsx
- Section label ("Decision Readiness"): Already `text-xs` – change to `text-[11px] tracking-[0.08em]`
- Score number: Change `text-4xl md:text-5xl` → `text-[48px] font-medium` (currently `font-bold` – reduce to medium)
- "/ 100" denominator: Change `text-lg` → `text-[13px]`
- Tier label (e.g. "Strong Readiness"): Change `text-base font-medium` → `text-[15px] font-medium`
- Context statement: Change `text-sm` → `text-[15px] leading-[1.5]`, add `context-clamp` (2-line max)
- Layer 3 wearable text: Already `text-xs` – change to `text-[12px]`
- Data sources footer: Already `text-[10px]` – correct

### StrategicIntentionCard.tsx
- Section label: Already `text-xs` – change to `text-[11px] tracking-[0.08em]`
- Theme phrase (the quoted headline): Change `text-xl md:text-2xl` → `text-[17px] md:text-xl` (4 words max – shouldn't wrap)
- Context line: Change `text-sm` → `text-[15px] leading-[1.5]`, add `context-clamp`
- Coach insight label: Already `text-xs` – correct
- Lean On / Watch For labels: Change `text-[13px]` → use `text-[11px] uppercase tracking-[0.08em]` for the "Lean on:" / "Watch for:" labels, and `text-[13px]` for the value text (already correct)
- Data sources: Already `text-[10px]` – correct

### DailyCheckIn.tsx
- Page title: Change `text-4xl` → `text-[22px] sm:text-3xl`
- Subtitle "Mental Sharpness State": Change `text-base font-semibold` → `text-[11px] tracking-[0.08em] font-medium` (section label style)
- Description paragraph: Change `text-base` → `text-[15px]`, add `context-clamp`
- State card titles: Change `text-base` → `text-[15px] font-medium`
- State card subtitles: Already `text-xs` → change to `text-[12px] italic`
- Confirm button: Change `text-sm` → `text-[15px] font-medium`

### Insights.tsx
- Page title: Change `text-5xl` → `text-[22px] sm:text-4xl`
- Description: Change `text-sm` → `text-[13px]`, add `context-clamp`
- Tab labels: Already `text-sm` – correct

### RecalibrateMode.tsx
- Tool titles: Change `text-2xl` → `text-[17px] sm:text-xl`
- Tool descriptions: Already `text-sm` – correct

### DailyRitual.tsx
- Plan label: Change `text-sm font-semibold` → `text-[15px] font-medium`
- Step count: Already `text-[11px]` – correct
- Module type labels: Already `text-xs` – correct
- Module titles: Change `text-base font-semibold` → `text-[15px] font-medium`
- Module reasoning: Already `text-[12px]` – correct
- Button text: Change `text-base font-semibold` → `text-[15px] font-medium`

### Global rule enforcement
Search for any remaining `text-base`, `text-lg`, `text-xl` in mobile-visible body text and reduce. Page titles can be `text-xl` max on mobile. Score numbers are the only element at 48px.

---

## Part 3: Context Statement 2-Line Clamp

Apply the `context-clamp` class to all context/insight text blocks:
- `TodayStateCard` – contextual insight paragraph
- `StrategicIntentionCard` – context line
- `DailyCheckIn` – description paragraph
- Any other multi-line insight text

When clamped text is truncated, no expand chevron needed for v1 – the full text is available in the respective detail views.

---

## Files Changed

| File | Changes |
|------|---------|
| `src/index.css` | Add typography utility classes + context-clamp |
| `src/pages/ExecutiveHome.tsx` | Hero greeting + subtitle sizing |
| `src/components/home/TodayStateCard.tsx` | Score, tier, context, denominator sizing |
| `src/components/home/StrategicIntentionCard.tsx` | Theme phrase, context, lean/watch labels |
| `src/pages/DailyCheckIn.tsx` | Title, subtitle, state cards, button |
| `src/pages/Insights.tsx` | Title, description |
| `src/pages/RecalibrateMode.tsx` | Tool title sizing |
| `src/components/home/DailyRitual.tsx` | Plan label, module titles, buttons |

## What Will NOT Be Touched
- Copy content, data logic, component structure
- Desktop/iPad layouts (changes are mobile-first, desktop scales up)
- Navigation, routing, auth, coach logic
- Color palette or design tokens (only sizing/weight)

