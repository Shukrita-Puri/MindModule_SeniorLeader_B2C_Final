

# Fix CheckInBanner styling, FloatingPillNav visibility & glass effect

## Changes

### 1. `CheckInBanner.tsx` — Match Outer Readiness Brief box styling
- Remove cream background (`#fff8ed`) and orange border (`#f5d5b8`)
- Apply same card styling as StrategicIntentionCard: `bg-white/65 backdrop-blur-[20px] border border-black/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.04)]`
- Change text color from orange to charcoal/muted (`text-foreground/70`)
- Change dot color from orange to `text-muted-foreground`
- Change dismiss X icon to `text-muted-foreground` (no orange)
- Keep only the "Check in" button in `#F26A50`
- Already only shows when no check-in exists today — no logic change needed

### 2. `FloatingPillNav.tsx` — Fix inactive icon visibility + true glass
- Change `INACTIVE_COLOR` from `rgba(255,255,255,0.45)` (invisible on light backgrounds) to a taupe/muted tone: `#8B7E74` (taupe from app palette) so icons are always visible
- The glass background `bg-white/15 backdrop-blur-md border border-white/40` matches the micro-practice cards exactly — but the issue is likely that the page background behind it is light, making `white/15` look opaque/washed out. Change to `bg-black/20 backdrop-blur-xl border border-white/20` for better contrast on any background, or use `bg-background/80 backdrop-blur-md` to match the app's own background token with translucency.

Actually, looking at the micro-practice cards reference (`bg-white/15 backdrop-blur-md border border-white/40`), those render on dark image backgrounds. The homepage has a lighter background, so the same values look washed out. I'll use `bg-black/30 backdrop-blur-xl border border-white/15` for a darker glass that reads well on the homepage.

### Files
| File | Change |
|------|--------|
| `src/components/home/CheckInBanner.tsx` | Restyle to match Outer Readiness Brief card; text in charcoal; only button stays orange |
| `src/components/navigation/FloatingPillNav.tsx` | Inactive color to taupe `#8B7E74`; darker glass background for visibility |

