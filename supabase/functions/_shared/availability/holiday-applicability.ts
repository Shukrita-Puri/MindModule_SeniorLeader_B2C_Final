/**
 * Holiday applicability helpers.
 *
 * Distinguish user-relevant public holidays from FYI subscription entries
 * (e.g. Google's "Holidays in United Kingdom") and from region-qualified
 * holidays that don't apply to the user (e.g. "Bank Holiday (N Ireland)"
 * for a London-based user).
 *
 * Consumed exclusively by availability-classifier.ts. Not a rest-day gate
 * on its own.
 */

/** Region tokens the classifier understands. Extend as needed. */
export type RegionToken =
  | "GB"        // United Kingdom umbrella
  | "GB-ENG"    // England
  | "GB-WLS"    // Wales
  | "GB-SCT"    // Scotland
  | "GB-NIR"    // Northern Ireland
  | "US"        // United States
  | "IE"        // Ireland
  | "UNKNOWN";

/**
 * Parse a region qualifier from a holiday title, e.g.
 *   "Bank Holiday (N Ireland)"       -> "GB-NIR"
 *   "Bank Holiday (Scotland)"        -> "GB-SCT"
 *   "Bank Holiday (England & Wales)" -> "GB-ENG"
 *   "US Independence Day"            -> "US"
 * Returns UNKNOWN when no explicit qualifier is present.
 */
export function parseHolidayRegionFromTitle(
  title: string | null | undefined,
): RegionToken {
  if (!title) return "UNKNOWN";
  const t = title.toLowerCase();
  // Parenthesised qualifiers first.
  if (/\(n\.?\s*ireland\)|\bnorthern ireland\b/.test(t)) return "GB-NIR";
  if (/\(scotland\)|\bscotland\b/.test(t)) return "GB-SCT";
  if (/\(wales\)|\bwales\b/.test(t)) return "GB-WLS";
  if (/\(england(?:\s*&\s*wales)?\)|\bengland\b/.test(t)) return "GB-ENG";
  if (/\(uk\)|\bunited kingdom\b/.test(t)) return "GB";
  if (/\(us\)|\bunited states\b|\bu\.s\.\b/.test(t) || /^us\s/i.test(title))
    return "US";
  if (/\(ireland\)|\brepublic of ireland\b/.test(t)) return "IE";
  return "UNKNOWN";
}

/**
 * Detect an FYI subscription calendar (Google/Apple "Holidays in <Country>").
 * The signal usually appears in the event's source or calendarSummary field.
 */
export function isFyiHolidayCalendar(event: {
  source?: string | null;
  calendarSummary?: string | null;
}): boolean {
  const s = `${event.source ?? ""} ${event.calendarSummary ?? ""}`.toLowerCase();
  return /holidays?\s+in\s+/.test(s) || /\bpublic holidays\b/.test(s);
}

/**
 * Determine whether a subscription/title region matches the user's country.
 * Handles GB umbrella <-> GB-* subdivisions.
 */
export function matchesUserCountry(
  region: RegionToken,
  userCountry: string | null | undefined,
): boolean {
  if (!userCountry) return false;
  const u = userCountry.toUpperCase();
  if (region === "UNKNOWN") return false;
  if (region === u) return true;
  // GB umbrella covers all GB-* subdivisions and vice versa when we only
  // know umbrella.
  if (region === "GB" && u.startsWith("GB")) return true;
  if (u === "GB" && region.startsWith("GB")) return true;
  // ISO country like "GB" vs region "GB-ENG": exact-match branch above
  // handles it when u === region.
  return false;
}

/**
 * Decide whether a holiday-like event is applicable to the user.
 *
 *   - Non-all-day events NEVER count (they're informational, not off-days).
 *   - FYI subscription calendars: only applicable if the calendar's country
 *     matches the user; otherwise treat as informational.
 *   - Region-qualified titles: applicable only when the region matches.
 *   - Unqualified titles from a non-FYI calendar (e.g. user's own "PTO",
 *     "Vacation", or "Bank Holiday" without a region): applicable.
 */
export function isApplicableHoliday(
  event: {
    title: string;
    isAllDay?: boolean;
    source?: string | null;
    calendarSummary?: string | null;
  },
  userCountry: string | null | undefined,
): { applicable: boolean; region: RegionToken; reason: string } {
  if (!event.isAllDay) {
    return { applicable: false, region: "UNKNOWN", reason: "not_all_day" };
  }
  const titleRegion = parseHolidayRegionFromTitle(event.title);
  const fyi = isFyiHolidayCalendar(event);

  if (fyi) {
    // FYI feeds carry a country in the calendar name. If we can't match it
    // to the user, treat as informational.
    const summary =
      `${event.source ?? ""} ${event.calendarSummary ?? ""}`.toLowerCase();
    const feedRegion: RegionToken =
      /united kingdom|\buk\b/.test(summary)
        ? "GB"
        : /united states|\bus\b/.test(summary)
        ? "US"
        : /ireland/.test(summary)
        ? "IE"
        : titleRegion;
    const match =
      matchesUserCountry(feedRegion, userCountry) ||
      matchesUserCountry(titleRegion, userCountry);
    return {
      applicable: match,
      region: feedRegion === "UNKNOWN" ? titleRegion : feedRegion,
      reason: match ? "fyi_matches_user_country" : "fyi_foreign_country",
    };
  }

  if (titleRegion !== "UNKNOWN") {
    const match = matchesUserCountry(titleRegion, userCountry);
    return {
      applicable: match,
      region: titleRegion,
      reason: match ? "region_matches_user_country" : "region_foreign",
    };
  }

  // Unqualified all-day PTO/holiday title on the user's own calendar.
  return { applicable: true, region: "UNKNOWN", reason: "unqualified_all_day" };
}