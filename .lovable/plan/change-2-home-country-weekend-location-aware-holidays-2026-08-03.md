# Change 2 — Home-country weekend + location-aware holidays

## Scope
A single, isolated edit in `supabase/functions/compute-outer-readiness/index.ts`:

1. Replace the timezone-derived weekend/country block (lines 4634–4636) so that:
   - `localeWeekendHomeCountry` always derives from the user's **home** country (`preferences.home_country` first, then timezone-mapped home country).
   - A new `currentLocationCountry` variable captures the country of the user's current location for public-holiday lookups only.

2. In the holiday lookup block immediately below (lines 4641–4653), replace `userCountry` with `currentLocationCountry` so public holidays remain location-aware.

`localeWeekendHomeCountry` is left untouched everywhere else in the file.

## Exact change

```text
Before (4634–4636):
  const userTz = effectiveCurrentTz || effectiveHomeTz;
  const userCountry = tzToCountry(userTz);
  localeWeekendHomeCountry = userCountry ?? tzToCountry(effectiveHomeTz);

After:
  // Weekend and planning day always derive from HOME country (D1).
  // A UK user in Dubai keeps a Saturday-Sunday weekend — their planning cycle
  // does not change because they are travelling.
  // currentLocationCountry is kept separately for public holiday lookups only.
  const profileHomeCountry = leaderProfile?.preferences?.home_country ?? null;
  const homeTzCountry = tzToCountry(effectiveHomeTz);
  localeWeekendHomeCountry = profileHomeCountry ?? homeTzCountry;
  const currentLocationCountry = tzToCountry(effectiveCurrentTz) ?? homeTzCountry;
```

```text
Holiday lookup (4641–4653):
  Replace `userCountry` with `currentLocationCountry` in both the
  `if (userCountry && HOLIDAYS[userCountry])` guard and the two
  `HOLIDAYS[userCountry].find(...)` calls.
```

## Verification
- Run `tsgo` on the project and confirm zero TypeScript errors.
- (Sanity) Confirm with `rg` that `localeWeekendHomeCountry` still appears only in its existing downstream usages and `currentLocationCountry` is introduced only in the holiday block.

## Out of scope
No edge-function deployment, no test changes, no other file edits.
