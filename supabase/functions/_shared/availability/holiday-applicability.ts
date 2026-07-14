/**
 * @deprecated — Import from `./availability-classifier.ts` instead.
 *
 * This file is a back-compat re-export shim only. All availability
 * primitives (region tokens, holiday applicability helpers) now live in
 * `availability-classifier.ts` as the SINGLE source of truth.
 *
 * A CI-gated test (`src/__tests__/availabilitySsotShimImports.test.ts`)
 * fails the build if any file — other than this shim itself — imports
 * from `holiday-applicability`. The runtime warning below is a second
 * layer for anything that slips past the static check.
 */

const _g = globalThis as unknown as { __availShimWarned_holidayApplicability?: boolean };
if (!_g.__availShimWarned_holidayApplicability) {
  _g.__availShimWarned_holidayApplicability = true;
  console.warn(
    "[availability-shim] holiday-applicability.ts is deprecated; " +
      "import from _shared/availability/availability-classifier.ts",
  );
}

export {
  parseHolidayRegionFromTitle,
  isFyiHolidayCalendar,
  matchesUserCountry,
  isApplicableHoliday,
  type RegionToken,
} from "./availability-classifier.ts";