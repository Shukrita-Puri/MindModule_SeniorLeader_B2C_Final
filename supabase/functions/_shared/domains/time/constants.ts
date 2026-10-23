// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Time and Locale Domain Constants.
// Source: Part 2 Layer 2 (Section 4.1).

/** Lookahead window in days for upcoming public holidays at home (TL4). */
export const HOLIDAY_LOOKAHEAD_DAYS = 14;

/** Countries where Friday and Saturday form the weekend, and Saturday is the planning day (TL3). */
export const SATURDAY_WEEKEND_COUNTRIES = new Set([
  "SA", // Saudi Arabia
  "KW", // Kuwait
  "QA", // Qatar
  "BH", // Bahrain
  "OM", // Oman
  "IL", // Israel
]);

/**
 * Mapping of unambiguous single-country IANA time zones to ISO country codes.
 * Used for safe inference when user has not declared a home country (TL2).
 */
export const TIMEZONE_TO_SINGLE_COUNTRY: Record<string, string> = {
  "Europe/London": "GB",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Rome": "IT",
  "Europe/Madrid": "ES",
  "Europe/Amsterdam": "NL",
  "Europe/Stockholm": "SE",
  "Asia/Singapore": "SG",
  "Asia/Hong_Kong": "HK",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Pacific/Auckland": "NZ",
};
