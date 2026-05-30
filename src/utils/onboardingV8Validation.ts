// Client-side mirror of supabase/functions/_shared/onboardingV8Validation.ts.
// Keep these two files in sync.

export const STAKES_CHIPS = [
  "Board session", "Investor meeting", "Fundraise / capital raise", "M&A or due diligence",
  "Restructure or redundancy", "Earnings or reporting", "Major negotiation", "Conference or keynote",
  "Media or PR moment", "Crisis response", "Leadership hiring", "Performance review cycle",
] as const;

export const LOAD_CHIPS = [
  "Market pressure or headwinds", "Competitive disruption", "Regulatory or compliance shifts",
  "Team culture or morale", "Talent retention", "AI adoption pressure", "Board or investor relations",
  "Strategic ambiguity",
] as const;

export const BURDEN_CHIPS = [
  "Regular travel", "Multi-day conferences", "Back-to-back intensity", "Timezone shifting",
  "High interpersonal demand", "Disrupted recovery", "Decision overload", "Carrying unresolved decisions",
] as const;

export const GOAL_IDS = [
  "regulated", "prepare", "recover", "sustain",
  "decision", "people", "models", "patterns",
] as const;

export const BRIEF_TIMING = ["Morning", "Evening", "Use intelligence"] as const;
export const RESET_MODALITY = ["Sound", "Guided", "Mindset", "Use intelligence"] as const;
export const WEEKEND_SIGNALS = ["Reduce", "Keep"] as const;

export const CALENDAR_PROVIDERS = ["google", "outlook", "apple"] as const;
export const WEARABLE_PROVIDERS = ["apple-watch", "oura", "whoop"] as const;

export const MAX_GOALS = 3;
export const MAX_WRITING_URLS = 2;
export const MAX_FREETEXT_LEN = 8000;
export const MAX_URL_LEN = 2048;

export function normalizeUrl(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function isHttpUrl(raw: string): boolean {
  const s = normalizeUrl(raw);
  if (!s || s.length > MAX_URL_LEN) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export function isLinkedInUrl(raw: string): boolean {
  if (!isHttpUrl(raw)) return false;
  try {
    const u = new URL(normalizeUrl(raw));
    const host = u.hostname.toLowerCase();
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return false;
  }
}

export function parseWritingUrlsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_WRITING_URLS);
}