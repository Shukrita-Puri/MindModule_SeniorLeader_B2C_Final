// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step TL2: Home Country and Region Resolution.
// Source: Part 2 Layer 2 (Section 4.1, TL2).
// Invariant: US is never assumed by default.

import { TIMEZONE_TO_SINGLE_COUNTRY } from "../constants.ts";
import type { TimeLocaleProfile, HomeCountryStatus } from "../types.ts";

export function stepResolveHome(profile: TimeLocaleProfile): {
  homeCountry: string | null;
  homeCountryStatus: HomeCountryStatus;
  homeRegion: string | null;
} {
  let homeCountry = profile.homeCountry ? profile.homeCountry.toUpperCase().trim() : null;
  let homeCountryStatus: HomeCountryStatus = "declared";

  if (!homeCountry) {
    // Attempt inference from device or home timezone if it uniquely maps to 1 country
    const tz = profile.deviceTimezone || profile.homeTimezone;
    if (tz && TIMEZONE_TO_SINGLE_COUNTRY[tz]) {
      homeCountry = TIMEZONE_TO_SINGLE_COUNTRY[tz];
      homeCountryStatus = "inferred";
    } else {
      homeCountry = null;
      homeCountryStatus = "missing";
    }
  }

  let homeRegion = profile.homeRegion ? profile.homeRegion.trim() : null;
  if (!homeRegion && profile.homeAnchorLocation?.countrySubdivision) {
    homeRegion = profile.homeAnchorLocation.countrySubdivision.trim();
  }

  return {
    homeCountry,
    homeCountryStatus,
    homeRegion,
  };
}
