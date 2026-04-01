

## Problem: Evening Never Reaches Evening Logic

The entire bug is a **control flow issue** in `getTheme()`. For every tier, the pressure×load matrix (e.g., `pressure === 'high' && load === 'medium'`) is evaluated **before** the `timeOfDay` checks. When calendar data exists, one of those branches almost always matches, returning forward-looking language like "High-stakes moments ahead" or "Steadiness through the full weight of the day." The carefully built `buildWeekdayEveningTheme()` is only reached as an unreachable fallback.

This is why the user sees "Steady into the stakes" + "High-stakes moments ahead with a manageable schedule" at 7pm — the evening builder is completely bypassed.

### The Fix

For each tier block in `getTheme()`, **move the evening check above the pressure×load matrix**, so evening always routes to evening-specific logic when `timeOfDay === 'evening'`.

Current order (all 4 tiers):
```text
1. pressure×load branches (return generic day-ahead language)
2. morning check → buildMorningTheme()
3. afternoon check → buildAfternoonContext()
4. evening check → buildWeekdayEveningTheme()  ← UNREACHABLE when calendar exists
```

New order (all 4 tiers):
```text
1. evening check → buildWeekdayEveningTheme()  ← ALWAYS fires in evening
2. morning check → buildMorningTheme()
3. afternoon check → buildAfternoonContext()
4. pressure×load branches (only for morning/afternoon now)
```

### Specific Changes in `getTheme()`

**For each of the 4 tier blocks** (depleted ~L706, managing ~L749, strong ~L791, peak ~L833):

1. Move the `if (timeOfDay === 'evening')` block (including Sunday, Friday, and weekday evening sub-branches) to the **top** of the tier block, before any pressure×load checks.

2. Move the `if (timeOfDay === 'morning')` and `if (timeOfDay === 'afternoon')` checks to just after the evening block, before the pressure×load matrix.

3. The pressure×load matrix remains but now only handles morning/afternoon (since evening and morning/afternoon exit before reaching it).

This means `buildWeekdayEveningTheme()` — with its today-acknowledgment, tomorrow-as-recovery-motivation, sleep/RHR notes, and retrospective framing — will always be the code path for evening periods. The context suffix via `buildContextSuffix()` already has evening-specific retrospective framing, so any remaining callers that still use `+ suffix` will also get correct evening language.

### No New Logic Needed

All the evening-specific logic (today acknowledgment, retrospective framing, RHR/sleep notes, restoration language) already exists in `buildWeekdayEveningTheme()` and the evening branch of `buildContextSuffix()`. The problem is purely that these paths are never reached. Reordering the control flow is the complete fix.

### Also Fix `getNoCalendarTheme()`

Same pattern exists here: the tier sub-score branches (e.g., `score <= 25`) at the bottom of each tier block are reached even during evening when `lateEvening` is false (hour 18-20). Need to add `timeOfDay === 'evening'` routing in each tier block of `getNoCalendarTheme()` to call `buildWeekdayEveningTheme()` for non-late evenings too.

