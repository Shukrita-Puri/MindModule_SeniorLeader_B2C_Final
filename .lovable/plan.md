

## Plan: Refer Page — MM Logo Animations + Card Styling Fix

### 1. Add MM logos "flying out" of the gift box in the hero section

In the hero section of `Refer.tsx`, add 3-4 `mm-logo-mini.png` images positioned absolutely near the gift box (right side). They will:
- Be placed between the box bottom and lid, appearing to burst outward
- Use CSS animations (`animate-bounce`, custom keyframes, or Tailwind arbitrary transforms) to create a floating/flying effect
- Stay close to the box — not overlapping any text (text is on the left, box is on the right)
- One logo will be larger (~40px) so it's clearly recognizable as the MM icon; others will be smaller (~20-24px)
- All will have slight rotation and offset variations for a natural "spilling out" look
- Use `pointer-events-none` so they don't interfere with interactions

Import: `import mmLogoMini from '@/assets/mm-logo-mini.png';`

### 2. Match card styling to Profile page

The Profile page uses the `<Card>` component from `src/components/ui/card.tsx` which has this styling:
```
rounded-2xl border border-black/[0.08] bg-white/65 backdrop-blur-[30px] backdrop-saturate-150
shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]
```

The current Refer page uses a custom `cardClass` with flat styling (`border-border/40`, minimal shadow). 

**Fix:** Replace the custom `cardClass` with the actual `<Card>` component (same one Profile uses), or update the `cardClass` string to match the Card component's styling exactly. Using the `<Card>` component directly is cleaner and ensures consistency.

Changes:
- Import `Card` from `@/components/ui/card`
- Replace `<div className={cardClass}>` wrappers with `<Card>` for: How It Works, Referral Code, and Stats sections
- Remove the `cardClass` constant
- The hero section keeps its own saffron gradient styling (not a Card)

### Files Modified
- `src/pages/Refer.tsx` — both changes above

