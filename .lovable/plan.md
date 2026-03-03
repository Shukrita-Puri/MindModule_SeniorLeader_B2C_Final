

## Light Theme Coach Page + Remove Subtitle from Nav

### Changes

**1. Switch to light theme (CoachSplitView.tsx)**

**Empty state:**
- Replace dark gradient `from-[#1a1a2e] via-[#16213e] to-[#0f0f1a]` with a soft light gradient (e.g., `from-stone-50 via-white to-stone-100`)
- All text switches from `text-white` variants to dark text (`text-foreground`, `text-muted-foreground`)
- Avatar border from `border-white/20` to `border-stone-200`
- Prompt buttons: `hover:bg-black/5` instead of `hover:bg-white/10`, dark text

**Active chat:**
- Remove the full-bleed dimmed coach photo background
- Replace with clean light background (`bg-stone-50` or similar)
- Top bar: light glass style (`bg-white/80 backdrop-blur-xl border-b border-border`)
- Message bubbles: light glass — user bubbles `bg-stone-100 border border-stone-200`, coach bubbles `bg-white border border-stone-200`
- All text becomes dark (`text-foreground`)
- Input bar: use `glass={false}` (light variant already exists)
- Typing indicator dots: `bg-muted-foreground/40`

**2. Remove "Your personal executive coach" subtitle (SelfMasteryCoach.tsx)**
- Remove the `getSubtitle()` call and the subtitle `<span>` from the FloatingNavigation `centerContent`
- Keep just "Inner Mastery Coach" title in the nav when chat is active

**3. Remove inner top bar subtitle (CoachSplitView.tsx)**
- In the active chat top bar (line 304), remove the `<p>` showing truncated `contextualGreeting` — it's redundant

### Files to modify
- `src/components/coach/CoachSplitView.tsx` — theme flip + remove subtitle
- `src/pages/SelfMasteryCoach.tsx` — remove subtitle from FloatingNavigation center content

