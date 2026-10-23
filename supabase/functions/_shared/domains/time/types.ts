// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Time and Locale Domain Types.
// Source: Part 2 Layer 2 (Section 4.1).

export interface TimeLocaleProfile {
  homeCountry?: string | null;
  homeRegion?: string | null;
  homeTimezone?: string | null;
  deviceTimezone?: string | null;
  homeAnchorLocation?: {
    countrySubdivision?: string | null;
    city?: string | null;
  } | null;
}

export interface PublicHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  country: string;
  region?: string | null;
  source: "dataset" | "calendar" | "lookup";
}

export type HomeCountryStatus = "declared" | "inferred" | "missing";

export interface TimeLocaleFacts {
  localDate: string; // YYYY-MM-DD in effective timezone
  weekday: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  dayBounds: {
    startIso: string;
    endIso: string;
  };
  effectiveTimezone: string;
  homeCountry: string | null;
  homeCountryStatus: HomeCountryStatus;
  homeRegion: string | null;
  weekendDays: number[]; // e.g. [0, 6] or [5, 6]
  planningDay: number; // e.g. 0 (Sun) or 6 (Sat)
  isWeekendDay: boolean;
  publicHolidays: PublicHoliday[];
}
