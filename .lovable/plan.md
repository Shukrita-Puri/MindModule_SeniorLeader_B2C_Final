

# Navigation Restructuring: Feature-as-Destination Bottom Nav

## What Changes

The current 3-tab bottom nav (`Today | Reset | Insights`) becomes a 4-tab nav reflecting the product journey:

```text
Current:   Today  |  Reset  |  Insights
New:       Brief  |  Plan   |  Learn   |  Reset
```

**Mapping:**
- **Brief** → `/executive-home` (Performance Readiness Brief — already rendered there)
- **Plan** → `/executive-home/plan` (Today's 3 Performance Priorities — extracted to its own route)
- **Learn** → `/insights` (renamed from "Insights")
- **Reset** → `/recalibrate` (Reset Studio, unchanged)

**Coach hidden:** FloatingCoachButton removed from Layout render. CoachAccessButton in ExecutiveHome header already has `className="hidden"`. Coach route stays intact — no deletion.

**Sidebar:** Remove "Mind Performance Coach" from the LeftSidebar features array.

## Files Changed

### 1. `src/components/navigation/FloatingPillNav.tsx`
- Change TABS to 4 items: Brief, Plan, Learn, Reset
- Icons: `FileText` (Brief), `ListChecks` (Plan), `TrendingUp` (Learn), `Sparkles` (Reset)
- Paths: `/executive-home`, `/plan`, `/insights`, `/recalibrate`
- Reduce `minWidth` from 248 to 300 and `min-w` per button from 72px to 64px to fit 4 tabs

### 2. `src/App.tsx`
- Add new route `/plan` pointing to a new `PlanPage` component (wraps `TodayThreePriorities` + `DailyRitual` fallback in the same protected/guarded shell)
- Remove `FloatingCoachButton` from Layout render (line 129) — keep the import for future use
- Remove `/coach` from `COACH_VISIBLE_ROUTES` (empty the array or remove the coach visibility logic)
- Add `/plan` to `PILL_NAV_VISIBLE_ROUTES`

### 3. `src/pages/PlanPage.tsx` (new file)
- Simple page wrapper that renders `TodayThreePriorities` with the same hero/header pattern as ExecutiveHome but lighter (just a title + the priorities component)
- Includes `FloatingNavigation` back button to `/executive-home`

### 4. `src/pages/ExecutiveHome.tsx`
- Remove `TodayThreePriorities` and `DailyRitual` from the render — Brief page now only shows the Performance Readiness Brief + CheckInBanner
- Keep all imports, hooks, and data fetching intact (no logic changes)

### 5. `src/components/navigation/LeftSidebar.tsx`
- Remove the "Mind Performance Coach" entry from the `features` array (lines 43-48)

### 6. No changes to:
- Edge functions, LLM prompts, scoring logic, database, RLS policies
- DecisionReadinessBrief component
- TodayThreePriorities component (just moved to new page)
- Coach page/component (preserved, just hidden from nav)
- Any calculation or data flow

## Safety Notes
- Coach route `/coach` remains fully functional — only the floating button and sidebar link are hidden
- All existing deep links continue to work
- No database migrations required
- No edge function redeployment needed

