

## Fix: Sidebar Logo Covered by Notch + Pulsating Overlay on Homepage

### Issue 1: Sidebar Logo Still Covered

**Root cause**: The `SidebarHeader` has `h-16` (fixed height) combined with `safe-area-top`. The fixed height constrains the element, so when safe-area padding is added, the content gets compressed rather than pushing down. On mobile, the sidebar renders as a Sheet overlay, and `h-16` doesn't leave room for the notch inset.

**Fix in `src/components/navigation/LeftSidebar.tsx`**:
- Change `h-16` to `min-h-[4rem]` so the header can grow when safe-area padding is applied
- Add explicit top padding `pt-[env(safe-area-inset-top,0px)]` plus extra spacing (`pt-12` on mobile) to push the logo and text well below the Dynamic Island/notch area

### Issue 2: Pulsating Foggy Colour on Homepage

**Root cause**: In `ExecutiveHome.tsx`, the hero video uses `key={getHeroVideo()}`. When `energyState` loads asynchronously, `getHeroVideo()` changes from the `default` tier video to the actual tier video. This causes the `<video>` element to **unmount and remount** — resetting opacity from 0.4 back to 0, then fading back to 0.4 via `transition-opacity duration-1000`. Combined with the gradient overlay (`from-background/10 via-background/50 to-background`) and the `transition-opacity duration-700` on the gradient div, this creates a visible flash/pulse effect each time the energy state data updates.

Additionally, the `TodayStateCard` registers its own observer on the same `['energy-state']` query with `staleTime: 0` and `refetchOnWindowFocus: true`, which can trigger additional re-renders and video remounts.

**Fix in `src/pages/ExecutiveHome.tsx`**:
- Memoize the video URL so it doesn't change on every render: use `useMemo` for the hero video URL, only recomputing when `energyState?.energyTier` actually changes
- Remove `transition-opacity` from the gradient overlay div (it doesn't need to animate)
- Set the video's initial opacity to `0.4` directly (no fade-in transition) to prevent flash on remount, or better: use a `ref` to set opacity once and not reset on key change

**Files to change**:
| File | Change |
|------|--------|
| `src/components/navigation/LeftSidebar.tsx` | Replace `h-16` with `min-h-[4rem]`, add generous top padding for mobile safe area |
| `src/pages/ExecutiveHome.tsx` | Memoize video URL, remove transition-opacity from gradient, stabilize video opacity |

