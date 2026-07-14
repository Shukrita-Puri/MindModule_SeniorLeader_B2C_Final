# Contributing

## Merge gate

`npm test` must pass before merge. It runs the full Vitest suite,
including the Availability SSOT shim-import guard at
`src/__tests__/availabilitySsotShimImports.test.ts`.

That guard fails the build if any file imports availability primitives
(`PTO_TITLE_RX`, `PERSONAL_HOLIDAY_TITLE_RX`, `parseHolidayRegionFromTitle`,
`isFyiHolidayCalendar`, `matchesUserCountry`, `isApplicableHoliday`,
`RegionToken`) from anywhere other than
`supabase/functions/_shared/availability/availability-classifier.ts`.

Do not disable or narrow that test — it exists to prevent the same class
of regional-holiday classification bug from re-appearing across surfaces
(Brief, Plan, Smart Nudges, Executive Home).

If a new availability rule pushes `availability-classifier.ts` past ~500
lines, split internals into an `availability/` sub-folder (`regex.ts`,
`regions.ts`, `classifier-core.ts`) and keep the classifier file as the
public re-export barrel so consumers keep one import path.