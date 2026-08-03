/**
 * Canonical IANA timezone → ISO-3166 alpha-2 country map.
 * Shared across: compute-outer-readiness, smart-nudges, evaluate-week-ahead-mode,
 * generate-mastery-plan, persist-travel-location, sync-profile.
 * Only covers timezones relevant to the executive leadership user base.
 * Unknown timezones return null — callers fall back to profiles.country.
 */
export const TZ_TO_COUNTRY: Record<string, string> = {
  // UK
  "Europe/London": "GB", "Europe/Belfast": "GB",
  // US
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Los_Angeles": "US", "America/Phoenix": "US",
  "America/Anchorage": "US", "Pacific/Honolulu": "US",
  // Gulf (Fri-Sat weekend: SA, KW, QA, BH, OM — AE moved to Sat-Sun in 2021
  // but many AE users still operate on a Fri-Sat rhythm; map AE for completeness)
  "Asia/Dubai": "AE", "Asia/Abu_Dhabi": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Kuwait": "KW",
  "Asia/Qatar": "QA", "Asia/Doha": "QA",
  "Asia/Bahrain": "BH",
  "Asia/Muscat": "OM",
  // Israel (Fri-Sat weekend)
  "Asia/Jerusalem": "IL", "Asia/Tel_Aviv": "IL",
  // Europe (Sat-Sun weekend)
  "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE", "Europe/Madrid": "ES", "Europe/Rome": "IT",
  "Europe/Zurich": "CH", "Europe/Stockholm": "SE", "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL", "Europe/Vienna": "AT", "Europe/Prague": "CZ",
  "Europe/Lisbon": "PT", "Europe/Dublin": "IE",
  // Asia-Pacific (Sat-Sun weekend)
  "Asia/Singapore": "SG", "Asia/Hong_Kong": "HK",
  "Asia/Tokyo": "JP", "Asia/Seoul": "KR",
  "Asia/Kolkata": "IN", "Asia/Mumbai": "IN", "Asia/Calcutta": "IN",
  "Asia/Karachi": "PK", "Asia/Dhaka": "BD",
  "Asia/Bangkok": "TH", "Asia/Jakarta": "ID",
  "Asia/Kuala_Lumpur": "MY", "Asia/Manila": "PH",
  "Asia/Shanghai": "CN", "Asia/Beijing": "CN",
  // Oceania
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU", "Australia/Perth": "AU",
  "Australia/Adelaide": "AU", "Pacific/Auckland": "NZ",
  // Africa
  "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE", "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA", "Africa/Accra": "GH",
  // Americas
  "America/Toronto": "CA", "America/Vancouver": "CA",
  "America/Sao_Paulo": "BR", "America/Mexico_City": "MX",
  "America/Buenos_Aires": "AR", "America/Bogota": "CO",
  "America/Lima": "PE", "America/Santiago": "CL",
};

export function tzToCountry(tz: string | null | undefined): string | null {
  if (!tz) return null;
  return TZ_TO_COUNTRY[tz] ?? null;
}

/** Offset difference in hours between two IANA timezones at a given UTC time. */
export function tzOffsetDiffHours(tz1: string, tz2: string, atMs = Date.now()): number {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(new Date(atMs))
      .find((p) => p.type === "timeZoneName")?.value ?? "UTC+0";
  // Runtimes emit either "UTC+4" or "GMT+4" (and bare "GMT" for zero offset).
  const parse = (s: string) => {
    const m = s.match(/(?:UTC|GMT)([+-]\d+(?::\d+)?)?/);
    if (!m?.[1]) return 0;
    const [h, min = "0"] = m[1].split(":");
    return parseInt(h) + (parseInt(min) / 60) * Math.sign(parseInt(h));
  };
  return Math.abs(parse(fmt(tz1)) - parse(fmt(tz2)));
}
