

# Outer Readiness Brief -- Backend Migration & Rename (v3.0)

## Summary

Move all strategic theme logic, archetype unlock lines, pattern recognition, and theme persistence out of the client into a new edge function. Rename the feature from "Theme for Today" to "Outer Readiness Brief". Update tooltip and footer text. No visual/design changes.

---

## What Changes (User-Facing)

1. **Label**: "Theme for Today" becomes "Outer Readiness Brief"
2. **Tooltip**: Updated to the new copy ("Your Compass is where your inner world meets the outer demands...")
3. **Footer**: "Based on inner readiness score, circadian rhythm, calendar load, calendar pressure, and archetype" (dynamically lists only what was actually used)
4. **All scoring/theme content**: Invisible to user -- identical output, different source

---

## Architecture

### New Edge Function: `compute-outer-readiness`

A single edge function that receives inputs and returns the complete brief (theme phrase, context line, lean on, watch for, data sources). All proprietary logic lives here.

**Inputs received from client:**
- `innerReadinessTier` (depleted/managing/strong/peak)
- `innerReadinessScore` (0-100)
- `calendarLoad` (low/medium/high or null if no calendar)
- `calendarPressure` (low/medium/high or null if no calendar)
- `archetype` (string or null)
- `clarityLevel` (number, for C+C modifier flag)
- `confidenceLevel` (number, for C+C modifier flag)
- `userId` (from Auth0 token verification)

**What the edge function does internally:**
1. Fetches latest `user_coach_insights` (strength + growth_area) from DB
2. Fetches recent check-ins (last 7 days) for pattern recognition
3. Runs the complete v3.0 theme matrix (40 themes -- 10 per tier)
4. Runs the no-calendar fallback matrix (8 themes with sub-tier precision)
5. Runs Lean On / Watch For priority cascade (Coach -> C+C -> Archetype -> Tier fallback)
6. Runs pattern recognition override (3+ consecutive low-energy days)
7. Persists theme to `daily_themes` table
8. Returns: `{ phrase, context, leanOn, watchFor, driver, dataSources }`

**Security:** `verify_jwt = false` in config.toml (validates Auth0 token in code like other functions).

### Client Changes

**`StrategicIntentionCard.tsx`** -- Massive simplification:
- Remove all imports of `getStrategicTheme`, `determineArchetype`
- Remove archetype derivation logic (~40 lines)
- Remove coach insights query
- Remove recent check-ins query + pattern recognition (~60 lines)
- Remove theme persistence useEffect (~30 lines)
- Replace with single `useQuery` call to `compute-outer-readiness` edge function
- Render the 4 returned elements: phrase, context, leanOn, watchFor
- Update label to "Outer Readiness Brief"
- Update tooltip text
- Update footer data sources (from edge function response)

**`ExecutiveHome.tsx`** -- Minor update:
- The `getSubheadline()` currently calls `getStrategicTheme()` client-side for the hero subheadline
- Change to use the same edge function response (already cached by react-query from StrategicIntentionCard)
- Share the query key so both components use the same cached data

**`DailyRitual.tsx`** -- Minor update:
- Currently calls `getStrategicTheme()` to get `theme.phrase` and `theme.driver` for the Performance Plan engine
- Change to call `compute-outer-readiness` edge function (or read from shared react-query cache)
- Pass phrase + driver to performance plan engine as before

**`src/utils/energyStateScoring.ts`** -- Remove ~270 lines:
- Delete `getStrategicTheme()` function (lines 191-404)
- Delete `getArchetypeUnlock()` function (lines 147-189)
- Delete `ThemeDriver` type and `StrategicTheme` interface (lines 138-144)
- Keep: type exports, `getCalendarMetrics()`, `getTimeOfDay()`, `getEnergyTier()` -- these are still used elsewhere

### Database

**`daily_themes` table** -- Add columns:
- `lean_on` (text, nullable) -- for historical tracking
- `watch_for` (text, nullable) -- for historical tracking
- `inner_readiness_score` (integer, nullable) -- the score that drove the theme
- `archetype` (text, nullable) -- which archetype was active

No existing data is lost. New columns are nullable so existing rows remain valid.

---

## Technical Details

### Edge Function: `compute-outer-readiness/index.ts`

Contains the complete v3.0 architecture:

**Theme Matrix** (Section 2.5 from spec):
- 4 tiers x 10 conditions = 40 theme entries
- Each entry: phrase + context line
- Decision tree: tier -> pressure x load -> timeOfDay fallback
- Uses `innerReadinessTier` as primary branch (not checkInOutcome)

**No-Calendar Fallback** (Section 2.10):
- 8 entries with sub-tier precision using `innerReadinessScore`
- Depleted: 0-25 vs 26-39
- Managing: 40-49 vs 50-59
- Strong: 60-69 vs 70-74
- Peak: 75-89 vs 90-100

**Lean On / Watch For** (Section 2.8):
- Priority 1: Coach insights from `user_coach_insights` table
- Priority 2: C+C signal modifier (LOW_READINESS avg <= 2.5, HIGH_READINESS avg >= 4.5)
- Priority 3: Archetype x Tier matrix (5 archetypes x 4 tiers = 20 combos)
- Priority 4: Hardcoded tier fallback (4 entries)

**Pattern Recognition** (Section 2.9):
- Query last 7 days of check-ins
- Count consecutive depleted-tier days
- Override context line when 3+ consecutive days detected
- 3 state-specific signal messages

**Theme Persistence:**
- Upsert to `daily_themes` with all metadata including new lean_on/watch_for columns

### Config Addition

```toml
[functions.compute-outer-readiness]
verify_jwt = false
```

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/compute-outer-readiness/index.ts` | NEW -- all theme logic |
| `src/components/home/StrategicIntentionCard.tsx` | Simplify to thin client |
| `src/pages/ExecutiveHome.tsx` | Use edge function for subheadline |
| `src/components/home/DailyRitual.tsx` | Use edge function for theme |
| `src/utils/energyStateScoring.ts` | Remove getStrategicTheme + getArchetypeUnlock |
| `supabase/config.toml` | Add compute-outer-readiness entry |
| Database migration | Add columns to daily_themes |

