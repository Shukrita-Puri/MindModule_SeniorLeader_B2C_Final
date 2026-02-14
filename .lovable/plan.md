

# Validation: Energy Rhythm Does Not Need Raw Score

## Finding

The Energy Rhythm heatmap (`EnergyRhythm.tsx`) uses **only two fields** from check-in data:

- **`outcome`** — the felt state string (focused, steady, scattered, overwhelmed, drained)
- **`timestamp`** — used to place the dot in the correct time-of-day x day-of-week cell

It does **not** reference `energy_balance` anywhere.

## Where `energy_balance` IS used on the Insights page

The Insights page fetches `energy_balance` from `daily_checkins` for the **weekly trend line** (the 7-day energy chart showing daily composite scores). This is a separate component from Energy Rhythm.

## Conclusion

No changes needed. Removing the raw felt state score from the `SAVE_CHECKIN` payload and only writing the composite score via `UPDATE_ENERGY_BALANCE` will not affect Energy Rhythm or any other Insights feature.

The fix from the previous plan (stop writing raw score in SAVE_CHECKIN, write composite score via UPDATE_ENERGY_BALANCE) remains safe to implement.

### Step 1: Remove raw `energy_balance` from SAVE_CHECKIN

In `src/pages/DailyCheckIn.tsx`, remove the `energy_balance: energyBalance` field from the `saveCheckin()` call and delete the `getCheckInBalance()` helper function. The composite score will be written later by `computeEnergyState()` via the `UPDATE_ENERGY_BALANCE` action.

### Step 2: Remove duplicate `const today` in energyStateEngine.ts

There are two `const today` declarations in the `computeEnergyState` function. Remove the duplicate to avoid the variable shadowing issue.

